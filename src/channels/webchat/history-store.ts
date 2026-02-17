import type { MemoryStore } from '../../memory/interface.js';

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  timestamp: number;
  runId?: string;
}

/**
 * ChatHistoryStore — persists chat messages per session using MemoryStore.
 *
 * Namespace: `chat-history:{sessionKey}`
 * Key: `msg:{timestamp}:{seq}`
 */
export class ChatHistoryStore {
  private seqCounters = new Map<string, number>();

  constructor(private memory: MemoryStore) {}

  async appendMessage(sessionKey: string, msg: StoredMessage): Promise<void> {
    const namespace = `chat-history:${sessionKey}`;
    const seq = (this.seqCounters.get(namespace) ?? 0) + 1;
    this.seqCounters.set(namespace, seq);
    const key = `msg:${msg.timestamp}:${String(seq).padStart(6, '0')}`;
    await this.memory.set(namespace, key, JSON.stringify(msg));
  }

  async getHistory(sessionKey: string, limit = 100): Promise<StoredMessage[]> {
    const namespace = `chat-history:${sessionKey}`;
    const entries = await this.memory.list(namespace, 'msg:');
    const messages = entries
      .map(e => {
        try {
          return JSON.parse(e.value) as StoredMessage;
        } catch {
          return null;
        }
      })
      .filter((m): m is StoredMessage => m !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Return last `limit` messages
    return messages.slice(-limit);
  }
}
