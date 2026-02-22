import { getLogger } from '../../src/utils/logger.js';
import { generateId } from '../../src/utils/crypto.js';
import type { ChannelPlugin, PluginManifest } from '../../src/plugins/types.js';
import type { InboundMessage, OutboundMessage } from '../../src/channels/interface.js';

const log = getLogger('email');

const MAX_THREAD_CACHE_SIZE = 1000;

interface EmailConfig {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpTls: boolean;
  fromName?: string;
  fromAddress: string;
  pollIntervalSeconds: number;
  useIdle: boolean;
  mailbox: string;
  allowedSenders?: string[];
  blockedSenders?: string[];
  maxEmailBodyLength: number;
}

// ImapFlow types (dynamic import)
interface ImapFlowClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  idle(): Promise<boolean>;
  getMailboxLock(mailbox: string): Promise<{ release: () => void }>;
  fetchOne(seq: string, query: Record<string, boolean>): Promise<ImapMessage | null>;
  fetch(range: string, query: Record<string, boolean>): AsyncIterable<ImapMessage>;
  search(criteria: Record<string, boolean>, options?: Record<string, boolean>): Promise<number[]>;
  messageFlagsAdd(seq: string, flags: string[]): Promise<boolean>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  usable: boolean;
}

interface ImapMessage {
  uid: number;
  source: Buffer;
  envelope?: {
    from?: Array<{ address?: string; name?: string }>;
    subject?: string;
    messageId?: string;
    inReplyTo?: string;
  };
}

interface ParsedMail {
  from?: { value: Array<{ address?: string; name?: string }> };
  to?: { value: Array<{ address?: string; name?: string }> };
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string | string[];
  attachments?: Array<{ filename?: string }>;
}

export default class EmailPlugin implements ChannelPlugin {
  manifest: PluginManifest = {
    name: 'email',
    version: '1.0.0',
    slot: 'channel',
    description: 'Email 渠道适配器 (IMAP/SMTP)',
  };
  readonly name = 'email';
  readonly type = 'email';

  private config!: EmailConfig;
  private imapClient: ImapFlowClient | null = null;
  private smtpTransport: import('nodemailer').Transporter | null = null;
  private messageHandler?: (message: InboundMessage) => Promise<string | void>;
  private healthy = false;
  private stopping = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  // Thread tracking: senderId -> latest Message-ID
  private threadMap = new Map<string, { messageId: string; subject: string }>();

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as EmailConfig;

    if (!this.config.imapHost || !this.config.imapUser || !this.config.imapPassword) {
      throw new Error('Email 配置缺少 IMAP 连接信息 (imapHost, imapUser, imapPassword)');
    }
    if (!this.config.smtpHost || !this.config.smtpUser || !this.config.smtpPassword) {
      throw new Error('Email 配置缺少 SMTP 连接信息 (smtpHost, smtpUser, smtpPassword)');
    }
    if (!this.config.fromAddress) {
      throw new Error('Email 配置缺少 fromAddress');
    }

    // 填充默认值（框架通过 TypeBox schema 注入默认值，但直接调用时需要兜底）
    this.config.imapPort ??= 993;
    this.config.imapTls ??= true;
    this.config.smtpPort ??= 465;
    this.config.smtpTls ??= true;
    this.config.pollIntervalSeconds ??= 30;
    this.config.useIdle ??= true;
    this.config.mailbox ??= 'INBOX';
    this.config.maxEmailBodyLength ??= 10000;

    log.info({ imapHost: this.config.imapHost, smtpHost: this.config.smtpHost }, 'Email 插件已初始化');
  }

  async start(): Promise<void> {
    this.stopping = false;

    try {
      // 初始化 SMTP transporter
      const nodemailer = await import('nodemailer');
      this.smtpTransport = nodemailer.createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpTls,
        auth: {
          user: this.config.smtpUser,
          pass: this.config.smtpPassword,
        },
      });

      // 验证 SMTP 连接
      await this.smtpTransport.verify();
      log.info('SMTP 连接验证成功');

      // 连接 IMAP
      await this.connectImap();

      this.healthy = true;
      log.info('Email 插件已启动');
    } catch (error) {
      this.healthy = false;
      log.error({ error }, 'Email 插件启动失败');
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.imapClient) {
      try {
        await this.imapClient.logout();
      } catch {
        // ignore disconnect errors
      }
      this.imapClient = null;
    }

    if (this.smtpTransport) {
      this.smtpTransport.close();
      this.smtpTransport = null;
    }

    this.threadMap.clear();
    this.healthy = false;
    log.info('Email 插件已停止');
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    if (!this.smtpTransport) {
      throw new Error('SMTP 未连接');
    }

    const recipientEmail = message.targetId;
    let text = message.content.text ?? '';

    // 获取线程信息用于邮件会话
    const thread = this.threadMap.get(recipientEmail);

    const mailOptions: Record<string, unknown> = {
      from: this.config.fromName
        ? `"${this.config.fromName}" <${this.config.fromAddress}>`
        : this.config.fromAddress,
      to: recipientEmail,
      subject: thread ? thread.subject : 'Re: OpenPollen',
      text,
      html: this.textToHtml(text),
    };

    // 设置线程 headers
    if (thread) {
      mailOptions.inReplyTo = thread.messageId;
      mailOptions.references = thread.messageId;
    }

    try {
      const info = await this.smtpTransport.sendMail(mailOptions);
      log.info({ to: recipientEmail, messageId: info.messageId }, '邮件发送成功');

      // 更新线程追踪
      if (info.messageId) {
        this.updateThreadMap(recipientEmail, info.messageId as string, (thread?.subject ?? 'Re: OpenPollen'));
      }
    } catch (error) {
      log.error({ error, to: recipientEmail }, '邮件发送失败');
      throw error;
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<string | void>): void {
    this.messageHandler = handler;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  // --- IMAP connection ---

  private async connectImap(): Promise<void> {
    const { ImapFlow } = await import('imapflow');

    this.imapClient = new ImapFlow({
      host: this.config.imapHost,
      port: this.config.imapPort,
      secure: this.config.imapTls,
      auth: {
        user: this.config.imapUser,
        pass: this.config.imapPassword,
      },
      logger: false,
    }) as unknown as ImapFlowClient;

    this.imapClient.on('error', (err: unknown) => {
      log.error({ error: err }, 'IMAP 连接错误');
      this.healthy = false;
      if (!this.stopping) {
        this.scheduleReconnect();
      }
    });

    this.imapClient.on('close', () => {
      log.warn('IMAP 连接已关闭');
      this.healthy = false;
      if (!this.stopping) {
        this.scheduleReconnect();
      }
    });

    await this.imapClient.connect();
    log.info('IMAP 连接成功');
    this.reconnectDelay = 1000; // 重置退避延迟

    // 先拉取一次未读邮件
    await this.fetchAndProcessUnseen();

    // 启动监听
    if (this.config.useIdle) {
      this.startIdleListener();
    } else {
      this.startPolling();
    }
  }

  private startIdleListener(): void {
    if (this.stopping || !this.imapClient) return;

    const runIdle = async () => {
      if (this.stopping || !this.imapClient) return;

      let lock: { release: () => void } | null = null;
      try {
        lock = await this.imapClient.getMailboxLock(this.config.mailbox);

        // 监听新邮件事件
        this.imapClient.on('exists', () => {
          log.debug('收到新邮件通知 (IDLE exists)');
          this.fetchAndProcessUnseen().catch(err => {
            log.error({ error: err }, '处理新邮件失败');
          });
        });

        // IDLE 会阻塞直到有事件或超时
        while (!this.stopping && this.imapClient?.usable) {
          try {
            await this.imapClient.idle();
          } catch (err) {
            if (!this.stopping) {
              log.warn({ error: err }, 'IDLE 中断，将重试');
            }
            break;
          }
        }
      } catch (err) {
        log.error({ error: err }, 'IDLE 监听失败，降级为轮询模式');
        if (!this.stopping) {
          this.startPolling();
        }
      } finally {
        lock?.release();
      }
    };

    runIdle().catch(err => {
      log.error({ error: err }, 'IDLE 运行异常');
      if (!this.stopping) {
        this.startPolling();
      }
    });
  }

  private startPolling(): void {
    if (this.stopping) return;

    const poll = async () => {
      if (this.stopping) return;

      try {
        await this.fetchAndProcessUnseen();
      } catch (err) {
        log.error({ error: err }, '轮询拉取邮件失败');
      }

      if (!this.stopping) {
        this.pollTimer = setTimeout(poll, this.config.pollIntervalSeconds * 1000);
      }
    };

    this.pollTimer = setTimeout(poll, this.config.pollIntervalSeconds * 1000);
    log.info({ intervalSeconds: this.config.pollIntervalSeconds }, '已启动轮询模式');
  }

  private async fetchAndProcessUnseen(): Promise<void> {
    if (!this.imapClient || !this.imapClient.usable) return;

    let lock: { release: () => void } | null = null;
    try {
      lock = await this.imapClient.getMailboxLock(this.config.mailbox);

      // 搜索未读邮件，返回 UID 列表
      const rawUids = await this.imapClient.search({ seen: false }, { uid: true });
      const uids = Array.from(rawUids as Iterable<number>);

      if (uids.length === 0) return;

      log.info({ count: uids.length }, '发现未读邮件');

      for (const uid of uids) {
        if (this.stopping) break;

        try {
          // 使用 fetch 按 UID 获取邮件源码（第三个参数 { uid: true } 指定按 UID 检索）
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imapClient = this.imapClient as any;
          const msg = await imapClient.fetchOne(uid, { source: true }, { uid: true });
          if (msg?.source) {
            await this.processEmail(msg);
          }
          // 按 UID 标记为已读
          await imapClient.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        } catch (err) {
          log.error({ error: err, uid }, '处理邮件失败');
        }
      }
    } finally {
      lock?.release();
    }
  }

  private async processEmail(msg: ImapMessage): Promise<void> {
    const { simpleParser } = await import('mailparser');
    const parsed: ParsedMail = await simpleParser(msg.source) as unknown as ParsedMail;

    const fromAddress = parsed.from?.value?.[0]?.address;
    const fromName = parsed.from?.value?.[0]?.name ?? fromAddress ?? 'Unknown';

    if (!fromAddress) {
      log.warn('邮件缺少发件人地址，已跳过');
      return;
    }

    // 自回复防护
    if (fromAddress.toLowerCase() === this.config.fromAddress.toLowerCase()) {
      log.debug({ from: fromAddress }, '跳过自身发出的邮件');
      return;
    }

    // 跳过 noreply / no-reply 地址
    const lowerFrom = fromAddress.toLowerCase();
    if (lowerFrom.startsWith('noreply@') || lowerFrom.startsWith('no-reply@') || lowerFrom.startsWith('no_reply@')) {
      log.debug({ from: fromAddress }, '跳过 noreply 地址');
      return;
    }

    // 发件人过滤
    if (!this.isSenderAllowed(fromAddress)) {
      log.debug({ from: fromAddress }, '发件人不在允许列表中，已跳过');
      return;
    }

    // 提取并清理邮件正文
    let body = parsed.text ?? '';
    body = this.stripQuotedText(body);
    if (body.length > this.config.maxEmailBodyLength) {
      body = body.slice(0, this.config.maxEmailBodyLength) + '\n...(邮件内容过长已截断)';
    }

    // 附件说明
    if (parsed.attachments && parsed.attachments.length > 0) {
      const names = parsed.attachments.map(a => a.filename ?? 'unnamed').join(', ');
      body += `\n[Attachments: ${names}]`;
    }

    const subject = parsed.subject ?? '(no subject)';
    const messageId = parsed.messageId ?? generateId();

    // 更新线程追踪
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    this.updateThreadMap(fromAddress, messageId, replySubject);

    const message: InboundMessage = {
      id: generateId(),
      channelType: 'email',
      channelId: this.config.fromAddress,
      senderId: fromAddress,
      senderName: fromName,
      conversationType: 'dm',
      content: { type: 'text', text: body.trim() },
      timestamp: Date.now(),
      raw: {
        subject,
        messageId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
      },
    };

    log.info({
      from: fromAddress,
      subject,
      bodyLength: body.length,
    }, '收到邮件');

    if (this.messageHandler) {
      this.processAndReply(message).catch(error => {
        log.error({ error, messageId: message.id }, '处理邮件消息失败');
      });
    }
  }

  private async processAndReply(message: InboundMessage): Promise<void> {
    try {
      const response = await this.messageHandler!(message);
      const replyText = (typeof response === 'string' ? response : '') || '处理完成';

      await this.sendMessage({
        conversationType: 'dm',
        targetId: message.senderId,
        content: { type: 'text', text: replyText },
        replyToMessageId: message.id,
      });
    } catch (error) {
      log.error({ error, messageId: message.id }, '处理或回复邮件失败');

      // 尝试发送错误通知
      try {
        const errText = error instanceof Error ? error.message : '处理邮件时出错，请稍后重试。';
        await this.sendMessage({
          conversationType: 'dm',
          targetId: message.senderId,
          content: { type: 'text', text: `⚠ ${errText}` },
        });
      } catch {
        // ignore error notification failure
      }
    }
  }

  // --- Utility methods ---

  private stripQuotedText(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];

    for (const line of lines) {
      // 停止在 "On ... wrote:" 标记处
      if (/^On .+ wrote:$/.test(line.trim())) break;
      // 停止在 "---------- Forwarded message" 标记处
      if (/^-{5,}\s*(Forwarded|Original)\s+message/i.test(line.trim())) break;
      // 停止在 "From: " 引用头处
      if (/^From:\s+.+/.test(line.trim()) && result.length > 0) break;
      // 跳过引用行 (以 > 开头)
      if (line.trimStart().startsWith('>')) continue;

      result.push(line);
    }

    return result.join('\n').trim();
  }

  private isSenderAllowed(sender: string): boolean {
    const email = sender.toLowerCase();

    // 如果设置了白名单，只允许白名单中的
    if (this.config.allowedSenders && this.config.allowedSenders.length > 0) {
      return this.config.allowedSenders.some(s => email === s.toLowerCase());
    }

    // 如果设置了黑名单，排除黑名单中的
    if (this.config.blockedSenders && this.config.blockedSenders.length > 0) {
      return !this.config.blockedSenders.some(s => email === s.toLowerCase());
    }

    return true;
  }

  private textToHtml(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return `<div style="font-family: sans-serif; line-height: 1.6;">${escaped}</div>`;
  }

  private updateThreadMap(sender: string, messageId: string, subject: string): void {
    this.threadMap.set(sender, { messageId, subject });

    // LRU 清理：超过上限时删除最旧的条目
    if (this.threadMap.size > MAX_THREAD_CACHE_SIZE) {
      const firstKey = this.threadMap.keys().next().value;
      if (firstKey !== undefined) {
        this.threadMap.delete(firstKey);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;

    log.info({ delayMs: this.reconnectDelay }, '计划 IMAP 重连');

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.stopping) return;

      try {
        // 清理旧连接
        if (this.imapClient) {
          try { await this.imapClient.logout(); } catch { /* ignore */ }
          this.imapClient = null;
        }

        await this.connectImap();
        this.healthy = true;
        log.info('IMAP 重连成功');
      } catch (error) {
        log.error({ error }, 'IMAP 重连失败');
        // 指数退避，最大 60 秒
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
        this.scheduleReconnect();
      }
    }, this.reconnectDelay);
  }
}
