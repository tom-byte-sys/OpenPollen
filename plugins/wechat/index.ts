import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createDecipheriv, createHash } from 'node:crypto';
import { getLogger } from '../../src/utils/logger.js';
import { generateId } from '../../src/utils/crypto.js';
import type { ChannelPlugin, PluginManifest } from '../../src/plugins/types.js';
import type { InboundMessage, OutboundMessage } from '../../src/channels/interface.js';

const log = getLogger('wechat');

interface WechatConfig {
  corpId: string;
  agentId: string;
  secret: string;
  token: string;
  encodingAESKey: string;
  callbackPort: number;
}

export default class WechatPlugin implements ChannelPlugin {
  manifest: PluginManifest = {
    name: 'wechat',
    version: '1.0.0',
    slot: 'channel',
    description: '企业微信聊天平台适配器',
  };
  readonly name = 'wechat';
  readonly type = 'wechat';

  private config!: WechatConfig;
  private server: Server | null = null;
  private messageHandler?: (message: InboundMessage) => Promise<string | void>;
  private healthy = false;

  // Access token 缓存
  private _accessToken: string | null = null;
  private _tokenExpiresAt = 0;

  // AES key decoded from encodingAESKey
  private aesKey!: Buffer;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as WechatConfig;

    if (!this.config.corpId) {
      throw new Error('企业微信配置缺少 corpId');
    }
    if (!this.config.secret) {
      throw new Error('企业微信配置缺少 secret');
    }
    if (!this.config.token) {
      throw new Error('企业微信配置缺少 token');
    }
    if (!this.config.encodingAESKey) {
      throw new Error('企业微信配置缺少 encodingAESKey');
    }

    this.config.callbackPort = this.config.callbackPort ?? 3002;

    // 解码 AES key: encodingAESKey 是 Base64 编码的 43 字符，解码后 32 字节
    this.aesKey = Buffer.from(this.config.encodingAESKey + '=', 'base64');

    log.info('企业微信插件已初始化');
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleHttpRequest(req, res).catch(error => {
          log.error({ error }, '处理 HTTP 请求失败');
          res.writeHead(500);
          res.end('Internal Server Error');
        });
      });

      this.server.on('error', (error) => {
        this.healthy = false;
        log.error({ error }, '企业微信 HTTP 服务错误');
        reject(error);
      });

      this.server.listen(this.config.callbackPort, () => {
        this.healthy = true;
        log.info({ port: this.config.callbackPort }, '企业微信回调服务已启动');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
    this.healthy = false;
    this._accessToken = null;
    this._tokenExpiresAt = 0;
    log.info('企业微信插件已停止');
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    const accessToken = await this.getAccessToken();

    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;

    const body = {
      touser: message.targetId,
      msgtype: 'text',
      agentid: parseInt(this.config.agentId, 10),
      text: {
        content: message.content.text ?? '',
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, body: errorText }, '发送企业微信消息失败');
        return;
      }

      const result = await response.json() as { errcode?: number; errmsg?: string };
      if (result.errcode && result.errcode !== 0) {
        log.error({ errcode: result.errcode, errmsg: result.errmsg }, '企业微信消息发送返回错误');
      }
    } catch (error) {
      log.error({ error, targetId: message.targetId }, '发送企业微信消息异常');
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<string | void>): void {
    this.messageHandler = handler;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost:${this.config.callbackPort}`);

    const msgSignature = url.searchParams.get('msg_signature') ?? '';
    const timestamp = url.searchParams.get('timestamp') ?? '';
    const nonce = url.searchParams.get('nonce') ?? '';

    // GET 请求：URL 验证
    if (req.method === 'GET') {
      const echostr = url.searchParams.get('echostr') ?? '';
      if (this.verifySignature(msgSignature, timestamp, nonce, echostr)) {
        const decrypted = this.decryptMessage(echostr);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(decrypted);
      } else {
        log.warn('URL 验证签名失败');
        res.writeHead(403);
        res.end('Forbidden');
      }
      return;
    }

    // POST 请求：接收消息
    if (req.method === 'POST') {
      const body = await this.readBody(req);
      const encryptedMsg = this.extractXmlField(body, 'Encrypt');

      if (!encryptedMsg) {
        log.warn('未找到加密消息字段');
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }

      if (!this.verifySignature(msgSignature, timestamp, nonce, encryptedMsg)) {
        log.warn('消息签名验证失败');
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const decryptedXml = this.decryptMessage(encryptedMsg);
      const msgType = this.extractXmlField(decryptedXml, 'MsgType');
      const content = this.extractXmlField(decryptedXml, 'Content');
      const fromUser = this.extractXmlField(decryptedXml, 'FromUserName');
      const msgId = this.extractXmlField(decryptedXml, 'MsgId');

      // 仅处理文本消息
      if (msgType === 'text' && content && fromUser) {
        const message: InboundMessage = {
          id: msgId ?? generateId(),
          channelType: 'wechat',
          channelId: this.config.corpId,
          senderId: fromUser,
          senderName: fromUser,
          conversationType: 'dm',
          content: { type: 'text', text: content },
          timestamp: Date.now(),
          raw: decryptedXml,
        };

        log.info({
          senderId: message.senderId,
          textLength: content.length,
        }, '收到企业微信消息');

        if (this.messageHandler) {
          this.processAndReply(message).catch(error => {
            log.error({ error, messageId: message.id }, '异步处理消息失败');
          });
        }
      }

      // 立即返回 success 避免企业微信重试
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('success');
      return;
    }

    res.writeHead(405);
    res.end('Method Not Allowed');
  }

  private async processAndReply(message: InboundMessage): Promise<void> {
    try {
      const response = await this.messageHandler!(message);
      const replyText = (typeof response === 'string' ? response : '') || '处理完成';

      // 通过主动发送 API 回复
      await this.sendMessage({
        conversationType: 'dm',
        targetId: message.senderId,
        content: { type: 'text', text: replyText },
      });
    } catch (error) {
      log.error({ error, messageId: message.id }, '处理消息或回复失败');
    }
  }

  private async getAccessToken(): Promise<string> {
    // 检查缓存是否有效（提前 5 分钟刷新）
    if (this._accessToken && Date.now() < this._tokenExpiresAt - 5 * 60 * 1000) {
      return this._accessToken;
    }

    log.info('正在获取企业微信 access_token');

    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(this.config.corpId)}&corpsecret=${encodeURIComponent(this.config.secret)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`获取企业微信 access_token 失败: HTTP ${response.status}`);
    }

    const data = await response.json() as {
      errcode?: number;
      errmsg?: string;
      access_token?: string;
      expires_in?: number;
    };

    if (data.errcode && data.errcode !== 0) {
      throw new Error(`获取企业微信 access_token 失败: ${data.errmsg}`);
    }

    if (!data.access_token) {
      throw new Error('企业微信 access_token 响应无效');
    }

    this._accessToken = data.access_token;
    this._tokenExpiresAt = Date.now() + (data.expires_in ?? 7200) * 1000;

    log.info('企业微信 access_token 获取成功');
    return this._accessToken;
  }

  private verifySignature(msgSignature: string, timestamp: string, nonce: string, encrypt: string): boolean {
    const arr = [this.config.token, timestamp, nonce, encrypt].sort();
    const hash = createHash('sha1').update(arr.join('')).digest('hex');
    return hash === msgSignature;
  }

  private decryptMessage(encrypted: string): string {
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const iv = encryptedBuffer.subarray(0, 16);
    const decipher = createDecipheriv('aes-256-cbc', this.aesKey, iv);
    decipher.setAutoPadding(false);

    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer.subarray(16)),
      decipher.final(),
    ]);

    // 去除 PKCS7 padding
    const padLen = decrypted[decrypted.length - 1];
    const content = decrypted.subarray(0, decrypted.length - padLen);

    // 格式: 16 字节随机串 + 4 字节消息长度 + 消息内容 + corpId
    const msgLen = content.readUInt32BE(16);
    const msgContent = content.subarray(20, 20 + msgLen);

    return msgContent.toString('utf8');
  }

  private extractXmlField(xml: string, field: string): string | null {
    // 处理 CDATA 格式: <Field><![CDATA[value]]></Field>
    const cdataMatch = new RegExp(`<${field}><!\\\[CDATA\\\[([\\s\\S]*?)\\\]\\\]></${field}>`).exec(xml);
    if (cdataMatch) return cdataMatch[1];

    // 处理普通格式: <Field>value</Field>
    const plainMatch = new RegExp(`<${field}>([\\s\\S]*?)</${field}>`).exec(xml);
    if (plainMatch) return plainMatch[1];

    return null;
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
}
