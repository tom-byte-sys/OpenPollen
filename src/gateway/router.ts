import { getLogger } from '../utils/logger.js';
import type { InboundMessage } from '../channels/interface.js';
import type { SessionManager, Session } from './session.js';
import type { AgentRunner } from '../agent/runner.js';

const log = getLogger('router');

export interface RouterOptions {
  sessionManager: SessionManager;
  agentRunner: AgentRunner;
}

export class MessageRouter {
  private sessionManager: SessionManager;
  private agentRunner: AgentRunner;
  private processing = new Set<string>();

  constructor(options: RouterOptions) {
    this.sessionManager = options.sessionManager;
    this.agentRunner = options.agentRunner;
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
      return response;
    } catch (error) {
      log.error({ sessionId: session.id, error }, '消息处理失败');
      return '抱歉，处理消息时出错了，请稍后再试。';
    } finally {
      this.processing.delete(session.id);
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
