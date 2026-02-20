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

  // 1. Active sessions from SessionManager
  const activeSessions = sessionManager.listAll().filter(s => s.userId === userId);
  for (const s of activeSessions) {
    rows.push({
      key: s.channelId,
      kind: s.conversationType === 'group' ? 'group' : 'direct',
      label: `Session ${s.id.slice(4, 12)}`,
      displayName: s.channelType,
      updatedAt: s.lastActiveAt,
      sessionId: s.id,
    });
  }

  // 2. Archived sessions from memory
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

export function handleSessionsPatch(reqId: string): ResponseFrame {
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

  log.info({ key, removedActive, removedArchived, deleteTranscript: !!params.deleteTranscript }, 'Session deleted');

  return okResponse(reqId, { deleted: true, key });
}
