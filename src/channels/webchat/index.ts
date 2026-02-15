import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { getLogger } from '../../utils/logger.js';
import { generateId } from '../../utils/crypto.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../interface.js';

const log = getLogger('webchat');

interface WebchatConfig {
  port: number;
}

interface WebchatClient {
  ws: WebSocket;
  userId: string;
  connectedAt: number;
}

export class WebchatAdapter implements ChannelAdapter {
  readonly name = 'webchat';
  readonly type = 'webchat';

  private config!: WebchatConfig;
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, WebchatClient>();
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private healthy = false;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as WebchatConfig;
    log.info({ port: this.config.port }, 'WebChat 适配器已初始化');
  }

  async start(): Promise<void> {
    this.httpServer = createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.getHtmlPage());
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = generateId();
      const client: WebchatClient = {
        ws,
        userId: `webchat_${clientId.slice(0, 8)}`,
        connectedAt: Date.now(),
      };
      this.clients.set(clientId, client);

      log.info({ clientId, userId: client.userId }, 'WebChat 客户端已连接');

      // 发送欢迎消息
      ws.send(JSON.stringify({
        type: 'system',
        content: `已连接到 HiveAgent WebChat (用户ID: ${client.userId})`,
      }));

      ws.on('message', async (data: Buffer) => {
        await this.handleWsMessage(client, data.toString());
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        log.info({ clientId }, 'WebChat 客户端已断开');
      });

      ws.on('error', (error) => {
        log.error({ clientId, error }, 'WebSocket 错误');
      });
    });

    return new Promise((resolve) => {
      this.httpServer!.listen(this.config.port, () => {
        this.healthy = true;
        log.info({ port: this.config.port }, 'WebChat 服务已启动');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // 关闭所有客户端连接
    for (const [, client] of this.clients) {
      client.ws.close();
    }
    this.clients.clear();

    // 关闭 WebSocket 服务
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // 关闭 HTTP 服务
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          this.healthy = false;
          log.info('WebChat 服务已停止');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    const targetClient = this.findClient(message.targetId);
    if (!targetClient) {
      log.warn({ targetId: message.targetId }, '目标客户端未找到');
      return;
    }

    if (targetClient.ws.readyState === WebSocket.OPEN) {
      targetClient.ws.send(JSON.stringify({
        type: 'message',
        content: message.content.text ?? '',
        timestamp: Date.now(),
      }));
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  private async handleWsMessage(client: WebchatClient, rawData: string): Promise<void> {
    try {
      const data = JSON.parse(rawData) as { type?: string; content?: string };

      if (data.type !== 'message' || !data.content) return;

      const message: InboundMessage = {
        id: generateId(),
        channelType: 'webchat',
        channelId: 'webchat',
        senderId: client.userId,
        senderName: client.userId,
        conversationType: 'dm',
        content: { type: 'text', text: data.content },
        timestamp: Date.now(),
      };

      log.info({
        userId: client.userId,
        textLength: data.content.length,
      }, '收到 WebChat 消息');

      if (this.messageHandler) {
        // 发送"正在输入"提示
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: 'typing', content: true }));
        }

        const response = await this.messageHandler(message);

        // 发送回复
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'message',
            role: 'assistant',
            content: response,
            timestamp: Date.now(),
          }));
          client.ws.send(JSON.stringify({ type: 'typing', content: false }));
        }
      }
    } catch (error) {
      log.error({ error }, 'WebChat 消息处理失败');
    }
  }

  private findClient(userId: string): WebchatClient | undefined {
    for (const client of this.clients.values()) {
      if (client.userId === userId) return client;
    }
    return undefined;
  }

  private getHtmlPage(): string {
    return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HiveAgent WebChat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; height: 100vh; display: flex; flex-direction: column; }
    .header { background: #1a1a2e; color: white; padding: 16px 24px; font-size: 18px; font-weight: 600; }
    .chat { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .msg { max-width: 80%; padding: 12px 16px; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .msg.user { align-self: flex-end; background: #1a1a2e; color: white; border-bottom-right-radius: 4px; }
    .msg.assistant { align-self: flex-start; background: white; color: #333; border-bottom-left-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .msg.system { align-self: center; background: #e8e8e8; color: #666; font-size: 13px; border-radius: 20px; padding: 6px 16px; }
    .typing { align-self: flex-start; color: #999; font-size: 13px; padding: 4px 0; }
    .input-area { padding: 16px; background: white; border-top: 1px solid #e0e0e0; display: flex; gap: 8px; }
    .input-area input { flex: 1; padding: 12px 16px; border: 1px solid #ddd; border-radius: 24px; outline: none; font-size: 15px; }
    .input-area input:focus { border-color: #1a1a2e; }
    .input-area button { padding: 12px 24px; background: #1a1a2e; color: white; border: none; border-radius: 24px; cursor: pointer; font-size: 15px; }
    .input-area button:hover { background: #16213e; }
    .input-area button:disabled { background: #ccc; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="header">HiveAgent WebChat</div>
  <div class="chat" id="chat"></div>
  <div class="input-area">
    <input type="text" id="input" placeholder="输入消息..." autocomplete="off" />
    <button id="send" onclick="sendMsg()">发送</button>
  </div>
  <script>
    const chat = document.getElementById('chat');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    let ws;
    let typingEl;

    function connect() {
      ws = new WebSocket('ws://' + location.host);
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'typing') {
          if (data.content) {
            if (!typingEl) { typingEl = document.createElement('div'); typingEl.className = 'typing'; typingEl.textContent = '正在输入...'; chat.appendChild(typingEl); }
          } else {
            if (typingEl) { typingEl.remove(); typingEl = null; }
          }
        } else if (data.type === 'system') {
          addMsg(data.content, 'system');
        } else if (data.type === 'message') {
          if (typingEl) { typingEl.remove(); typingEl = null; }
          addMsg(data.content, data.role || 'assistant');
          sendBtn.disabled = false;
        }
        chat.scrollTop = chat.scrollHeight;
      };
      ws.onclose = () => { addMsg('连接已断开，正在重连...', 'system'); setTimeout(connect, 3000); };
    }

    function addMsg(text, role) {
      const el = document.createElement('div');
      el.className = 'msg ' + role;
      el.textContent = text;
      chat.appendChild(el);
      chat.scrollTop = chat.scrollHeight;
    }

    function sendMsg() {
      const text = input.value.trim();
      if (!text || !ws || ws.readyState !== 1) return;
      addMsg(text, 'user');
      ws.send(JSON.stringify({ type: 'message', content: text }));
      input.value = '';
      sendBtn.disabled = true;
    }

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
    connect();
  </script>
</body>
</html>`;
  }
}
