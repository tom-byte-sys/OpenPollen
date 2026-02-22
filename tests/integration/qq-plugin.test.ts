import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InboundMessage } from '../../src/channels/interface.js';

// 全局跟踪 MockWebSocket 实例和发送数据
let wsInstance: any = null;
let wsLastSent: Record<string, unknown> | null = null;

vi.mock('ws', () => {
  class MockWebSocket {
    static OPEN = 1;
    readyState = 1; // OPEN

    private handlers = new Map<string, Function>();

    constructor(_url: string) {
      wsInstance = this;
      wsLastSent = null;

      // Simulate: open → Hello
      setTimeout(() => {
        this.handlers.get('open')?.();

        const hello = JSON.stringify({
          op: 10,
          d: { heartbeat_interval: 45000 },
        });
        this.handlers.get('message')?.(Buffer.from(hello));
      }, 10);
    }

    on(event: string, handler: Function): void {
      this.handlers.set(event, handler);
    }

    send(data: string): void {
      wsLastSent = JSON.parse(data);
    }

    close(): void {
      this.readyState = 3;
    }

    // Test helpers - simulate server events
    simulateReady(): void {
      const ready = JSON.stringify({
        op: 0,
        s: 1,
        t: 'READY',
        d: {
          session_id: 'test-session',
          user: { id: 'bot-123', username: 'TestBot' },
        },
      });
      this.handlers.get('message')?.(Buffer.from(ready));
    }

    simulateATMessage(data: Record<string, unknown>): void {
      const payload = JSON.stringify({
        op: 0,
        s: 2,
        t: 'AT_MESSAGE_CREATE',
        d: data,
      });
      this.handlers.get('message')?.(Buffer.from(payload));
    }

    simulateDM(data: Record<string, unknown>): void {
      const payload = JSON.stringify({
        op: 0,
        s: 3,
        t: 'DIRECT_MESSAGE_CREATE',
        d: data,
      });
      this.handlers.get('message')?.(Buffer.from(payload));
    }
  }

  return { default: MockWebSocket };
});

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// 延迟 import，确保 mock 先生效
const { default: QQPlugin } = await import('../../plugins/qq/index.js');

function mockTokenResponse(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'test-token-123', expires_in: 7200 }),
  });
}

function mockGatewayResponse(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ url: 'wss://test-gateway.qq.com' }),
  });
}

function mockSendMessageResponse(ok = true): void {
  mockFetch.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    text: async () => ok ? '{}' : 'Internal Server Error',
  });
}

describe('QQPlugin', () => {
  let plugin: InstanceType<typeof QQPlugin>;

  beforeEach(() => {
    plugin = new QQPlugin();
    vi.clearAllMocks();
    wsInstance = null;
    wsLastSent = null;
  });

  afterEach(async () => {
    try {
      await plugin.stop();
    } catch {
      // ignore
    }
  });

  describe('manifest', () => {
    it('should have correct manifest', () => {
      expect(plugin.manifest).toEqual({
        name: 'qq',
        version: '1.0.0',
        slot: 'channel',
        description: 'QQ 频道机器人适配器',
      });
    });

    it('should have correct name and type', () => {
      expect(plugin.name).toBe('qq');
      expect(plugin.type).toBe('qq');
    });
  });

  describe('initialize', () => {
    it('should initialize with valid config', async () => {
      await plugin.initialize({
        appId: 'test-app-id',
        appSecret: 'test-app-secret',
        groupPolicy: 'mention',
      });

      expect(plugin.isHealthy()).toBe(false);
    });

    it('should reject initialization without appId', async () => {
      await expect(
        plugin.initialize({ appId: '', appSecret: 'test-secret', groupPolicy: 'mention' }),
      ).rejects.toThrow('QQ 频道配置缺少 appId 或 appSecret');
    });

    it('should reject initialization without appSecret', async () => {
      await expect(
        plugin.initialize({ appId: 'test-id', appSecret: '', groupPolicy: 'mention' }),
      ).rejects.toThrow('QQ 频道配置缺少 appId 或 appSecret');
    });
  });

  describe('onMessage', () => {
    it('should accept message handler', async () => {
      await plugin.initialize({
        appId: 'test-app-id',
        appSecret: 'test-app-secret',
        groupPolicy: 'mention',
      });

      const handler = vi.fn();
      plugin.onMessage(handler);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('start/stop lifecycle', () => {
    it('should start and connect via WebSocket', async () => {
      await plugin.initialize({
        appId: 'test-app-id',
        appSecret: 'test-app-secret',
        sandbox: false,
        groupPolicy: 'mention',
      });

      mockTokenResponse();
      mockGatewayResponse();

      const startPromise = plugin.start();

      // Wait for mock WS open + hello
      await new Promise(r => setTimeout(r, 50));

      // Simulate READY
      wsInstance?.simulateReady();
      await startPromise;

      expect(plugin.isHealthy()).toBe(true);

      await plugin.stop();
      expect(plugin.isHealthy()).toBe(false);
    });
  });

  describe('message handling', () => {
    async function setupPlugin(): Promise<void> {
      await plugin.initialize({
        appId: 'test-app-id',
        appSecret: 'test-app-secret',
        sandbox: false,
        groupPolicy: 'mention',
      });

      mockTokenResponse();
      mockGatewayResponse();

      const startPromise = plugin.start();
      await new Promise(r => setTimeout(r, 50));
      wsInstance?.simulateReady();
      await startPromise;
    }

    it('should process AT_MESSAGE_CREATE events', async () => {
      await setupPlugin();

      const handler = vi.fn().mockResolvedValue('Hello from bot!');
      plugin.onMessage(handler);

      mockSendMessageResponse();

      wsInstance?.simulateATMessage({
        id: 'msg-001',
        channel_id: 'channel-123',
        guild_id: 'guild-456',
        content: '<@!bot-123> Hello bot',
        author: { id: 'user-789', username: 'TestUser', bot: false },
        mentions: [{ id: 'bot-123', username: 'TestBot', bot: true }],
      });

      await new Promise(r => setTimeout(r, 100));

      expect(handler).toHaveBeenCalledTimes(1);
      const receivedMsg = handler.mock.calls[0][0] as InboundMessage;
      expect(receivedMsg.channelType).toBe('qq');
      expect(receivedMsg.conversationType).toBe('group');
      expect(receivedMsg.content.text).toBe('Hello bot');
      expect(receivedMsg.senderId).toBe('user-789');
    });

    it('should process DIRECT_MESSAGE_CREATE events', async () => {
      await setupPlugin();

      const handler = vi.fn().mockResolvedValue('DM reply');
      plugin.onMessage(handler);

      mockSendMessageResponse();

      wsInstance?.simulateDM({
        id: 'dm-001',
        channel_id: 'dm-channel-1',
        guild_id: 'dm-guild-1',
        content: 'Hello in DM',
        author: { id: 'user-789', username: 'TestUser', bot: false },
      });

      await new Promise(r => setTimeout(r, 100));

      expect(handler).toHaveBeenCalledTimes(1);
      const receivedMsg = handler.mock.calls[0][0] as InboundMessage;
      expect(receivedMsg.conversationType).toBe('dm');
      expect(receivedMsg.content.text).toBe('Hello in DM');
    });

    it('should ignore messages from bots', async () => {
      await setupPlugin();

      const handler = vi.fn();
      plugin.onMessage(handler);

      wsInstance?.simulateATMessage({
        id: 'msg-002',
        channel_id: 'channel-123',
        guild_id: 'guild-456',
        content: 'Bot message',
        author: { id: 'other-bot', username: 'OtherBot', bot: true },
      });

      await new Promise(r => setTimeout(r, 100));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should strip mention tags from message content', async () => {
      await setupPlugin();

      const handler = vi.fn().mockResolvedValue('OK');
      plugin.onMessage(handler);

      mockSendMessageResponse();

      wsInstance?.simulateATMessage({
        id: 'msg-003',
        channel_id: 'channel-123',
        guild_id: 'guild-456',
        content: '<@!bot-123> What is the weather?',
        author: { id: 'user-789', username: 'TestUser', bot: false },
        mentions: [{ id: 'bot-123', username: 'TestBot', bot: true }],
      });

      await new Promise(r => setTimeout(r, 100));

      const receivedMsg = handler.mock.calls[0][0] as InboundMessage;
      expect(receivedMsg.content.text).toBe('What is the weather?');
    });

    it('should ignore empty messages after stripping mentions', async () => {
      await setupPlugin();

      const handler = vi.fn();
      plugin.onMessage(handler);

      wsInstance?.simulateATMessage({
        id: 'msg-004',
        channel_id: 'channel-123',
        guild_id: 'guild-456',
        content: '<@!bot-123>',
        author: { id: 'user-789', username: 'TestUser', bot: false },
        mentions: [{ id: 'bot-123', username: 'TestBot', bot: true }],
      });

      await new Promise(r => setTimeout(r, 100));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('access token', () => {
    it('should fail start if token request fails', async () => {
      await plugin.initialize({
        appId: 'test-app-id',
        appSecret: 'test-app-secret',
        groupPolicy: 'mention',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(plugin.start()).rejects.toThrow('获取 QQ 频道 access_token 失败');
    });
  });
});
