import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { getLogger } from '../../src/utils/logger.js';
import type { ChannelPlugin, PluginManifest } from '../../src/plugins/types.js';
import type { InboundMessage, OutboundMessage } from '../../src/channels/interface.js';

const log = getLogger('discord');

const MAX_MESSAGE_LENGTH = 2000;
const UPLOADS_DIR = resolve(process.env.HOME ?? '/tmp', '.openpollen', 'sdk-workspace', 'uploads');

// Discord 支持的图片 MIME 类型 -> 扩展名
const IMAGE_MIME_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

interface DiscordConfig {
  token: string;
  groupPolicy: 'mention' | 'all';
}

export default class DiscordPlugin implements ChannelPlugin {
  manifest: PluginManifest = {
    name: 'discord',
    version: '1.0.0',
    slot: 'channel',
    description: 'Discord Bot 聊天平台适配器 (WebSocket Gateway)',
  };
  readonly name = 'discord';
  readonly type = 'discord';

  private config!: DiscordConfig;
  private messageHandler?: (message: InboundMessage) => Promise<string | void>;
  private healthy = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as DiscordConfig;

    if (!this.config.token) {
      throw new Error('Discord 配置缺少 token');
    }

    log.info('Discord 插件已初始化');
  }

  async start(): Promise<void> {
    const { Client, Events, GatewayIntentBits, Partials } = await import('discord.js');

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.client.once(Events.ClientReady, (readyClient: any) => {
      this.healthy = true;
      log.info(
        { botId: readyClient.user.id, botTag: readyClient.user.tag },
        'Discord Bot 已上线',
      );
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.client.on(Events.MessageCreate, (msg: any) => {
      this.processMessage(msg).catch(error => {
        log.error({ error, messageId: msg.id }, '处理 Discord 消息失败');
      });
    });

    await this.client.login(this.config.token);
    log.info('Discord Bot 开始连接 WebSocket Gateway');
  }

  async stop(): Promise<void> {
    this.healthy = false;
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    log.info('Discord 插件已停止');
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    if (!this.client) return;

    try {
      const channel = await this.client.channels.fetch(message.targetId);
      if (!channel || !('send' in channel)) {
        log.warn({ targetId: message.targetId }, '无法找到或访问 Discord 频道');
        return;
      }

      let text = message.content.text ?? '';
      if (text.length > MAX_MESSAGE_LENGTH) {
        text = text.slice(0, MAX_MESSAGE_LENGTH - 30) + '\n\n...(内容过长已截断)';
        log.warn(
          { originalLength: (message.content.text ?? '').length, truncatedTo: MAX_MESSAGE_LENGTH },
          '消息超长已截断',
        );
      }

      const sendOptions: Record<string, unknown> = { content: text };
      if (message.replyToMessageId) {
        sendOptions.reply = { messageReference: message.replyToMessageId };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (channel as any).send(sendOptions);
    } catch (error) {
      log.error(
        { error, targetId: message.targetId, conversationType: message.conversationType },
        '发送 Discord 消息失败',
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
  private async processMessage(msg: any): Promise<void> {
    // 忽略 Bot 消息
    if (msg.author.bot) return;

    const isDM = !msg.guild;
    const isGroup = !isDM;

    // 群消息策略检查
    if (isGroup && this.config.groupPolicy === 'mention') {
      if (!msg.mentions.has(this.client.user)) {
        return;
      }
    }

    let text = msg.content ?? '';

    // 群消息中去除 @Bot mention
    if (isGroup && this.client.user) {
      text = text.replace(new RegExp(`<@!?${this.client.user.id}>\\s*`, 'g'), '').trim();
    }

    // 检查是否包含图片附件
    const imageAttachments = msg.attachments?.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (att: any) => att.contentType && att.contentType in IMAGE_MIME_MAP,
    );

    if (imageAttachments && imageAttachments.size > 0) {
      // 图片消息：下载第一张图片
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstImage = imageAttachments.first() as any;
      const imagePath = await this.downloadImage(firstImage, msg.id);
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

    const senderName = msg.member?.displayName || msg.author.displayName || msg.author.username;

    const message: InboundMessage = {
      id: msg.id,
      channelType: 'discord',
      channelId: msg.channel.id,
      senderId: msg.author.id,
      senderName,
      conversationType: isDM ? 'dm' : 'group',
      groupId: isGroup ? msg.guild.id : undefined,
      content: { type: 'text', text },
      timestamp: msg.createdTimestamp,
      raw: msg,
    };

    log.info({
      senderId: message.senderId,
      senderName: message.senderName,
      conversationType: message.conversationType,
      channelId: msg.channel.id,
      textLength: text.length,
      hasImage: imageAttachments && imageAttachments.size > 0,
    }, '收到 Discord 消息');

    if (this.messageHandler) {
      this.processAndReply(message).catch(error => {
        log.error({ error, messageId: message.id }, '异步处理消息失败');
      });
    }
  }

  /**
   * 从 Discord 下载图片附件到本地 SDK workspace
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async downloadImage(attachment: any, messageId: string): Promise<string | null> {
    try {
      const url = attachment.url as string;
      if (!url) return null;

      const response = await fetch(url);
      if (!response.ok) {
        log.error({ status: response.status, url }, '下载 Discord 图片失败');
        return null;
      }

      // 确保上传目录存在
      if (!existsSync(UPLOADS_DIR)) {
        mkdirSync(UPLOADS_DIR, { recursive: true });
      }

      const contentType = attachment.contentType as string;
      const ext = IMAGE_MIME_MAP[contentType] ?? 'png';
      const fileName = `${Date.now()}_discord_${messageId}.${ext}`;
      const filePath = resolve(UPLOADS_DIR, fileName);

      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(filePath, buffer);

      log.info({ filePath, fileSize: buffer.length, attachmentId: attachment.id }, 'Discord 图片下载成功');
      return filePath;
    } catch (error) {
      log.error({ error, messageId }, '下载 Discord 图片失败');
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
