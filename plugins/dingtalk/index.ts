import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { getLogger } from '../../src/utils/logger.js';
import { generateId } from '../../src/utils/crypto.js';
import type { ChannelPlugin, PluginManifest } from '../../src/plugins/types.js';
import type { InboundMessage, OutboundMessage } from '../../src/channels/interface.js';

const log = getLogger('dingtalk');

const MAX_MESSAGE_LENGTH = 18000;
const UPLOADS_DIR = resolve(process.env.HOME ?? '/tmp', '.openpollen', 'sdk-workspace', 'uploads');

interface DingtalkConfig {
  clientId: string;
  clientSecret: string;
  robotCode?: string;
  groupPolicy: 'mention' | 'all';
}

export default class DingtalkPlugin implements ChannelPlugin {
  manifest: PluginManifest = {
    name: 'dingtalk',
    version: '1.0.0',
    slot: 'channel',
    description: '钉钉聊天平台适配器',
  };
  readonly name = 'dingtalk';
  readonly type = 'dingtalk';

  private config!: DingtalkConfig;
  private client: DingtalkStreamClient | null = null;
  private messageHandler?: (message: InboundMessage) => Promise<string | void>;
  private healthy = false;

  // Access token 缓存
  private _accessToken: string | null = null;
  private _tokenExpiresAt = 0;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as DingtalkConfig;

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('钉钉配置缺少 clientId 或 clientSecret');
    }

    log.info('钉钉插件已初始化');
  }

  async start(): Promise<void> {
    try {
      const dingtalkStream = await import('dingtalk-stream');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DStream = (dingtalkStream as any).default ?? dingtalkStream;

      this.client = new DStream.DWClient({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        debug: false,
      }) as DingtalkStreamClient;

      // 注册机器人消息回调
      this.client!.registerCallbackListener(
        '/v1.0/im/bot/messages/get',
        async (res: DingtalkCallbackResponse) => {
          // 立即发送 ACK 避免服务端重试
          this.client!.socketCallBackResponse(res.headers.messageId, { response: 'OK' });
          await this.handleCallback(res);
        },
      );

      await this.client!.connect();
      this.healthy = true;
      log.info('钉钉 Stream 已连接');
    } catch (error) {
      this.healthy = false;
      log.error({ error }, '钉钉连接失败');
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.client = null;
    }
    this.healthy = false;
    this._accessToken = null;
    this._tokenExpiresAt = 0;
    log.info('钉钉插件已停止');
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    if (!this.client) {
      throw new Error('钉钉客户端未连接');
    }

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken();
    } catch (error) {
      log.error({ error }, '获取 access token 失败，无法发送消息');
      throw error;
    }

    // 截断超长消息
    let text = message.content.text ?? '';
    if (text.length > MAX_MESSAGE_LENGTH) {
      text = text.slice(0, MAX_MESSAGE_LENGTH) + '\n\n...(内容过长已截断)';
      log.warn({ originalLength: (message.content.text ?? '').length, truncatedTo: MAX_MESSAGE_LENGTH }, '消息超长已截断');
    }

    const url = message.conversationType === 'group'
      ? 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'
      : 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend';

    const body = message.conversationType === 'group'
      ? {
          robotCode: this.config.robotCode ?? this.config.clientId,
          openConversationId: message.targetId,
          msgKey: 'sampleMarkdown',
          msgParam: JSON.stringify({ title: '回复', text }),
        }
      : {
          robotCode: this.config.robotCode ?? this.config.clientId,
          userIds: [message.targetId],
          msgKey: 'sampleMarkdown',
          msgParam: JSON.stringify({ title: '回复', text }),
        };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({
          status: response.status,
          body: errorText,
          targetId: message.targetId,
          conversationType: message.conversationType,
        }, '发送钉钉消息失败');
      }
    } catch (error) {
      log.error({
        error,
        targetId: message.targetId,
        conversationType: message.conversationType,
      }, '发送钉钉消息异常');
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<string | void>): void {
    this.messageHandler = handler;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  private async handleCallback(res: DingtalkCallbackResponse): Promise<void> {
    try {
      const data = JSON.parse(res.data) as DingtalkMessageData;

      const isGroup = data.conversationType === '2';

      // 群消息检查是否需要 @
      if (isGroup && this.config.groupPolicy === 'mention') {
        if (!data.isInAtList) {
          return; // 群里没 @ 机器人，忽略
        }
      }

      let text = '';
      const msgtype = data.msgtype ?? 'text';

      if (msgtype === 'text') {
        text = data.text?.content?.trim() ?? '';
      } else if (msgtype === 'picture') {
        // 单独图片消息
        const downloadCode = data.content?.downloadCode;
        if (downloadCode) {
          const imagePath = await this.downloadImage(downloadCode, data.robotCode);
          if (imagePath) {
            text = `[用户发送了一张图片，已保存到本地: ${imagePath}]\n请用 Read 工具查看这张图片并描述其内容。`;
          } else {
            // 下载失败通知用户
            if (data.sessionWebhook) {
              await this.replyViaWebhook(data.sessionWebhook, '图片下载失败，请重新发送。').catch(() => {});
            }
            return;
          }
        } else {
          log.warn({ msgtype, content: data.content }, '图片消息缺少 downloadCode');
          return;
        }
      } else if (msgtype === 'richText') {
        // 图文混合消息
        const parts: string[] = [];
        const richText = data.content?.richText ?? [];
        for (const block of richText) {
          if (block.text) {
            parts.push(block.text);
          } else if (block.type === 'picture' && block.downloadCode) {
            const imagePath = await this.downloadImage(block.downloadCode, data.robotCode);
            if (imagePath) {
              parts.push(`[图片已保存到本地: ${imagePath}，请用 Read 工具查看]`);
            } else {
              parts.push('[图片下载失败]');
            }
          }
        }
        text = parts.join('\n');
        if (text) {
          text += '\n请用 Read 工具查看图片并结合文字内容回复。';
        }
      } else {
        log.info({ msgtype }, '收到不支持的钉钉消息类型');
        return;
      }

      if (!text) return;

      const message: InboundMessage = {
        id: data.msgId ?? generateId(),
        channelType: 'dingtalk',
        channelId: data.chatbotCorpId ?? 'default',
        senderId: data.senderStaffId ?? data.senderId ?? 'unknown',
        senderName: data.senderNick ?? 'Unknown',
        conversationType: isGroup ? 'group' : 'dm',
        groupId: isGroup ? data.conversationId : undefined,
        content: { type: 'text', text },
        timestamp: Date.now(),
        raw: data,
      };

      log.info({
        senderId: message.senderId,
        senderName: message.senderName,
        conversationType: message.conversationType,
        msgtype,
        textLength: text.length,
      }, '收到钉钉消息');

      if (this.messageHandler) {
        // 异步处理：先不阻塞回调，通过 webhook 异步回复
        const webhookUrl = data.sessionWebhook;
        this.processAndReply(message, webhookUrl).catch(error => {
          log.error({ error, messageId: message.id }, '异步处理消息失败');
        });
      }
    } catch (error) {
      log.error({ error }, '处理钉钉回调失败');
    }
  }

  /**
   * 从钉钉下载图片到本地 SDK workspace
   * 流程: downloadCode → /v1.0/robot/messageFiles/download 获取临时 URL → 下载文件
   */
  private async downloadImage(downloadCode: string, robotCode?: string): Promise<string | null> {
    try {
      const accessToken = await this.getAccessToken();
      const code = robotCode ?? this.config.robotCode ?? this.config.clientId;

      // 获取临时下载 URL
      const response = await fetch('https://api.dingtalk.com/v1.0/robot/messageFiles/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify({
          downloadCode,
          robotCode: code,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, body: errorText }, '获取钉钉图片下载 URL 失败');
        return null;
      }

      const result = await response.json() as { downloadUrl?: string };
      if (!result.downloadUrl) {
        log.warn({ result }, '钉钉图片下载 URL 为空');
        return null;
      }

      // 下载实际文件
      const fileResponse = await fetch(result.downloadUrl);
      if (!fileResponse.ok) {
        log.error({ status: fileResponse.status }, '下载钉钉图片文件失败');
        return null;
      }

      // 确保上传目录存在
      if (!existsSync(UPLOADS_DIR)) {
        mkdirSync(UPLOADS_DIR, { recursive: true });
      }

      const fileName = `${Date.now()}_dingtalk_${downloadCode.slice(0, 8)}.jpg`;
      const filePath = resolve(UPLOADS_DIR, fileName);

      const buffer = Buffer.from(await fileResponse.arrayBuffer());
      writeFileSync(filePath, buffer);

      log.info({ filePath, fileSize: buffer.length }, '钉钉图片下载成功');
      return filePath;
    } catch (error) {
      log.error({ error, downloadCode }, '下载钉钉图片失败');
      return null;
    }
  }

  private async processAndReply(message: InboundMessage, webhookUrl?: string): Promise<void> {
    try {
      const response = await this.messageHandler!(message);
      const replyText = (typeof response === 'string' ? response : '') || '处理完成';

      if (webhookUrl) {
        await this.replyViaWebhook(webhookUrl, replyText);
      }
    } catch (error) {
      log.error({ error, messageId: message.id }, '处理消息或回复失败');

      // 尝试通过 webhook 发送错误提示，使用实际的错误信息
      if (webhookUrl) {
        const errText = error instanceof Error ? error.message : '处理消息时出错，请稍后重试。';
        await this.replyViaWebhook(webhookUrl, `⚠ ${errText}`).catch(() => {
          // ignore error notification failure
        });
      }
    }
  }

  private async replyViaWebhook(webhookUrl: string, text: string): Promise<void> {
    // 截断超长回复
    let content = text;
    if (content && content.length > MAX_MESSAGE_LENGTH) {
      content = content.slice(0, MAX_MESSAGE_LENGTH) + '\n\n...(内容过长已截断)';
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { title: '回复', text: content },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, body: errorText }, 'Webhook 回复失败');
      }
    } catch (error) {
      log.error({ error }, 'Webhook 回复异常');
    }
  }

  private async getAccessToken(): Promise<string> {
    // 检查缓存是否有效（提前 5 分钟刷新）
    if (this._accessToken && Date.now() < this._tokenExpiresAt - 5 * 60 * 1000) {
      return this._accessToken;
    }

    log.info('正在刷新钉钉 access token');

    const response = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appKey: this.config.clientId,
        appSecret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, body: errorText }, '获取 access token 失败');
      throw new Error(`获取钉钉 access token 失败: HTTP ${response.status}`);
    }

    const data = await response.json() as { accessToken?: string; expireIn?: number };

    if (!data.accessToken) {
      log.error({ data }, 'access token 响应无效');
      throw new Error('钉钉 access token 响应无效');
    }

    this._accessToken = data.accessToken;
    // expireIn 单位为秒，默认 7200 秒
    this._tokenExpiresAt = Date.now() + (data.expireIn ?? 7200) * 1000;

    log.info('钉钉 access token 刷新成功');
    return this._accessToken;
  }
}

// 钉钉 Stream SDK 类型
interface DingtalkStreamClient {
  registerCallbackListener(topic: string, handler: (res: DingtalkCallbackResponse) => Promise<void>): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  socketCallBackResponse(messageId: string, result: unknown): void;
}

interface DingtalkCallbackResponse {
  data: string;
  headers: Record<string, string>;
}

interface DingtalkRichTextBlock {
  text?: string;
  downloadCode?: string;
  pictureDownloadCode?: string;
  type?: string;
}

interface DingtalkMessageData {
  msgId?: string;
  msgtype?: string;
  text?: { content?: string };
  content?: {
    downloadCode?: string;
    pictureDownloadCode?: string;
    richText?: DingtalkRichTextBlock[];
  };
  conversationType?: string;
  conversationId?: string;
  senderId?: string;
  senderStaffId?: string;
  senderNick?: string;
  chatbotCorpId?: string;
  isInAtList?: boolean;
  sessionWebhook?: string;
  robotCode?: string;
}
