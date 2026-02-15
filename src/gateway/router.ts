import { getLogger } from '../utils/logger.js';
import type { InboundMessage } from '../channels/interface.js';
import type { SessionManager } from './session.js';
import type { AgentRunner } from '../agent/runner.js';
import type { MemoryStore } from '../memory/interface.js';

const log = getLogger('router');

const SUMMARY_TTL = 604800; // 7 天
const MAX_SUMMARIES = 5;

export interface RouterOptions {
  sessionManager: SessionManager;
  agentRunner: AgentRunner;
  memory: MemoryStore;
}

export class MessageRouter {
  private sessionManager: SessionManager;
  private agentRunner: AgentRunner;
  private memory: MemoryStore;
  private processing = new Set<string>();

  constructor(options: RouterOptions) {
    this.sessionManager = options.sessionManager;
    this.agentRunner = options.agentRunner;
    this.memory = options.memory;
  }

  /**
   * 处理入站消息：查找/创建会话 → 路由到 Agent
   */
  async handleMessage(message: InboundMessage): Promise<string> {
    const session = this.sessionManager.getOrCreate(
      message.channelType,
      message.senderId,
      message.conversationType,
      message.groupId,
    );

    // 防止同一会话并发处理
    if (this.processing.has(session.id)) {
      log.warn({ sessionId: session.id }, '会话正在处理中，请稍后');
      return '正在处理上一条消息，请稍后再试...';
    }

    this.processing.add(session.id);

    try {
      log.info({
        sessionId: session.id,
        senderId: message.senderId,
        channelType: message.channelType,
        contentType: message.content.type,
      }, '路由消息到 Agent');

      const userText = message.content.text ?? '';
      if (!userText.trim()) {
        return '请发送文本消息';
      }

      const response = await this.agentRunner.run(session, userText);

      // Layer 2: 存储对话摘要到用户命名空间
      await this.storeConversationSummary(message.senderId, userText, response);

      return response;
    } catch (error) {
      log.error({ sessionId: session.id, error }, '消息处理失败');
      return '抱歉，处理消息时出错了，请稍后再试。';
    } finally {
      this.processing.delete(session.id);
    }
  }

  /**
   * 存储对话摘要到用户命名空间
   */
  private async storeConversationSummary(senderId: string, question: string, answer: string): Promise<void> {
    try {
      const namespace = `user:${senderId}`;
      const summary = `Q: ${question.slice(0, 100)} → A: ${answer.slice(0, 200)}`;
      const key = `summary:${Date.now()}`;

      await this.memory.set(namespace, key, summary, SUMMARY_TTL);

      // 清理旧条目，保留最近 MAX_SUMMARIES 条
      const entries = await this.memory.list(namespace);
      if (entries.length > MAX_SUMMARIES) {
        const toDelete = entries
          .sort((a, b) => a.createdAt - b.createdAt)
          .slice(0, entries.length - MAX_SUMMARIES);

        for (const entry of toDelete) {
          await this.memory.delete(namespace, entry.key);
        }
      }
    } catch (err) {
      log.warn({ error: err, senderId }, '存储对话摘要失败');
    }
  }

  /**
   * 获取消息路由器统计
   */
  getStats(): { activeSessions: number; processingCount: number } {
    return {
      activeSessions: this.sessionManager.size,
      processingCount: this.processing.size,
    };
  }
}
