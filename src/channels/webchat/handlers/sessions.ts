import type { ResponseFrame } from '../protocol.js';
import { okResponse, errorResponse } from '../protocol.js';
import type { SessionManager } from '../../../gateway/session.js';
import type { MemoryStore } from '../../../memory/interface.js';
import type { ChatHistoryStore } from '../history-store.js';
import { getLogger } from '../../../utils/logger.js';

const log = getLogger('webchat:sessions');

/**
 * GatewaySessionRow — matches the UI's expected format.
 */
interface GatewaySessionRow {
  key: string;
  kind: 'direct' | 'group' | 'global' | 'unknown';
  label?: string;
  displayName?: string;
  updatedAt: number | null;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
}

export async function handleSessionsList(
  reqId: string,
  sessionManager: SessionManager,
  memory: MemoryStore,
  userId: string,
): Promise<ResponseFrame> {
  const rows: GatewaySessionRow[] = [];

  // 1. Active sessions from SessionManager (skip webchat — handled by chat-history in step 3)
  const activeSessions = sessionManager.listAll().filter(s => s.userId === userId);
  for (const s of activeSessions) {
    if (s.channelType === 'webchat') continue;
    rows.push({
      key: s.channelId,
      kind: s.conversationType === 'group' ? 'group' : 'direct',
      label: `Session ${s.id.slice(4, 12)}`,
      displayName: s.channelType,
      updatedAt: s.lastActiveAt,
      sessionId: s.id,
    });
  }

  // 2. Archived sessions from memory (skip webchat — handled by chat-history in step 3)
  const historyNamespace = `sdk-session-history:${userId}`;
  try {
    const entries = await memory.list(historyNamespace);
    for (const entry of entries) {
      try {
        const data = JSON.parse(entry.value) as {
          sdkSessionId: string;
          channelId?: string;
          createdAt: number;
          lastActiveAt: number;
          preview: string;
        };
        // Skip webchat archived sessions — they are discovered from chat-history in step 3
        if (data.channelId?.startsWith('webchat:')) continue;
        // Avoid duplicates with active sessions
        const alreadyListed = activeSessions.some(s => s.sdkSessionId === data.sdkSessionId);
        if (!alreadyListed) {
          rows.push({
            key: data.channelId || `archived:${data.sdkSessionId.slice(0, 12)}`,
            kind: 'direct',
            label: data.preview || 'Archived session',
            updatedAt: data.lastActiveAt,
            sessionId: data.sdkSessionId,
          });
        }
      } catch {
        // Skip malformed entries
      }
    }
  } catch {
    // Memory read failure is non-fatal
  }

  // 3. Discover sessions from persisted chat history namespaces
  const CHAT_HISTORY_PREFIX = 'chat-history:';
  try {
    const chatNamespaces = await memory.listNamespaces(CHAT_HISTORY_PREFIX);
    for (const ns of chatNamespaces) {
      const sessionKey = ns.slice(CHAT_HISTORY_PREFIX.length);
      if (rows.some(r => r.key === sessionKey)) continue;

      const chatEntries = await memory.list(ns, 'msg:');
      if (chatEntries.length === 0) continue;

      // Check for user-defined label
      let customLabel: string | null = null;
      try {
        const metaRaw = await memory.get(SESSION_META_NAMESPACE, sessionKey);
        if (metaRaw) {
          const meta = JSON.parse(metaRaw) as { label?: string | null };
          if (meta.label) customLabel = meta.label;
        }
      } catch { /* ignore */ }

      const sorted = chatEntries.sort((a, b) => a.updatedAt - b.updatedAt);
      const lastEntry = sorted[sorted.length - 1];
      let updatedAt = lastEntry.updatedAt;
      let label = customLabel ?? 'Chat';
      if (!customLabel) {
        try {
          const msg = JSON.parse(lastEntry.value) as {
            role: string;
            content: Array<{ type: string; text?: string }>;
            timestamp: number;
          };
          updatedAt = msg.timestamp || updatedAt;
          const firstUserMsg = sorted.find(e => {
            try {
              const m = JSON.parse(e.value) as { role: string; content: Array<{ text?: string }> };
              return m.role === 'user' && m.content[0]?.text;
            } catch { return false; }
          });
          if (firstUserMsg) {
            const m = JSON.parse(firstUserMsg.value) as { content: Array<{ text?: string }> };
            label = (m.content[0]?.text ?? 'Chat').slice(0, 60);
          }
        } catch {
          // Use defaults
        }
      } else {
        try {
          const msg = JSON.parse(lastEntry.value) as { timestamp: number };
          updatedAt = msg.timestamp || updatedAt;
        } catch { /* use default */ }
      }
      rows.push({
        key: sessionKey,
        kind: 'direct',
        label,
        displayName: 'webchat',
        updatedAt,
      });
    }
  } catch {
    // Non-fatal
  }

  // Sort by updatedAt descending
  rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  return okResponse(reqId, {
    ts: Date.now(),
    path: 'memory://sqlite',
    count: rows.length,
    defaults: {
      model: null,
      contextTokens: null,
    },
    sessions: rows,
  });
}

const SESSION_META_NAMESPACE = 'session-meta';

export async function handleSessionsPatch(
  reqId: string,
  params: { key?: string; label?: string },
  memory: MemoryStore,
): Promise<ResponseFrame> {
  const key = params?.key;
  if (!key) {
    return errorResponse(reqId, 'BAD_PARAMS', 'key is required');
  }

  const meta: Record<string, unknown> = {};
  if ('label' in params) {
    meta.label = params.label ?? null;
  }

  await memory.set(SESSION_META_NAMESPACE, key, JSON.stringify(meta));
  log.info({ key, meta }, 'Session patched');
  return okResponse(reqId);
}

export async function handleSessionsDelete(
  reqId: string,
  params: { key?: string; deleteTranscript?: boolean },
  sessionManager: SessionManager,
  memory: MemoryStore,
  historyStore: ChatHistoryStore,
  userId: string,
): Promise<ResponseFrame> {
  const key = params?.key;
  if (!key) {
    return errorResponse(reqId, 'BAD_PARAMS', 'key is required');
  }

  let removedActive = false;

  // 1. Remove from active sessions (match by channelId)
  const activeSessions = sessionManager.listAll().filter(
    s => s.userId === userId && s.channelId === key,
  );
  for (const s of activeSessions) {
    sessionManager.remove(s.id);
    removedActive = true;
  }

  // 2. Remove archived session entry from memory
  const historyNamespace = `sdk-session-history:${userId}`;
  let removedArchived = false;
  try {
    const entries = await memory.list(historyNamespace);
    for (const entry of entries) {
      try {
        const data = JSON.parse(entry.value) as {
          sdkSessionId: string;
          channelId?: string;
        };
        const archiveKey = data.channelId || `archived:${data.sdkSessionId.slice(0, 12)}`;
        if (archiveKey === key) {
          await memory.delete(historyNamespace, entry.key);
          removedArchived = true;
        }
      } catch {
        // Skip malformed entries
      }
    }
  } catch {
    // Memory read failure is non-fatal
  }

  // 3. Optionally delete chat transcript
  if (params.deleteTranscript) {
    try {
      await historyStore.clearHistory(key);
    } catch (err) {
      log.warn({ error: err, key }, 'Failed to clear chat history during session delete');
    }
  }

  // 4. Clean up session metadata
  try {
    await memory.delete(SESSION_META_NAMESPACE, key);
  } catch { /* non-fatal */ }

  log.info({ key, removedActive, removedArchived, deleteTranscript: !!params.deleteTranscript }, 'Session deleted');

  return okResponse(reqId, { deleted: true, key });
}
