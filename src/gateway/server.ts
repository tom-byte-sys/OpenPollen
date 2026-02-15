import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { getLogger } from '../utils/logger.js';
import { AuthService } from './auth.js';
import type { AppConfig } from '../config/schema.js';
import type { MessageRouter } from './router.js';

const log = getLogger('server');

export interface GatewayServerOptions {
  config: AppConfig['gateway'];
  router: MessageRouter;
}

export class GatewayServer {
  private httpServer: Server | null = null;
  private config: AppConfig['gateway'];
  private router: MessageRouter;
  private auth: AuthService;

  constructor(options: GatewayServerOptions) {
    this.config = options.config;
    this.router = options.router;
    this.auth = new AuthService(this.config.auth);
  }

  async start(): Promise<void> {
    this.httpServer = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.config.port, this.config.host, () => {
        log.info({ host: this.config.host, port: this.config.port }, 'Gateway HTTP 服务已启动');
        resolve();
      });
      this.httpServer!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          log.info('Gateway HTTP 服务已停止');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/health' && req.method === 'GET') {
      this.handleHealth(res);
      return;
    }

    if (url.pathname === '/api/status' && req.method === 'GET') {
      this.handleStatus(res);
      return;
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      await this.handleChat(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  private handleHealth(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  }

  private handleStatus(res: ServerResponse): void {
    const stats = this.router.getStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      ...stats,
      uptime: process.uptime(),
    }));
  }

  private async handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // 认证校验
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'] as string | undefined;
      const authResult = await this.auth.verify({
        apiKey,
        jwt: authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined,
      });

      if (!authResult.authenticated) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: authResult.error ?? '认证失败' }));
        return;
      }

      const body = await readBody(req);
      const data = JSON.parse(body) as { message?: string; userId?: string };

      if (!data.message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '缺少 message 字段' }));
        return;
      }

      const userId = authResult.userId ?? data.userId ?? 'http-user';

      const response = await this.router.handleMessage({
        id: `http_${Date.now()}`,
        channelType: 'http',
        channelId: 'http',
        senderId: userId,
        senderName: 'HTTP User',
        conversationType: 'dm',
        content: { type: 'text', text: data.message },
        timestamp: Date.now(),
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ response }));
    } catch (error) {
      log.error({ error }, 'HTTP 聊天请求处理失败');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '内部服务器错误' }));
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
