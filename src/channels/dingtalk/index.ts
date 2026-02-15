import { getLogger } from '../../utils/logger.js';
import { generateId } from '../../utils/crypto.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../interface.js';

const log = getLogger('dingtalk');

interface DingtalkConfig {
  clientId: string;
  clientSecret: string;
  robotCode?: string;
  groupPolicy: 'mention' | 'all';
}

export class DingtalkAdapter implements ChannelAdapter {
  readonly name = 'dingtalk';
  readonly type = 'dingtalk';

  private config!: DingtalkConfig;
  private client: DingtalkStreamClient | null = null;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private healthy = false;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as DingtalkConfig;

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('钉钉配置缺少 clientId 或 clientSecret');
    }

    log.info('钉钉适配器已初始化');
  }

  async start(): Promise<void> {
    try {
      const dingtalkStream = await import('dingtalk-stream');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DStream = (dingtalkStream as any).default ?? dingtalkStream;

      this.client = new DStream.DWClient({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
      }) as DingtalkStreamClient;

      // 注册机器人消息回调
      this.client!.registerCallbackListener(
        '/v1.0/im/bot/messages/get',
        async (res: DingtalkCallbackResponse) => {
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
    log.info('钉钉适配器已停止');
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    if (!this.client) {
      throw new Error('钉钉客户端未连接');
    }

    // 通过钉钉 API 发送消息
    const accessToken = await this.getAccessToken();
    const url = message.conversationType === 'group'
      ? 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'
      : 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend';

    const body = message.conversationType === 'group'
      ? {
          robotCode: this.config.robotCode ?? this.config.clientId,
          openConversationId: message.targetId,
          msgKey: 'sampleMarkdown',
          msgParam: JSON.stringify({
            title: '回复',
            text: message.content.text ?? '',
          }),
        }
      : {
          robotCode: this.config.robotCode ?? this.config.clientId,
          userIds: [message.targetId],
          msgKey: 'sampleMarkdown',
          msgParam: JSON.stringify({
            title: '回复',
            text: message.content.text ?? '',
          }),
        };

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
      log.error({ status: response.status, body: errorText }, '发送钉钉消息失败');
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  private async handleCallback(res: DingtalkCallbackResponse): Promise<void> {
    try {
      const data = JSON.parse(res.data) as DingtalkMessageData;

      const isGroup = data.conversationType === '2';
      const text = data.text?.content?.trim() ?? '';

      // 群消息检查是否需要 @
      if (isGroup && this.config.groupPolicy === 'mention') {
        if (!data.isInAtList) {
          return; // 群里没 @ 机器人，忽略
        }
      }

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
        textLength: text.length,
      }, '收到钉钉消息');

      if (this.messageHandler) {
        const response = await this.messageHandler(message);

        // 通过 webhook 回复
        if (data.sessionWebhook) {
          await this.replyViaWebhook(data.sessionWebhook, response as unknown as string);
        }
      }
    } catch (error) {
      log.error({ error }, '处理钉钉回调失败');
    }
  }

  private async replyViaWebhook(webhookUrl: string, text: string): Promise<void> {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { title: '回复', text },
        }),
      });
    } catch (error) {
      log.error({ error }, 'Webhook 回复失败');
    }
  }

  private async getAccessToken(): Promise<string> {
    const response = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appKey: this.config.clientId,
        appSecret: this.config.clientSecret,
      }),
    });

    const data = await response.json() as { accessToken: string };
    return data.accessToken;
  }
}

// 钉钉 Stream SDK 类型
interface DingtalkStreamClient {
  registerCallbackListener(topic: string, handler: (res: DingtalkCallbackResponse) => Promise<void>): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

interface DingtalkCallbackResponse {
  data: string;
  headers: Record<string, string>;
}

interface DingtalkMessageData {
  msgId?: string;
  text?: { content?: string };
  conversationType?: string;
  conversationId?: string;
  senderId?: string;
  senderStaffId?: string;
  senderNick?: string;
  chatbotCorpId?: string;
  isInAtList?: boolean;
  sessionWebhook?: string;
}
