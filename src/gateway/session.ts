import { generateSessionId } from '../utils/crypto.js';
import { getLogger } from '../utils/logger.js';

const log = getLogger('session');

export interface Session {
  id: string;
  userId: string;
  channelType: string;
  channelId: string;
  conversationType: 'dm' | 'group';
  groupId?: string;
  sdkSessionId?: string;
  model?: string;
  totalCostUsd: number;
  createdAt: number;
  lastActiveAt: number;
  metadata: Record<string, unknown>;
}

export interface SessionManagerOptions {
  timeoutMinutes: number;
  maxConcurrent: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private options: SessionManagerOptions;

  constructor(options: SessionManagerOptions) {
    this.options = options;
  }

  /**
   * 生成会话查找键
   */
  private sessionKey(channelType: string, senderId: string, conversationType: string, groupId?: string): string {
    if (conversationType === 'group' && groupId) {
      return `${channelType}:${groupId}:${senderId}`;
    }
    return `${channelType}:dm:${senderId}`;
  }

  /**
   * 获取或创建会话
   */
  getOrCreate(
    channelType: string,
    senderId: string,
    conversationType: 'dm' | 'group',
    groupId?: string,
  ): Session {
    const key = this.sessionKey(channelType, senderId, conversationType, groupId);
    let session = this.sessions.get(key);

    if (session) {
      session.lastActiveAt = Date.now();
      return session;
    }

    if (this.sessions.size >= this.options.maxConcurrent) {
      this.evictOldest();
    }

    session = {
      id: generateSessionId(),
      userId: senderId,
      channelType,
      channelId: key,
      conversationType,
      groupId,
      totalCostUsd: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      metadata: {},
    };

    this.sessions.set(key, session);
    log.info({ sessionId: session.id, key }, '会话已创建');
    return session;
  }

  /**
   * 获取会话
   */
  get(sessionId: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.id === sessionId) return session;
    }
    return undefined;
  }

  /**
   * 删除会话
   */
  remove(sessionId: string): boolean {
    for (const [key, session] of this.sessions) {
      if (session.id === sessionId) {
        this.sessions.delete(key);
        log.info({ sessionId }, '会话已移除');
        return true;
      }
    }
    return false;
  }

  /**
   * 清理过期会话
   */
  cleanup(): number {
    const timeoutMs = this.options.timeoutMinutes * 60 * 1000;
    const now = Date.now();
    let removed = 0;

    for (const [key, session] of this.sessions) {
      if (now - session.lastActiveAt > timeoutMs) {
        this.sessions.delete(key);
        log.debug({ sessionId: session.id }, '会话已过期清理');
        removed++;
      }
    }

    if (removed > 0) {
      log.info({ removed, remaining: this.sessions.size }, '会话清理完成');
    }
    return removed;
  }

  /**
   * 淘汰最旧的会话
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, session] of this.sessions) {
      if (session.lastActiveAt < oldestTime) {
        oldestTime = session.lastActiveAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const session = this.sessions.get(oldestKey);
      this.sessions.delete(oldestKey);
      log.info({ sessionId: session?.id }, '会话已淘汰（达到最大并发数）');
    }
  }

  /**
   * 启动定期清理
   */
  startGC(intervalMs = 60_000): void {
    this.stopGC();
    this.gcTimer = setInterval(() => this.cleanup(), intervalMs);
    log.debug('会话 GC 已启动');
  }

  /**
   * 停止定期清理
   */
  stopGC(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  /**
   * 当前活跃会话数
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * 获取所有会话
   */
  listAll(): Session[] {
    return Array.from(this.sessions.values());
  }
}
