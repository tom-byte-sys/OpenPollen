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
  private _sessionManager: SessionManager;
  private agentRunner: AgentRunner;
  private _memory: MemoryStore;
  private processing = new Set<string>();

  constructor(options: RouterOptions) {
    this._sessionManager = options.sessionManager;
    this.agentRunner = options.agentRunner;
    this._memory = options.memory;
  }

  get sessionManager(): SessionManager {
    return this._sessionManager;
  }

  get memory(): MemoryStore {
    return this._memory;
  }

  /**
   * 处理入站消息：查找/创建会话 → 路由到 Agent
   */
  async handleMessage(message: InboundMessage, onChunk?: (text: string, type?: 'text' | 'thinking') => void): Promise<string> {
    // 检测命令
    const trimmed = (message.content.text ?? '').trim();
    if (trimmed === '/new') return this.handleNewSession(message);
    if (trimmed.startsWith('/resume')) return this.handleResumeSession(message, trimmed);
    if (trimmed === '/market') return '技能市场: 请访问 OpenPollen 控制台查看\n\n也可以使用 CLI 搜索和安装:\n  openpollen skill search <keyword>\n  openpollen skill install <name>';

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

      const response = await this.agentRunner.run(session, userText, onChunk);

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
   * 处理 /new 命令：归档当前会话，下次消息开始新对话
   */
  private async handleNewSession(message: InboundMessage): Promise<string> {
    const session = this.sessionManager.getOrCreate(
      message.channelType,
      message.senderId,
      message.conversationType,
      message.groupId,
    );

    try {
      if (session.sdkSessionId) {
        // 归档当前 sdkSessionId 到会话历史
        const historyNamespace = `sdk-session-history:${session.userId}`;
        const existing = await this.memory.get(historyNamespace, session.sdkSessionId);
        if (existing) {
          // 已有历史记录，保留原始数据（lastActiveAt 已由 runner 维护）
        } else {
          // 首次归档（理论上 runner 已自动创建，此处作为兜底）
          const entry = {
            sdkSessionId: session.sdkSessionId,
            createdAt: session.createdAt,
            lastActiveAt: session.lastActiveAt,
            preview: '',
          };
          await this.memory.set(historyNamespace, session.sdkSessionId, JSON.stringify(entry));
        }

        // 删除当前活跃记录
        await this.memory.delete('sdk-sessions', session.channelId);
      }

      // 从 SessionManager 中删除当前 Session
      this.sessionManager.remove(session.id);

      log.info({ sessionId: session.id, userId: session.userId }, '/new 会话已重置');
      return '会话已重置，下次消息将开始新对话';
    } catch (error) {
      log.error({ error, sessionId: session.id }, '/new 命令处理失败');
      return '重置会话失败，请稍后再试';
    }
  }

  /**
   * 处理 /resume 命令：列出或恢复历史会话
   */
  private async handleResumeSession(message: InboundMessage, command: string): Promise<string> {
    const historyNamespace = `sdk-session-history:${message.senderId}`;
    const arg = command.slice('/resume'.length).trim();

    try {
      // 加载历史会话列表
      const entries = await this.memory.list(historyNamespace);
      if (entries.length === 0) {
        return '没有历史会话记录';
      }

      // 解析并按 lastActiveAt 倒序排列
      const parsed = entries
        .map(e => {
          try {
            const data = JSON.parse(e.value) as {
              sdkSessionId: string;
              createdAt: number;
              lastActiveAt: number;
              preview: string;
            };
            return data;
          } catch {
            return null;
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt);

      if (parsed.length === 0) {
        return '没有历史会话记录';
      }

      // 无参数 → 列出历史
      if (!arg) {
        return this.formatSessionList(parsed);
      }

      // 有参数 → 恢复指定会话
      const index = parseInt(arg, 10);
      if (isNaN(index) || index < 1 || index > parsed.length) {
        return `无效的会话编号，请输入 1 到 ${parsed.length} 之间的数字`;
      }

      const target = parsed[index - 1];
      const session = this.sessionManager.getOrCreate(
        message.channelType,
        message.senderId,
        message.conversationType,
        message.groupId,
      );

      // 设置 sdkSessionId 为选中的历史 ID
      session.sdkSessionId = target.sdkSessionId;

      // 持久化到 memory
      await this.memory.set('sdk-sessions', session.channelId, target.sdkSessionId);

      log.info({
        sessionId: session.id,
        sdkSessionId: target.sdkSessionId,
        userId: message.senderId,
      }, '/resume 已恢复历史会话');

      return `已恢复会话 #${index}`;
    } catch (error) {
      log.error({ error, userId: message.senderId }, '/resume 命令处理失败');
      return '恢复会话失败，请稍后再试';
    }
  }

  /**
   * 格式化历史会话列表
   */
  private formatSessionList(entries: Array<{ sdkSessionId: string; createdAt: number; lastActiveAt: number; preview: string }>): string {
    const lines = entries.map((e, i) => {
      const date = new Date(e.lastActiveAt);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      const preview = e.preview || '(无预览)';
      return `${i + 1}. [${dateStr}] ${preview}`;
    });

    return `历史会话列表：\n${lines.join('\n')}\n\n发送 /resume 1 恢复对应会话`;
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
