import { resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { getLogger } from '../../utils/logger.js';
import { generateId } from '../../utils/crypto.js';
import { createUiHttpServer, type UiServerConfig } from './ui-server.js';
import { performHandshake } from './handshake.js';
import { RpcDispatcher, type DispatcherDeps } from './rpc-dispatcher.js';
import { AbortManager } from './abort-manager.js';
import { ChatHistoryStore } from './history-store.js';
import { eventFrame } from './protocol.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../interface.js';
import type { MessageRouter } from '../../gateway/router.js';
import type { SessionManager } from '../../gateway/session.js';
import type { MemoryStore } from '../../memory/interface.js';
import type { AppConfig } from '../../config/schema.js';
import type { SkillManager } from '../../agent/skill-manager.js';
import type { CronScheduler } from '../../cron/scheduler.js';
import type { Server } from 'node:http';

const log = getLogger('webchat');

const SERVER_VERSION = '0.1.0';

export interface WebchatConfig {
  port: number;
  assistantName?: string;
}

interface ConnectedClient {
  ws: WebSocket;
  connId: string;
  userId: string;
  connectedAt: number;
}

export class WebchatAdapter implements ChannelAdapter {
  readonly name = 'webchat';
  readonly type = 'webchat';

  private config!: WebchatConfig;
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ConnectedClient>();
  private dispatcher!: RpcDispatcher;
  private abortManager = new AbortManager();
  private historyStore!: ChatHistoryStore;
  private healthy = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  private lastTickTs: number | null = null;

  // Injected dependencies
  private router!: MessageRouter;
  private sessionManager!: SessionManager;
  private memory!: MemoryStore;
  private appConfig!: AppConfig;
  private configFilePath: string | null = null;
  private reloadConfig: (() => Promise<void>) = async () => {};
  private skillManager!: SkillManager;
  private cronScheduler!: CronScheduler;

  // The onMessage handler from the ChannelAdapter interface (unused here
  // since we call router.handleMessage directly, but kept for interface compliance)
  private messageHandler?: (message: InboundMessage, onChunk?: (text: string) => void) => Promise<string | void>;

  /**
   * Inject dependencies that are not available via the standard ChannelAdapter.initialize().
   * Must be called before start().
   */
  inject(deps: {
    router: MessageRouter;
    sessionManager: SessionManager;
    memory: MemoryStore;
    appConfig: AppConfig;
    configFilePath: string | null;
    reloadConfig: () => Promise<void>;
    skillManager: SkillManager;
    cronScheduler: CronScheduler;
  }): void {
    this.router = deps.router;
    this.sessionManager = deps.sessionManager;
    this.memory = deps.memory;
    this.appConfig = deps.appConfig;
    this.configFilePath = deps.configFilePath;
    this.reloadConfig = deps.reloadConfig;
    this.skillManager = deps.skillManager;
    this.cronScheduler = deps.cronScheduler;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config as unknown as WebchatConfig;
    log.info({ port: this.config.port }, 'WebChat adapter initialized');
  }

  async start(): Promise<void> {
    if (!this.router || !this.sessionManager || !this.memory || !this.cronScheduler) {
      throw new Error('WebchatAdapter: call inject() before start()');
    }

    this.historyStore = new ChatHistoryStore(this.memory);

    const deps: DispatcherDeps = {
      router: this.router,
      sessionManager: this.sessionManager,
      memory: this.memory,
      abortManager: this.abortManager,
      historyStore: this.historyStore,
      appConfig: this.appConfig,
      configFilePath: this.configFilePath,
      reloadConfig: this.reloadConfig,
      getLastHeartbeatTs: () => this.lastTickTs,
      skillManager: this.skillManager,
      cronScheduler: this.cronScheduler,
    };
    this.dispatcher = new RpcDispatcher(deps);

    // Resolve UI directory
    const uiDir = resolve(import.meta.dirname ?? '.', '..', '..', '..', 'dist', 'control-ui');

    const uiConfig: UiServerConfig = {
      port: this.config.port,
      uiDir,
      assistantName: this.config.assistantName,
    };

    // Create HTTP server for static files
    this.httpServer = createUiHttpServer(uiConfig);

    // Create WebSocket server on the same HTTP server
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleNewConnection(ws);
    });

    // Start tick heartbeat (every 30s)
    this.tickTimer = setInterval(() => {
      this.broadcastTick();
    }, 30_000);

    return new Promise((resolve) => {
      this.httpServer!.listen(this.config.port, () => {
        this.healthy = true;
        log.info({ port: this.config.port }, 'WebChat server started');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.closeAllConnections();
        this.httpServer.close(() => {
          this.healthy = false;
          log.info('WebChat server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    log.debug({ targetId: message.targetId }, 'sendMessage called (no-op for WebChat)');
  }

  onMessage(handler: (message: InboundMessage, onChunk?: (text: string) => void) => Promise<string | void>): void {
    this.messageHandler = handler;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  private handleNewConnection(ws: WebSocket): void {
    const tempId = generateId();
    log.info({ tempId }, 'New WebSocket connection, starting handshake');

    performHandshake(ws, SERVER_VERSION)
      .then(({ connId, deviceId, onFirstRequest }) => {
        const userId = deviceId ? `webchat_${deviceId.slice(0, 12)}` : `webchat_${connId.slice(0, 8)}`;
        const client: ConnectedClient = {
          ws,
          connId,
          userId,
          connectedAt: Date.now(),
        };
        this.clients.set(connId, client);

        log.info({ connId, userId }, 'Client connected');

        onFirstRequest((frame) => {
          this.dispatcher.dispatch(frame, ws, userId).then(response => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(response));
            }
          }).catch(err => {
            log.error({ error: err, method: frame.method }, 'Dispatch error');
          });
        });

        ws.on('close', () => {
          this.clients.delete(connId);
          this.abortManager.abortBySession(`webchat:dm:${userId}`);
          log.info({ connId }, 'Client disconnected');
        });

        ws.on('error', (error) => {
          log.error({ connId, error }, 'WebSocket error');
        });
      })
      .catch(err => {
        log.warn({ error: err }, 'Handshake failed');
      });
  }

  private broadcastTick(): void {
    this.lastTickTs = Date.now();
    const tick = JSON.stringify(eventFrame('tick', { ts: this.lastTickTs }));
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(tick);
        } catch {
          // Ignore send failures
        }
      }
    }
  }
}
