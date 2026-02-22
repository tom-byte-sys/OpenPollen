import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeishuPlugin from '../../plugins/feishu/index.js';

// 捕获注册的事件处理器，以便测试中模拟消息
let registeredHandlers: Record<string, Function> = {};

// Mock @larksuiteoapi/node-sdk
vi.mock('@larksuiteoapi/node-sdk', () => {
  const LoggerLevel = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };

  class MockClient {
    im = {
      v1: {
        message: {
          create: vi.fn().mockResolvedValue({ code: 0, msg: 'success' }),
          reply: vi.fn().mockResolvedValue({ code: 0, msg: 'success' }),
        },
      },
    };

    async request(_payload: unknown): Promise<unknown> {
      return { bot: { open_id: 'bot_open_id_123' } };
    }
  }

  class MockWSClient {
    async start(params: { eventDispatcher: { handles: Map<string, Function> } }): Promise<void> {
      // 将注册的 handlers 存到外部变量，方便测试中触发
      for (const [key, fn] of params.eventDispatcher.handles) {
        registeredHandlers[key] = fn;
      }
    }

    close(): void {
      // Mock close
    }
  }

  class MockEventDispatcher {
    handles = new Map<string, Function>();

    constructor(_params?: unknown) {
      // Mock constructor
    }

    register(handleMap: Record<string, Function>): MockEventDispatcher {
      for (const [key, fn] of Object.entries(handleMap)) {
        this.handles.set(key, fn);
      }
      return this;
    }
  }

  return {
    Client: MockClient,
    WSClient: MockWSClient,
    EventDispatcher: MockEventDispatcher,
    LoggerLevel,
  };
});

function makeMessageEvent(overrides?: {
  chatType?: string;
  text?: string;
  mentions?: Array<{ key: string; id: { open_id?: string }; name: string }>;
  senderId?: string;
  messageId?: string;
}) {
  return {
    app_id: 'test-app-id',
    sender: {
      sender_id: { open_id: overrides?.senderId ?? 'user_open_id_456' },
      sender_type: 'user',
    },
    message: {
      message_id: overrides?.messageId ?? 'msg_001',
      create_time: String(Date.now()),
      chat_id: 'chat_001',
      chat_type: overrides?.chatType ?? 'p2p',
      message_type: 'text',
      content: JSON.stringify({ text: overrides?.text ?? '你好' }),
      mentions: overrides?.mentions,
    },
  };
}

describe('FeishuPlugin', () => {
  let plugin: FeishuPlugin;

  beforeEach(() => {
    plugin = new FeishuPlugin();
    registeredHandlers = {};
  });

  describe('manifest', () => {
    it('should have correct manifest', () => {
      expect(plugin.manifest).toEqual({
        name: 'feishu',
        version: '1.0.0',
        slot: 'channel',
        description: '飞书聊天平台适配器',
      });
    });

    it('should have correct name and type', () => {
      expect(plugin.name).toBe('feishu');
      expect(plugin.type).toBe('feishu');
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
        plugin.initialize({ appId: '', appSecret: 'secret', groupPolicy: 'mention' }),
      ).rejects.toThrow('飞书配置缺少 appId 或 appSecret');
    });

    it('should reject initialization without appSecret', async () => {
      await expect(
        plugin.initialize({ appId: 'id', appSecret: '', groupPolicy: 'mention' }),
      ).rejects.toThrow('飞书配置缺少 appId 或 appSecret');
    });
  });

  describe('start/stop lifecycle', () => {
    it('should start and report healthy', async () => {
      await plugin.initialize({
        appId: 'test-app-id',
        appSecret: 'test-app-secret',
        groupPolicy: 'mention',
      });

      await plugin.start();
      expect(plugin.isHealthy()).toBe(true);
    });

    it('should stop and report unhealthy', async () => {
      await plugin.initialize({
        appId: 'test-app-id',
        appSecret: 'test-app-secret',
        groupPolicy: 'mention',
      });

      await plugin.start();
      await plugin.stop();
      expect(plugin.isHealthy()).toBe(false);
    });
  });

  describe('onMessage', () => {
    it('should accept message handler without error', async () => {
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

  describe('message handling', () => {
    beforeEach(async () => {
      await plugin.initialize({
        appId: 'test-app-id',
        appSecret: 'test-app-secret',
        groupPolicy: 'mention',
      });
    });

    it('should handle DM messages', async () => {
      const handler = vi.fn().mockResolvedValue('收到了');
      plugin.onMessage(handler);

      await plugin.start();

      const eventHandler = registeredHandlers['im.message.receive_v1'];
      expect(eventHandler).toBeDefined();

      await eventHandler(makeMessageEvent({ text: '你好', chatType: 'p2p' }));

      // 等待异步处理完成
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
      const inbound = handler.mock.calls[0][0];
      expect(inbound.channelType).toBe('feishu');
      expect(inbound.conversationType).toBe('dm');
      expect(inbound.content.text).toBe('你好');
      expect(inbound.senderId).toBe('user_open_id_456');
    });

    it('should handle group messages with mention', async () => {
      const handler = vi.fn().mockResolvedValue('收到了');
      plugin.onMessage(handler);

      await plugin.start();
      const eventHandler = registeredHandlers['im.message.receive_v1'];

      await eventHandler(makeMessageEvent({
        text: '@_user_1 你好',
        chatType: 'group',
        mentions: [{ key: '@_user_1', id: { open_id: 'bot_open_id_123' }, name: 'Bot' }],
      }));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
      const inbound = handler.mock.calls[0][0];
      expect(inbound.conversationType).toBe('group');
      expect(inbound.content.text).toBe('你好');
      expect(inbound.groupId).toBe('chat_001');
    });

    it('should ignore group messages without mention when groupPolicy is mention', async () => {
      const handler = vi.fn().mockResolvedValue('收到了');
      plugin.onMessage(handler);

      await plugin.start();
      const eventHandler = registeredHandlers['im.message.receive_v1'];

      // 群消息但没有 mention 机器人
      await eventHandler(makeMessageEvent({
        text: '大家好',
        chatType: 'group',
        mentions: [],
      }));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle group messages without mention when groupPolicy is all', async () => {
      // 重新初始化，groupPolicy = 'all'
      plugin = new FeishuPlugin();
      await plugin.initialize({
        appId: 'test-app-id',
        appSecret: 'test-app-secret',
        groupPolicy: 'all',
      });

      const handler = vi.fn().mockResolvedValue('收到了');
      plugin.onMessage(handler);

      await plugin.start();
      const eventHandler = registeredHandlers['im.message.receive_v1'];

      await eventHandler(makeMessageEvent({
        text: '大家好',
        chatType: 'group',
      }));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should ignore empty messages', async () => {
      const handler = vi.fn().mockResolvedValue('收到了');
      plugin.onMessage(handler);

      await plugin.start();
      const eventHandler = registeredHandlers['im.message.receive_v1'];

      await eventHandler(makeMessageEvent({ text: '' }));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should strip mention keys from message text', async () => {
      const handler = vi.fn().mockResolvedValue('收到了');
      plugin.onMessage(handler);

      await plugin.start();
      const eventHandler = registeredHandlers['im.message.receive_v1'];

      await eventHandler(makeMessageEvent({
        text: '@_user_1 查询天气',
        chatType: 'p2p',
        mentions: [{ key: '@_user_1', id: { open_id: 'bot_open_id_123' }, name: 'Bot' }],
      }));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].content.text).toBe('查询天气');
    });
  });
});
