import type { ResponseFrame } from '../protocol.js';
import { okResponse } from '../protocol.js';
import type { SessionManager } from '../../../gateway/session.js';
import type { MemoryStore } from '../../../memory/interface.js';

export interface SessionListItem {
  id: string;
  sessionKey: string;
  title: string;
  lastActiveAt: number;
  createdAt: number;
  preview?: string;
}

export async function handleSessionsList(
  reqId: string,
  sessionManager: SessionManager,
  memory: MemoryStore,
  userId: string,
): Promise<ResponseFrame> {
  const items: SessionListItem[] = [];

  // 1. Active sessions from SessionManager
  const activeSessions = sessionManager.listAll().filter(s => s.userId === userId);
  for (const s of activeSessions) {
    items.push({
      id: s.id,
      sessionKey: s.channelId,
      title: `Session ${s.id.slice(4, 12)}`,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
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
          createdAt: number;
          lastActiveAt: number;
          preview: string;
        };
        // Avoid duplicates with active sessions
        const alreadyListed = items.some(i =>
          activeSessions.some(s => s.sdkSessionId === data.sdkSessionId),
        );
        if (!alreadyListed) {
          items.push({
            id: data.sdkSessionId,
            sessionKey: `archived:${data.sdkSessionId.slice(0, 12)}`,
            title: data.preview || `Archived session`,
            lastActiveAt: data.lastActiveAt,
            createdAt: data.createdAt,
            preview: data.preview,
          });
        }
      } catch {
        // Skip malformed entries
      }
    }
  } catch {
    // Memory read failure is non-fatal
  }

  // Sort by lastActiveAt descending
  items.sort((a, b) => b.lastActiveAt - a.lastActiveAt);

  return okResponse(reqId, { sessions: items });
}

export function handleSessionsPatch(reqId: string): ResponseFrame {
  return okResponse(reqId);
}
