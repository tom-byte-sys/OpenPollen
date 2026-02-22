import WebSocket from 'ws';
import { getLogger } from '../../src/utils/logger.js';
import { generateId } from '../../src/utils/crypto.js';
import type { ChannelPlugin, PluginManifest } from '../../src/plugins/types.js';
import type { InboundMessage, OutboundMessage } from '../../src/channels/interface.js';

const log = getLogger('qq');

const MAX_MESSAGE_LENGTH = 18000;

// QQ 官方 API 地址
const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const API_BASE = 'https://api.sgroup.qq.com';
const API_SANDBOX = 'https://sandbox.api.sgroup.qq.com';

// WebSocket opcodes
const OP_DISPATCH = 0;       // 服务端推送事件
const OP_HEARTBEAT = 1;      // 客户端发送心跳
const OP_IDENTIFY = 2;       // 客户端鉴权
const OP_RESUME = 6;         // 客户端断线重连
const OP_HELLO = 10;         // 服务端 Hello（含心跳间隔）
const OP_HEARTBEAT_ACK = 11; // 服务端心跳 ACK

// Intents (位运算)
const INTENT_GUILDS = 1 << 0;                  // 频道基础事件
const INTENT_GUILD_MEMBERS = 1 << 1;           // 频道成员事件
const INTENT_GUILD_MESSAGES = 1 << 9;          // 私域：频道全量消息 (MESSAGE_CREATE)
const INTENT_DIRECT_MESSAGE = 1 << 12;         // 频道私信
const INTENT_INTERACTION = 1 << 26;            // 互动事件
const INTENT_MESSAGE_AUDIT = 1 << 27;          // 消息审核事件
const INTENT_PUBLIC_GUILD_MESSAGES = 1 << 30;  // 公域：频道@消息 (AT_MESSAGE_CREATE)

interface QQConfig {
  appId: string;
  appSecret: string;
  sandbox?: boolean;
  groupPolicy: 'mention' | 'all';
}

interface QQGatewayPayload {
  op: number;
  d?: unknown;
  s?: number;
  t?: string;
}

interface QQReadyData {
  session_id: string;
  user: { id: string; username: string };
}

interface QQMessageData {
  id: string;
  channel_id: string;
  guild_id: string;
  content: string;
  author: {
    id: string;
    username: string;
    bot?: boolean;
  };
  member?: {
    nick?: string;
  };
  mentions?: Array<{ id: string; username: string; bot?: boolean }>;
}

export default class QQPlugin implements ChannelPlugin {
  manifest: PluginManifest = {
    name: 'qq',
    version: '1.0.0',
    slot: 'channel',
    description: 'QQ 频道机器人适配器',
  };
  readonly name = 'qq';
  readonly type = 'qq';

  private config!: QQConfig;
  private ws: WebSocket | null = null;
  private messageHandler?: (message: InboundMessage) => Promise<string | void>;
  private healthy = false;

  // Access token 缓存
  private _accessToken: string | null = null;
  private _tokenExpiresAt = 0;

  // WebSocket 状态
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeq: number | null = null;
  private sessionId: string | null = null;
  private botUserId: string | null = null;
  private reconnecting = false;
  private stopped = false;

  get apiBase(): string {
    return this.config.sandbox ? API_SANDBOX : API_BASE;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as QQConfig;

    if (!this.config.appId || !this.config.appSecret) {
      throw new Error('QQ 频道配置缺少 appId 或 appSecret');
    }

    log.info('QQ 频道插件已初始化');
  }

  async start(): Promise<void> {
    this.stopped = false;
    try {
      await this.getAccessToken();
      const gatewayUrl = await this.getGateway();
      await this.connectWebSocket(gatewayUrl);
      log.info('QQ 频道 WebSocket 已连接');
    } catch (error) {
      this.healthy = false;
      log.error({ error }, 'QQ 频道连接失败');
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearHeartbeat();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Plugin stopping');
      } catch {
        // ignore close errors
      }
      this.ws = null;
    }

    this.healthy = false;
    this.sessionId = null;
    this.lastSeq = null;
    this._accessToken = null;
    this._tokenExpiresAt = 0;
    log.info('QQ 频道插件已停止');
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    const accessToken = await this.getAccessToken();

    // 截断超长消息
    let text = message.content.text ?? '';
    if (text.length > MAX_MESSAGE_LENGTH) {
      text = text.slice(0, MAX_MESSAGE_LENGTH) + '\n\n...(内容过长已截断)';
      log.warn({ originalLength: (message.content.text ?? '').length, truncatedTo: MAX_MESSAGE_LENGTH }, '消息超长已截断');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `QQBot ${accessToken}`,
    };

    if (message.conversationType === 'dm') {
      // 私信：先创建私信会话，再发消息
      await this.sendDMMessage(headers, message.targetId, text, message.replyToMessageId);
    } else {
      // 频道消息：直接发送到 channel
      await this.sendChannelMessage(headers, message.targetId, text, message.replyToMessageId);
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<string | void>): void {
    this.messageHandler = handler;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  // ========== Access Token ==========

  private async getAccessToken(): Promise<string> {
    // 检查缓存是否有效（提前 5 分钟刷新）
    if (this._accessToken && Date.now() < this._tokenExpiresAt - 5 * 60 * 1000) {
      return this._accessToken;
    }

    log.info('正在获取 QQ 频道 access_token');

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: this.config.appId,
        clientSecret: this.config.appSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, body: errorText }, '获取 access_token 失败');
      throw new Error(`获取 QQ 频道 access_token 失败: HTTP ${response.status}`);
    }

    const data = await response.json() as { access_token?: string; expires_in?: number };

    if (!data.access_token) {
      log.error({ data }, 'access_token 响应无效');
      throw new Error('QQ 频道 access_token 响应无效');
    }

    this._accessToken = data.access_token;
    // expires_in 单位为秒
    this._tokenExpiresAt = Date.now() + (data.expires_in ?? 7200) * 1000;

    log.info('QQ 频道 access_token 获取成功');
    return this._accessToken;
  }

  // ========== Gateway ==========

  private async getGateway(): Promise<string> {
    const accessToken = await this.getAccessToken();

    const response = await fetch(`${this.apiBase}/gateway`, {
      headers: { 'Authorization': `QQBot ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, body: errorText }, '获取 Gateway 失败');
      throw new Error(`获取 QQ 频道 Gateway 失败: HTTP ${response.status}`);
    }

    const data = await response.json() as { url?: string };

    if (!data.url) {
      throw new Error('QQ 频道 Gateway 响应无效');
    }

    log.info({ url: data.url }, '获取 Gateway 成功');
    return data.url;
  }

  // ========== WebSocket ==========

  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      let resolved = false;

      this.ws.on('open', () => {
        log.info('WebSocket 连接已建立');
      });

      this.ws.on('message', (raw: Buffer) => {
        try {
          const payload = JSON.parse(raw.toString()) as QQGatewayPayload;
          this.handleGatewayPayload(payload);

          // READY 事件表示鉴权成功
          if (payload.op === OP_DISPATCH && payload.t === 'READY' && !resolved) {
            resolved = true;
            resolve();
          }
        } catch (error) {
          log.error({ error, raw: raw.toString().slice(0, 500) }, '解析 WebSocket 消息失败');
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        log.warn({ code, reason: reason.toString() }, 'WebSocket 连接关闭');
        this.healthy = false;
        this.clearHeartbeat();

        if (!resolved) {
          resolved = true;
          reject(new Error(`WebSocket 关闭: ${code} ${reason.toString()}`));
        }

        // 自动重连
        if (!this.stopped) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: Error) => {
        log.error({ error }, 'WebSocket 错误');
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });
    });
  }

  private handleGatewayPayload(payload: QQGatewayPayload): void {
    // 更新序列号
    if (payload.s !== undefined && payload.s !== null) {
      this.lastSeq = payload.s;
    }

    switch (payload.op) {
      case OP_HELLO:
        this.handleHello(payload);
        break;
      case OP_DISPATCH:
        this.handleDispatch(payload);
        break;
      case OP_HEARTBEAT_ACK:
        log.debug('收到心跳 ACK');
        break;
      default:
        log.debug({ op: payload.op, t: payload.t }, '收到未处理的 opcode');
    }
  }

  private handleHello(payload: QQGatewayPayload): void {
    const data = payload.d as { heartbeat_interval?: number } | undefined;
    const heartbeatInterval = data?.heartbeat_interval ?? 45000;

    log.info({ heartbeatInterval }, '收到 Hello，开始心跳');

    // 启动心跳
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, heartbeatInterval);

    // 根据是否有 session 决定 Identify 还是 Resume
    if (this.sessionId && this.reconnecting) {
      this.sendResume();
    } else {
      this.sendIdentify();
    }
  }

  private sendIdentify(): void {
    this.getAccessToken().then(token => {
      const identify: QQGatewayPayload = {
        op: OP_IDENTIFY,
        d: {
          token: `QQBot ${token}`,
          intents: INTENT_GUILDS | INTENT_GUILD_MEMBERS | INTENT_GUILD_MESSAGES | INTENT_DIRECT_MESSAGE | INTENT_INTERACTION | INTENT_MESSAGE_AUDIT | INTENT_PUBLIC_GUILD_MESSAGES,
          shard: [0, 1],
        },
      };

      this.wsSend(identify);
      log.info('已发送 Identify');
    }).catch(error => {
      log.error({ error }, '获取 token 失败，无法 Identify');
    });
  }

  private sendResume(): void {
    this.getAccessToken().then(token => {
      const resume: QQGatewayPayload = {
        op: OP_RESUME,
        d: {
          token: `QQBot ${token}`,
          session_id: this.sessionId,
          seq: this.lastSeq ?? 0,
        },
      };

      this.wsSend(resume);
      log.info({ sessionId: this.sessionId, seq: this.lastSeq }, '已发送 Resume');
    }).catch(error => {
      log.error({ error }, '获取 token 失败，无法 Resume');
    });
  }

  private sendHeartbeat(): void {
    const heartbeat: QQGatewayPayload = {
      op: OP_HEARTBEAT,
      d: this.lastSeq,
    };

    this.wsSend(heartbeat);
    log.debug({ seq: this.lastSeq }, '发送心跳');
  }

  private handleDispatch(payload: QQGatewayPayload): void {
    const { t, d } = payload;

    switch (t) {
      case 'READY': {
        const readyData = d as QQReadyData;
        this.sessionId = readyData.session_id;
        this.botUserId = readyData.user?.id ?? null;
        this.healthy = true;
        this.reconnecting = false;
        log.info({
          sessionId: this.sessionId,
          botId: this.botUserId,
          botName: readyData.user?.username,
        }, 'QQ 频道机器人已就绪');
        break;
      }
      case 'RESUMED':
        this.healthy = true;
        this.reconnecting = false;
        log.info('QQ 频道 Resume 成功');
        break;
      case 'MESSAGE_CREATE':         // 私域：频道全量消息
      case 'AT_MESSAGE_CREATE':       // 公域：频道@消息
        this.handleMessage(d as QQMessageData, 'group');
        break;
      case 'DIRECT_MESSAGE_CREATE':
        this.handleMessage(d as QQMessageData, 'dm');
        break;
      default:
        log.debug({ event: t }, '收到未处理的事件');
    }
  }

  // ========== 消息处理 ==========

  private handleMessage(data: QQMessageData, conversationType: 'dm' | 'group'): void {
    try {
      // 忽略机器人自己发的消息
      if (data.author?.bot) {
        return;
      }

      let text = data.content?.trim() ?? '';

      // 频道群消息策略检查
      if (conversationType === 'group' && this.config.groupPolicy === 'mention') {
        // AT_MESSAGE_CREATE 事件本身就是被 @ 才触发的，但仍检查以确保
        const isMentioned = data.mentions?.some(m => m.id === this.botUserId);
        if (!isMentioned && this.botUserId) {
          return;
        }
      }

      // 移除 @机器人 的 mention 标记（格式为 <@!botId>）
      if (this.botUserId) {
        text = text.replace(new RegExp(`<@!?${this.botUserId}>`, 'g'), '').trim();
      }

      if (!text) {
        return;
      }

      const senderName = data.member?.nick ?? data.author?.username ?? 'Unknown';

      const message: InboundMessage = {
        id: data.id ?? generateId(),
        channelType: 'qq',
        channelId: data.guild_id ?? 'default',
        senderId: data.author?.id ?? 'unknown',
        senderName,
        conversationType,
        groupId: conversationType === 'group' ? data.channel_id : undefined,
        content: { type: 'text', text },
        timestamp: Date.now(),
        raw: data,
      };

      log.info({
        senderId: message.senderId,
        senderName: message.senderName,
        conversationType,
        textLength: text.length,
      }, '收到 QQ 频道消息');

      if (this.messageHandler) {
        this.processAndReply(message, data).catch(error => {
          log.error({ error, messageId: message.id }, '异步处理消息失败');
        });
      }
    } catch (error) {
      log.error({ error }, '处理 QQ 频道消息失败');
    }
  }

  private async processAndReply(message: InboundMessage, rawData: QQMessageData): Promise<void> {
    try {
      const response = await this.messageHandler!(message);
      const replyText = (typeof response === 'string' ? response : '') || '处理完成';

      // 截断超长回复
      let text = replyText;
      if (text.length > MAX_MESSAGE_LENGTH) {
        text = text.slice(0, MAX_MESSAGE_LENGTH) + '\n\n...(内容过长已截断)';
      }

      const accessToken = await this.getAccessToken();
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `QQBot ${accessToken}`,
      };

      if (message.conversationType === 'dm') {
        // 私信回复
        await this.sendDMMessage(headers, rawData.guild_id, text, rawData.id);
      } else {
        // 频道消息回复（被动回复需要 msg_id）
        await this.sendChannelMessage(headers, rawData.channel_id, text, rawData.id);
      }
    } catch (error) {
      const errText = error instanceof Error ? error.message : '处理消息时出错，请稍后重试。';
      log.error({ error: errText, messageId: message.id }, '处理消息或回复失败');

      // 尝试发送错误提示
      try {
        const accessToken = await this.getAccessToken();
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `QQBot ${accessToken}`,
        };
        const errorMsg = `⚠ ${errText}`;

        if (message.conversationType === 'dm') {
          await this.sendDMMessage(headers, rawData.guild_id, errorMsg, rawData.id);
        } else {
          await this.sendChannelMessage(headers, rawData.channel_id, errorMsg, rawData.id);
        }
      } catch {
        // ignore error notification failure
      }
    }
  }

  // ========== 发送消息 ==========

  private async sendChannelMessage(
    headers: Record<string, string>,
    channelId: string,
    content: string,
    msgId?: string,
  ): Promise<void> {
    const url = `${this.apiBase}/channels/${channelId}/messages`;

    const body: Record<string, unknown> = { content };
    if (msgId) {
      body.msg_id = msgId; // 被动回复
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, body: errorText, channelId }, '发送频道消息失败');
      }
    } catch (error) {
      log.error({ error, channelId }, '发送频道消息异常');
    }
  }

  private async sendDMMessage(
    headers: Record<string, string>,
    guildId: string,
    content: string,
    msgId?: string,
  ): Promise<void> {
    // 私信直接发到 /dms/{guild_id}/messages
    // 对于 DIRECT_MESSAGE_CREATE 事件，guild_id 就是私信会话的 guild_id
    const url = `${this.apiBase}/dms/${guildId}/messages`;

    const body: Record<string, unknown> = { content };
    if (msgId) {
      body.msg_id = msgId; // 被动回复
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, body: errorText, guildId }, '发送私信失败');
      }
    } catch (error) {
      log.error({ error, guildId }, '发送私信异常');
    }
  }

  // ========== 重连 ==========

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnecting) return;

    this.reconnecting = true;
    const delay = 5000; // 5 秒后重连

    log.info({ delay }, '计划重连');

    setTimeout(async () => {
      if (this.stopped) return;

      try {
        // 刷新 token
        await this.getAccessToken();
        const gatewayUrl = await this.getGateway();
        await this.connectWebSocket(gatewayUrl);
        log.info('重连成功');
      } catch (error) {
        log.error({ error }, '重连失败，将继续尝试');
        this.reconnecting = false;
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ========== 工具方法 ==========

  private wsSend(payload: QQGatewayPayload): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      log.warn({ op: payload.op }, 'WebSocket 未就绪，无法发送');
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
