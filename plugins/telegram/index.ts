import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { getLogger } from '../../src/utils/logger.js';
import { generateId } from '../../src/utils/crypto.js';
import type { ChannelPlugin, PluginManifest } from '../../src/plugins/types.js';
import type { InboundMessage, OutboundMessage } from '../../src/channels/interface.js';
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';

const log = getLogger('telegram');

const MAX_MESSAGE_LENGTH = 4096;
const DEFAULT_POLLING_TIMEOUT = 30;
const API_BASE = 'https://api.telegram.org';
const UPLOADS_DIR = resolve(process.env.HOME ?? '/tmp', '.openpollen', 'sdk-workspace', 'uploads');

interface TelegramConfig {
  token: string;
  pollingTimeout?: number;
  groupPolicy: 'mention' | 'all';
  proxy?: string;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}

interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  user?: TelegramUser;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  photo?: TelegramPhotoSize[];
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export default class TelegramPlugin implements ChannelPlugin {
  manifest: PluginManifest = {
    name: 'telegram',
    version: '1.0.0',
    slot: 'channel',
    description: 'Telegram Bot 聊天平台适配器 (Long Polling)',
  };
  readonly name = 'telegram';
  readonly type = 'telegram';

  private config!: TelegramConfig;
  private messageHandler?: (message: InboundMessage) => Promise<string | void>;
  private healthy = false;
  private stopped = true;
  private offset = 0;
  private botInfo: TelegramUser | null = null;
  private pollAbortController: AbortController | null = null;
  private dispatcher: Dispatcher | undefined;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as TelegramConfig;

    if (!this.config.token) {
      throw new Error('Telegram 配置缺少 token');
    }

    // 检测代理：优先使用配置中的 proxy 字段，其次读取环境变量
    const proxyUrl = this.config.proxy || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    if (proxyUrl) {
      this.dispatcher = new ProxyAgent(proxyUrl);
      log.info({ proxy: proxyUrl.replace(/\/\/.*@/, '//**@') }, 'Telegram 使用代理');
    }

    // 调用 getMe 验证 token 并获取 bot 信息
    const me = await this.apiCall<TelegramUser>('getMe');
    this.botInfo = me;

    log.info({ botId: me.id, botUsername: me.username }, 'Telegram 插件已初始化');
  }

  async start(): Promise<void> {
    if (!this.botInfo) {
      throw new Error('Telegram 插件未初始化，请先调用 initialize()');
    }

    this.stopped = false;
    this.healthy = true;

    log.info({ botUsername: this.botInfo.username }, 'Telegram Bot 开始 Long Polling');

    // 启动 polling 循环（不阻塞）
    this.pollLoop().catch(error => {
      if (!this.stopped) {
        log.error({ error }, 'Telegram polling 循环异常退出');
        this.healthy = false;
      }
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.healthy = false;

    // 中止正在进行的 polling 请求
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }

    log.info('Telegram 插件已停止');
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    let text = message.content.text ?? '';
    if (text.length > MAX_MESSAGE_LENGTH) {
      text = text.slice(0, MAX_MESSAGE_LENGTH - 30) + '\n\n...(内容过长已截断)';
      log.warn(
        { originalLength: (message.content.text ?? '').length, truncatedTo: MAX_MESSAGE_LENGTH },
        '消息超长已截断',
      );
    }

    const body: Record<string, unknown> = {
      chat_id: message.targetId,
      text,
    };

    if (message.replyToMessageId) {
      body.reply_to_message_id = Number(message.replyToMessageId);
    }

    try {
      await this.apiCall('sendMessage', body);
    } catch (error) {
      log.error(
        { error, targetId: message.targetId, conversationType: message.conversationType },
        '发送 Telegram 消息失败',
      );
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<string | void>): void {
    this.messageHandler = handler;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  // ---- 内部方法 ----

  private async pollLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        this.pollAbortController = new AbortController();
        const timeout = this.config.pollingTimeout ?? DEFAULT_POLLING_TIMEOUT;

        const updates = await this.apiCall<TelegramUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout,
          allowed_updates: ['message'],
        }, this.pollAbortController.signal);

        for (const update of updates) {
          // 更新 offset 确保不重复处理
          if (update.update_id >= this.offset) {
            this.offset = update.update_id + 1;
          }

          if (update.message) {
            this.processMessage(update.message).catch(error => {
              log.error({ error, updateId: update.update_id }, '处理 Telegram 消息失败');
            });
          }
        }
      } catch (error) {
        if (this.stopped) break;

        // 网络错误时等待后重试
        const err = error as Error;
        if (err.name === 'AbortError') break;

        log.error({ error }, 'Telegram polling 请求失败，等待后重试');
        await this.sleep(3000);
      }
    }
  }

  private async processMessage(msg: TelegramMessage): Promise<void> {
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    // 群消息策略检查
    if (isGroup && this.config.groupPolicy === 'mention') {
      if (!this.isBotMentioned(msg)) {
        return; // 群里没 @ 机器人，忽略
      }
    }

    let text = '';

    if (msg.photo && msg.photo.length > 0) {
      // 图片消息：下载到本地并让 Agent 分析
      const imagePath = await this.downloadPhoto(msg);
      if (imagePath) {
        const caption = msg.caption?.trim() ?? '';
        text = `[用户发送了一张图片，已保存到本地: ${imagePath}]\n请用 Read 工具查看这张图片并描述其内容。`;
        if (caption) {
          text += `\n用户附言: ${caption}`;
        }
      } else {
        // 下载失败，通知用户
        try {
          await this.apiCall('sendMessage', {
            chat_id: msg.chat.id,
            text: '图片下载失败，请重新发送。',
            reply_to_message_id: msg.message_id,
          });
        } catch {
          // ignore
        }
        return;
      }
    } else if (msg.text) {
      // 文本消息
      text = msg.text;
      if (isGroup && this.botInfo?.username) {
        text = text.replace(new RegExp(`@${this.botInfo.username}\\s*`, 'g'), '').trim();
      }
    } else {
      // 不支持的消息类型
      return;
    }

    if (!text) return;

    const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Unknown';

    const message: InboundMessage = {
      id: String(msg.message_id),
      channelType: 'telegram',
      channelId: String(msg.chat.id),
      senderId: String(msg.from?.id ?? 'unknown'),
      senderName,
      conversationType: isGroup ? 'group' : 'dm',
      groupId: isGroup ? String(msg.chat.id) : undefined,
      content: { type: 'text', text },
      timestamp: msg.date * 1000,
      raw: msg,
    };

    log.info({
      senderId: message.senderId,
      senderName: message.senderName,
      conversationType: message.conversationType,
      chatId: msg.chat.id,
      textLength: text.length,
      hasPhoto: !!msg.photo,
    }, '收到 Telegram 消息');

    if (this.messageHandler) {
      this.processAndReply(message).catch(error => {
        log.error({ error, messageId: message.id }, '异步处理消息失败');
      });
    }
  }

  /**
   * 从 Telegram 下载图片到本地 SDK workspace
   * 选取最大分辨率的 PhotoSize，通过 getFile + file download 下载
   */
  private async downloadPhoto(msg: TelegramMessage): Promise<string | null> {
    try {
      if (!msg.photo || msg.photo.length === 0) return null;

      // 选取最大分辨率的图片（数组最后一个）
      const largest = msg.photo[msg.photo.length - 1];

      // 获取文件路径
      const fileInfo = await this.apiCall<TelegramFile>('getFile', {
        file_id: largest.file_id,
      });

      if (!fileInfo.file_path) {
        log.warn({ fileId: largest.file_id }, '获取文件路径失败');
        return null;
      }

      // 下载文件
      const downloadUrl = `${API_BASE}/file/bot${this.config.token}/${fileInfo.file_path}`;
      const response = await undiciFetch(downloadUrl, {
        dispatcher: this.dispatcher,
      } as Parameters<typeof undiciFetch>[1]);

      if (!response.ok) {
        log.error({ status: response.status, filePath: fileInfo.file_path }, '下载 Telegram 图片失败');
        return null;
      }

      // 确保上传目录存在
      if (!existsSync(UPLOADS_DIR)) {
        mkdirSync(UPLOADS_DIR, { recursive: true });
      }

      // 从 file_path 提取扩展名，默认 jpg
      const ext = fileInfo.file_path.split('.').pop() ?? 'jpg';
      const fileName = `${Date.now()}_tg_${msg.message_id}.${ext}`;
      const filePath = resolve(UPLOADS_DIR, fileName);

      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(filePath, buffer);

      log.info({ filePath, fileSize: buffer.length, fileId: largest.file_id }, 'Telegram 图片下载成功');
      return filePath;
    } catch (error) {
      log.error({ error, messageId: msg.message_id }, '下载 Telegram 图片失败');
      return null;
    }
  }

  private async processAndReply(message: InboundMessage): Promise<void> {
    try {
      const response = await this.messageHandler!(message);
      const replyText = (typeof response === 'string' ? response : '') || '处理完成';

      await this.sendMessage({
        conversationType: message.conversationType,
        targetId: message.channelId,
        content: { type: 'text', text: replyText },
        replyToMessageId: message.id,
      });
    } catch (error) {
      log.error({ error, messageId: message.id }, '处理消息或回复失败');

      // 尝试发送错误提示
      const errText = error instanceof Error ? error.message : '处理消息时出错，请稍后重试。';
      try {
        await this.sendMessage({
          conversationType: message.conversationType,
          targetId: message.channelId,
          content: { type: 'text', text: `⚠ ${errText}` },
          replyToMessageId: message.id,
        });
      } catch {
        // ignore error notification failure
      }
    }
  }

  private isBotMentioned(msg: TelegramMessage): boolean {
    if (!msg.entities || !this.botInfo) return false;

    return msg.entities.some(entity => {
      if (entity.type === 'mention' && msg.text) {
        const mentionText = msg.text.slice(entity.offset, entity.offset + entity.length);
        return mentionText === `@${this.botInfo!.username}`;
      }
      if (entity.type === 'text_mention' && entity.user) {
        return entity.user.id === this.botInfo!.id;
      }
      return false;
    });
  }

  async apiCall<T>(method: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const url = `${API_BASE}/bot${this.config.token}/${method}`;

    const init: Record<string, unknown> = {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
      dispatcher: this.dispatcher,
    };

    const response = await undiciFetch(url, init as Parameters<typeof undiciFetch>[1]);

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, body: errorText, method }, 'Telegram API 请求失败');
      throw new Error(`Telegram API ${method} 失败: HTTP ${response.status}`);
    }

    const data = await response.json() as TelegramApiResponse<T>;

    if (!data.ok) {
      log.error({ method, errorCode: data.error_code, description: data.description }, 'Telegram API 返回错误');
      throw new Error(`Telegram API ${method} 错误: ${data.description ?? 'unknown error'}`);
    }

    return data.result as T;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
