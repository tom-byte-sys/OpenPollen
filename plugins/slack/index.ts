import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { getLogger } from '../../src/utils/logger.js';
import type { ChannelPlugin, PluginManifest } from '../../src/plugins/types.js';
import type { InboundMessage, OutboundMessage } from '../../src/channels/interface.js';

const log = getLogger('slack');

const UPLOADS_DIR = resolve(process.env.HOME ?? '/tmp', '.openpollen', 'sdk-workspace', 'uploads');

// Slack 支持的图片 MIME 类型 -> 扩展名
const IMAGE_MIME_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

interface SlackConfig {
  botToken: string;
  appToken: string;
  groupPolicy: 'mention' | 'all';
}

export default class SlackPlugin implements ChannelPlugin {
  manifest: PluginManifest = {
    name: 'slack',
    version: '1.0.0',
    slot: 'channel',
    description: 'Slack Bot 聊天平台适配器 (Socket Mode)',
  };
  readonly name = 'slack';
  readonly type = 'slack';

  private config!: SlackConfig;
  private messageHandler?: (message: InboundMessage) => Promise<string | void>;
  private healthy = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private socketModeClient: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webClient: any = null;
  private botUserId: string | null = null;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as SlackConfig;

    if (!this.config.botToken) {
      throw new Error('Slack 配置缺少 botToken');
    }
    if (!this.config.appToken) {
      throw new Error('Slack 配置缺少 appToken');
    }

    log.info('Slack 插件已初始化');
  }

  async start(): Promise<void> {
    const { SocketModeClient } = await import('@slack/socket-mode');
    const { WebClient } = await import('@slack/web-api');

    this.webClient = new WebClient(this.config.botToken);
    this.socketModeClient = new SocketModeClient({ appToken: this.config.appToken });

    // 获取 Bot User ID
    const authResult = await this.webClient.auth.test();
    this.botUserId = authResult.user_id as string;

    log.info(
      { botUserId: this.botUserId, botName: authResult.user },
      'Slack Bot 身份验证成功',
    );

    // 监听消息事件
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.socketModeClient.on('message', async ({ event, ack }: any) => {
      await ack();
      this.processMessage(event).catch(error => {
        log.error({ error, eventTs: event?.ts }, '处理 Slack 消息失败');
      });
    });

    await this.socketModeClient.start();
    this.healthy = true;

    log.info('Slack Bot 已通过 Socket Mode 连接');
  }

  async stop(): Promise<void> {
    this.healthy = false;
    if (this.socketModeClient) {
      await this.socketModeClient.disconnect();
      this.socketModeClient = null;
    }
    this.webClient = null;
    log.info('Slack 插件已停止');
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    if (!this.webClient) return;

    try {
      const text = message.content.text ?? '';

      const postArgs: Record<string, unknown> = {
        channel: message.targetId,
        text,
      };

      // 频道消息使用线程回复
      if (message.replyToMessageId && message.conversationType === 'group') {
        postArgs.thread_ts = message.replyToMessageId;
      }

      await this.webClient.chat.postMessage(postArgs);
    } catch (error) {
      log.error(
        { error, targetId: message.targetId, conversationType: message.conversationType },
        '发送 Slack 消息失败',
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async processMessage(event: any): Promise<void> {
    // 忽略 bot 消息和 subtypes（如 message_changed、message_deleted）
    // 但保留 file_share subtype（用户上传文件时的消息）
    if (event.bot_id) return;
    if (event.subtype && event.subtype !== 'file_share') return;

    const isDM = event.channel_type === 'im';
    const isGroup = !isDM;

    // 群消息策略检查
    if (isGroup && this.config.groupPolicy === 'mention') {
      if (!this.isBotMentioned(event.text)) {
        return;
      }
    }

    let text = event.text ?? '';

    // 去除 @Bot mention
    if (this.botUserId) {
      text = text.replace(new RegExp(`<@${this.botUserId}>\\s*`, 'g'), '').trim();
    }

    // 检查是否包含图片文件
    const imageFiles = (event.files ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => f.mimetype && f.mimetype in IMAGE_MIME_MAP,
    );

    if (imageFiles.length > 0) {
      // 图片消息：下载第一张图片
      const imagePath = await this.downloadImage(imageFiles[0], event.ts);
      if (imagePath) {
        const caption = text.trim();
        text = `[用户发送了一张图片，已保存到本地: ${imagePath}]\n请用 Read 工具查看这张图片并描述其内容。`;
        if (caption) {
          text += `\n用户附言: ${caption}`;
        }
      } else {
        // 下载失败时仍尝试处理文本
        if (!text) return;
      }
    }

    if (!text) return;

    // 尝试获取用户信息
    let senderName = event.user ?? 'unknown';
    try {
      const userInfo = await this.webClient.users.info({ user: event.user });
      if (userInfo.user) {
        senderName = userInfo.user.real_name || userInfo.user.name || senderName;
      }
    } catch {
      // 获取用户信息失败不影响消息处理
    }

    const message: InboundMessage = {
      id: event.ts,
      channelType: 'slack',
      channelId: event.channel,
      senderId: event.user ?? 'unknown',
      senderName,
      conversationType: isDM ? 'dm' : 'group',
      groupId: isGroup ? event.channel : undefined,
      content: { type: 'text', text },
      timestamp: Math.floor(parseFloat(event.ts) * 1000),
      raw: event,
    };

    log.info({
      senderId: message.senderId,
      senderName: message.senderName,
      conversationType: message.conversationType,
      channelId: event.channel,
      textLength: text.length,
      hasImage: imageFiles.length > 0,
    }, '收到 Slack 消息');

    if (this.messageHandler) {
      this.processAndReply(message).catch(error => {
        log.error({ error, messageId: message.id }, '异步处理消息失败');
      });
    }
  }

  /**
   * 从 Slack 下载图片文件到本地 SDK workspace
   * Slack 的文件 URL (url_private_download) 需要 Bearer token 认证
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async downloadImage(file: any, messageTs: string): Promise<string | null> {
    try {
      const url = file.url_private_download as string;
      if (!url) {
        log.warn({ fileId: file.id }, 'Slack 图片缺少 url_private_download');
        return null;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.botToken}`,
        },
      });

      if (!response.ok) {
        log.error({ status: response.status, fileId: file.id }, '下载 Slack 图片失败');
        return null;
      }

      // 确保上传目录存在
      if (!existsSync(UPLOADS_DIR)) {
        mkdirSync(UPLOADS_DIR, { recursive: true });
      }

      const mimetype = file.mimetype as string;
      const ext = IMAGE_MIME_MAP[mimetype] ?? 'png';
      const fileName = `${Date.now()}_slack_${file.id}.${ext}`;
      const filePath = resolve(UPLOADS_DIR, fileName);

      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(filePath, buffer);

      log.info({ filePath, fileSize: buffer.length, fileId: file.id }, 'Slack 图片下载成功');
      return filePath;
    } catch (error) {
      log.error({ error, messageTs }, '下载 Slack 图片失败');
      return null;
    }
  }

  private isBotMentioned(text: string | undefined): boolean {
    if (!text || !this.botUserId) return false;
    return text.includes(`<@${this.botUserId}>`);
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
}
