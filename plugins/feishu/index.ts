import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import * as Lark from '@larksuiteoapi/node-sdk';
import { getLogger } from '../../src/utils/logger.js';
import { generateId } from '../../src/utils/crypto.js';
import type { ChannelPlugin, PluginManifest } from '../../src/plugins/types.js';
import type { InboundMessage, OutboundMessage } from '../../src/channels/interface.js';

const log = getLogger('feishu');

const MAX_MESSAGE_LENGTH = 18000;
const UPLOADS_DIR = resolve(process.env.HOME ?? '/tmp', '.openpollen', 'sdk-workspace', 'uploads');

interface FeishuConfig {
  appId: string;
  appSecret: string;
  groupPolicy: 'mention' | 'all';
}

interface FeishuMessageEvent {
  sender: {
    sender_id?: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    create_time: string;
    chat_id: string;
    chat_type: string;
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: {
        union_id?: string;
        user_id?: string;
        open_id?: string;
      };
      name: string;
      tenant_key?: string;
    }>;
  };
  app_id?: string;
}

// 支持的图片消息类型映射
const IMAGE_TYPES: Record<string, string> = {
  image: 'png',
};

export default class FeishuPlugin implements ChannelPlugin {
  manifest: PluginManifest = {
    name: 'feishu',
    version: '1.0.0',
    slot: 'channel',
    description: '飞书聊天平台适配器',
  };
  readonly name = 'feishu';
  readonly type = 'feishu';

  private config!: FeishuConfig;
  private client!: Lark.Client;
  private wsClient: Lark.WSClient | null = null;
  private messageHandler?: (message: InboundMessage) => Promise<string | void>;
  private healthy = false;
  private botOpenId: string | null = null;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as FeishuConfig;

    if (!this.config.appId || !this.config.appSecret) {
      throw new Error('飞书配置缺少 appId 或 appSecret');
    }

    this.client = new Lark.Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: Lark.LoggerLevel.info,
    });

    log.info('飞书插件已初始化');
  }

  async start(): Promise<void> {
    try {
      // 获取机器人自身信息用于 mention 判断
      await this.fetchBotInfo();

      const eventDispatcher = new Lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data: FeishuMessageEvent) => {
          await this.handleMessageEvent(data);
        },
      });

      this.wsClient = new Lark.WSClient({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        loggerLevel: Lark.LoggerLevel.info,
      });

      await this.wsClient.start({ eventDispatcher });
      this.healthy = true;
      log.info('飞书 WebSocket 已连接');
    } catch (error) {
      this.healthy = false;
      log.error({ error }, '飞书连接失败');
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.wsClient) {
      try {
        this.wsClient.close();
      } catch {
        // ignore close errors
      }
      this.wsClient = null;
    }
    this.healthy = false;
    log.info('飞书插件已停止');
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    // 截断超长消息
    let text = message.content.text ?? '';
    if (text.length > MAX_MESSAGE_LENGTH) {
      text = text.slice(0, MAX_MESSAGE_LENGTH) + '\n\n...(内容过长已截断)';
      log.warn({ originalLength: (message.content.text ?? '').length, truncatedTo: MAX_MESSAGE_LENGTH }, '消息超长已截断');
    }

    try {
      if (message.replyToMessageId) {
        // 回复原消息
        await this.client.im.v1.message.reply({
          data: {
            content: JSON.stringify({ text }),
            msg_type: 'text',
          },
          path: {
            message_id: message.replyToMessageId,
          },
        });
      } else {
        // 直接发送到会话
        await this.client.im.v1.message.create({
          data: {
            receive_id: message.targetId,
            msg_type: 'text',
            content: JSON.stringify({ text }),
          },
          params: {
            receive_id_type: message.conversationType === 'group' ? 'chat_id' : 'open_id',
          },
        });
      }
    } catch (error) {
      log.error({
        error,
        targetId: message.targetId,
        conversationType: message.conversationType,
      }, '发送飞书消息失败');
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<string | void>): void {
    this.messageHandler = handler;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  private async fetchBotInfo(): Promise<void> {
    try {
      const resp = await this.client.request({
        method: 'GET',
        url: 'https://open.feishu.cn/open-apis/bot/v3/info',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = resp as any;
      this.botOpenId = data?.bot?.open_id ?? null;
      if (this.botOpenId) {
        log.info({ botOpenId: this.botOpenId }, '获取机器人信息成功');
      }
    } catch (error) {
      log.warn({ error }, '获取机器人信息失败，群消息 mention 检测可能不准确');
    }
  }

  private async handleMessageEvent(data: FeishuMessageEvent): Promise<void> {
    try {
      const { sender, message } = data;
      const isGroup = message.chat_type === 'group';

      // 群消息 + groupPolicy='mention' 时，只响应被 @ 的消息
      if (isGroup && this.config.groupPolicy === 'mention') {
        const isMentioned = message.mentions?.some(
          m => m.id?.open_id === this.botOpenId,
        );
        if (!isMentioned) {
          return;
        }
      }

      // 解析消息内容
      let text = '';

      if (message.message_type === 'text') {
        try {
          const parsed = JSON.parse(message.content) as { text?: string };
          text = parsed.text?.trim() ?? '';
        } catch {
          text = message.content;
        }
      } else if (message.message_type in IMAGE_TYPES) {
        // 图片消息：下载到本地并提示 Claude 分析
        const imagePath = await this.downloadImage(message);
        if (imagePath) {
          text = `[用户发送了一张图片，已保存到本地: ${imagePath}]\n请用 Read 工具查看这张图片并描述其内容。如果无法查看，请告知用户。`;
        } else {
          try {
            await this.client.im.v1.message.reply({
              data: {
                content: JSON.stringify({ text: '图片下载失败，请重新发送。' }),
                msg_type: 'text',
              },
              path: { message_id: message.message_id },
            });
          } catch {
            // ignore
          }
          return;
        }
      } else {
        log.info({ messageType: message.message_type }, '收到不支持的消息类型');
        try {
          await this.client.im.v1.message.reply({
            data: {
              content: JSON.stringify({ text: `暂不支持 ${message.message_type} 类型消息，目前支持文本和图片。` }),
              msg_type: 'text',
            },
            path: { message_id: message.message_id },
          });
        } catch {
          // ignore reply failure
        }
        return;
      }

      // 去掉 @机器人 的 mention 标记 (飞书格式为 @_user_xxx)
      if (message.mentions?.length) {
        for (const mention of message.mentions) {
          text = text.replace(mention.key, '').trim();
        }
      }

      if (!text) {
        return;
      }

      const senderId = sender.sender_id?.open_id ?? 'unknown';

      const inbound: InboundMessage = {
        id: message.message_id ?? generateId(),
        channelType: 'feishu',
        channelId: data.app_id ?? 'default',
        senderId,
        senderName: senderId,
        conversationType: isGroup ? 'group' : 'dm',
        groupId: isGroup ? message.chat_id : undefined,
        content: { type: 'text', text },
        timestamp: parseInt(message.create_time, 10) || Date.now(),
        raw: data,
      };

      log.info({
        senderId: inbound.senderId,
        conversationType: inbound.conversationType,
        textLength: text.length,
        messageType: message.message_type,
      }, '收到飞书消息');

      if (this.messageHandler) {
        this.processAndReply(inbound, message.message_id).catch(error => {
          log.error({ error, messageId: inbound.id }, '异步处理消息失败');
        });
      }
    } catch (error) {
      log.error({ error }, '处理飞书消息事件失败');
    }
  }

  /**
   * 从飞书下载图片到本地 SDK workspace
   */
  private async downloadImage(message: FeishuMessageEvent['message']): Promise<string | null> {
    try {
      const parsed = JSON.parse(message.content) as { image_key?: string };
      const imageKey = parsed.image_key;
      if (!imageKey) {
        log.warn({ content: message.content }, '图片消息缺少 image_key');
        return null;
      }

      // 确保上传目录存在
      if (!existsSync(UPLOADS_DIR)) {
        mkdirSync(UPLOADS_DIR, { recursive: true });
      }

      const ext = IMAGE_TYPES[message.message_type] ?? 'png';
      const fileName = `${Date.now()}_${imageKey}.${ext}`;
      const filePath = resolve(UPLOADS_DIR, fileName);

      const resp = await this.client.im.v1.messageResource.get({
        params: { type: 'image' },
        path: {
          message_id: message.message_id,
          file_key: imageKey,
        },
      });

      await resp.writeFile(filePath);
      log.info({ filePath, imageKey }, '飞书图片下载成功');
      return filePath;
    } catch (error) {
      log.error({ error, messageId: message.message_id }, '下载飞书图片失败');
      return null;
    }
  }

  private async processAndReply(message: InboundMessage, originalMessageId: string): Promise<void> {
    try {
      const response = await this.messageHandler!(message);
      const replyText = (typeof response === 'string' ? response : '') || '处理完成';

      // 回复原消息
      let text = replyText;
      if (text.length > MAX_MESSAGE_LENGTH) {
        text = text.slice(0, MAX_MESSAGE_LENGTH) + '\n\n...(内容过长已截断)';
      }

      await this.client.im.v1.message.reply({
        data: {
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
        path: {
          message_id: originalMessageId,
        },
      });
    } catch (error) {
      const errText = error instanceof Error ? error.message : '处理消息时出错，请稍后重试。';
      log.error({ error: errText, messageId: message.id }, '处理消息或回复失败');

      // 尝试发送错误提示给用户
      await this.sendErrorFeedback(originalMessageId, message, errText);
    }
  }

  /**
   * 向用户发送错误反馈，先尝试 reply 原消息，失败则 fallback 到 create 直发
   */
  private async sendErrorFeedback(originalMessageId: string, message: InboundMessage, errText: string): Promise<void> {
    const errorContent = JSON.stringify({ text: `⚠ ${errText}` });

    // 尝试 1: 回复原消息
    try {
      await this.client.im.v1.message.reply({
        data: { content: errorContent, msg_type: 'text' },
        path: { message_id: originalMessageId },
      });
      log.info({ messageId: originalMessageId }, '错误反馈已通过 reply 发送');
      return;
    } catch (replyErr) {
      log.warn({ error: replyErr instanceof Error ? replyErr.message : String(replyErr), messageId: originalMessageId }, '通过 reply 发送错误反馈失败，尝试 create');
    }

    // 尝试 2: 直接发送到会话（fallback）
    try {
      const chatId = message.groupId ?? message.senderId;
      const receiveIdType = message.conversationType === 'group' ? 'chat_id' : 'open_id';
      await this.client.im.v1.message.create({
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: errorContent,
        },
        params: { receive_id_type: receiveIdType },
      });
      log.info({ chatId, receiveIdType }, '错误反馈已通过 create 发送');
    } catch (createErr) {
      log.error({ error: createErr instanceof Error ? createErr.message : String(createErr) }, '发送错误反馈彻底失败');
    }
  }
}
