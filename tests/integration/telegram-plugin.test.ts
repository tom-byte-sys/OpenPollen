import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock undici module — vi.hoisted ensures mockFetch is available when vi.mock factory runs
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('undici', () => ({
  fetch: mockFetch,
  ProxyAgent: class MockProxyAgent {
    constructor(public uri: string) {}
  },
}));

import TelegramPlugin from '../../plugins/telegram/index.js';

function mockApiResponse<T>(result: T, ok = true) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok, result }),
    text: () => Promise.resolve(JSON.stringify({ ok, result })),
  };
}

function mockApiError(status: number, description: string) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ ok: false, description }),
    text: () => Promise.resolve(JSON.stringify({ ok: false, description })),
  };
}

const MOCK_BOT_INFO = {
  id: 123456789,
  is_bot: true,
  first_name: 'TestBot',
  username: 'test_bot',
};

const VALID_CONFIG = {
  token: 'test-token-123',
  groupPolicy: 'mention',
};

describe('TelegramPlugin', () => {
  let plugin: TelegramPlugin;

  beforeEach(() => {
    plugin = new TelegramPlugin();
    mockFetch.mockReset();
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  it('should have correct manifest', () => {
    expect(plugin.manifest).toEqual({
      name: 'telegram',
      version: '1.0.0',
      slot: 'channel',
      description: 'Telegram Bot 聊天平台适配器 (Long Polling)',
    });
  });

  it('should have correct name and type', () => {
    expect(plugin.name).toBe('telegram');
    expect(plugin.type).toBe('telegram');
  });

  it('should report unhealthy before start', () => {
    expect(plugin.isHealthy()).toBe(false);
  });

  describe('initialize', () => {
    it('should initialize with valid config', async () => {
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));

      await plugin.initialize(VALID_CONFIG);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/bottest-token-123/getMe');
    });

    it('should reject initialization without token', async () => {
      await expect(
        plugin.initialize({ token: '', groupPolicy: 'mention' }),
      ).rejects.toThrow('Telegram 配置缺少 token');
    });

    it('should reject initialization when getMe fails', async () => {
      mockFetch.mockResolvedValueOnce(mockApiError(401, 'Unauthorized'));

      await expect(
        plugin.initialize(VALID_CONFIG),
      ).rejects.toThrow('Telegram API getMe 失败: HTTP 401');
    });
  });

  describe('start / stop', () => {
    it('should report healthy after start', async () => {
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      await plugin.initialize(VALID_CONFIG);

      // Mock getUpdates to return empty array
      mockFetch.mockResolvedValue(mockApiResponse([]));

      await plugin.start();
      expect(plugin.isHealthy()).toBe(true);

      await plugin.stop();
      expect(plugin.isHealthy()).toBe(false);
    });

    it('should throw if start called before initialize', async () => {
      await expect(plugin.start()).rejects.toThrow('Telegram 插件未初始化');
    });
  });

  describe('onMessage', () => {
    it('should accept message handler', async () => {
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      await plugin.initialize(VALID_CONFIG);

      const handler = vi.fn();
      plugin.onMessage(handler);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('should send text message via API', async () => {
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      await plugin.initialize(VALID_CONFIG);

      mockFetch.mockResolvedValueOnce(mockApiResponse({ message_id: 1 }));

      await plugin.sendMessage({
        conversationType: 'dm',
        targetId: '12345',
        content: { type: 'text', text: 'Hello!' },
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [url, options] = mockFetch.mock.calls[1];
      expect(url).toContain('/bottest-token-123/sendMessage');
      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe('12345');
      expect(body.text).toBe('Hello!');
    });

    it('should include reply_to_message_id when replying', async () => {
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      await plugin.initialize(VALID_CONFIG);

      mockFetch.mockResolvedValueOnce(mockApiResponse({ message_id: 2 }));

      await plugin.sendMessage({
        conversationType: 'group',
        targetId: '-100123',
        content: { type: 'text', text: 'Reply!' },
        replyToMessageId: '42',
      });

      const [, options] = mockFetch.mock.calls[1];
      const body = JSON.parse(options.body);
      expect(body.reply_to_message_id).toBe(42);
    });

    it('should truncate long messages', async () => {
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      await plugin.initialize(VALID_CONFIG);

      mockFetch.mockResolvedValueOnce(mockApiResponse({ message_id: 3 }));

      const longText = 'a'.repeat(5000);
      await plugin.sendMessage({
        conversationType: 'dm',
        targetId: '12345',
        content: { type: 'text', text: longText },
      });

      const [, options] = mockFetch.mock.calls[1];
      const body = JSON.parse(options.body);
      expect(body.text.length).toBeLessThanOrEqual(4096);
      expect(body.text).toContain('截断');
    });
  });

  describe('message processing', () => {
    async function initAndStart() {
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      await plugin.initialize(VALID_CONFIG);
    }

    it('should process DM message', async () => {
      await initAndStart();

      const handler = vi.fn().mockResolvedValue('reply text');
      plugin.onMessage(handler);

      const dmUpdate = {
        update_id: 100,
        message: {
          message_id: 1,
          from: { id: 999, is_bot: false, first_name: 'John', username: 'john' },
          chat: { id: 999, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: 'Hello bot',
        },
      };

      // getUpdates returns one message, then sendMessage reply
      mockFetch
        .mockResolvedValueOnce(mockApiResponse([dmUpdate])) // getUpdates
        .mockResolvedValueOnce(mockApiResponse({ message_id: 2 })); // sendMessage reply

      await plugin.start();

      // Wait for polling to process
      await new Promise(resolve => setTimeout(resolve, 200));
      await plugin.stop();

      expect(handler).toHaveBeenCalledTimes(1);
      const inbound = handler.mock.calls[0][0];
      expect(inbound.channelType).toBe('telegram');
      expect(inbound.senderId).toBe('999');
      expect(inbound.senderName).toBe('John');
      expect(inbound.conversationType).toBe('dm');
      expect(inbound.content.text).toBe('Hello bot');
    });

    it('should ignore group messages without mention when groupPolicy is mention', async () => {
      await initAndStart();

      const handler = vi.fn().mockResolvedValue('reply');
      plugin.onMessage(handler);

      const groupUpdate = {
        update_id: 101,
        message: {
          message_id: 2,
          from: { id: 888, is_bot: false, first_name: 'Jane' },
          chat: { id: -100123, type: 'group' },
          date: Math.floor(Date.now() / 1000),
          text: 'Hello everyone',
          entities: [],
        },
      };

      mockFetch.mockResolvedValueOnce(mockApiResponse([groupUpdate]));

      await plugin.start();
      await new Promise(resolve => setTimeout(resolve, 200));
      await plugin.stop();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should process group messages with @mention', async () => {
      await initAndStart();

      const handler = vi.fn().mockResolvedValue('group reply');
      plugin.onMessage(handler);

      const groupUpdate = {
        update_id: 102,
        message: {
          message_id: 3,
          from: { id: 777, is_bot: false, first_name: 'Bob' },
          chat: { id: -100456, type: 'supergroup' },
          date: Math.floor(Date.now() / 1000),
          text: '@test_bot What is 2+2?',
          entities: [{ type: 'mention', offset: 0, length: 9 }],
        },
      };

      mockFetch
        .mockResolvedValueOnce(mockApiResponse([groupUpdate])) // getUpdates
        .mockResolvedValueOnce(mockApiResponse({ message_id: 4 })); // sendMessage reply

      await plugin.start();
      await new Promise(resolve => setTimeout(resolve, 200));
      await plugin.stop();

      expect(handler).toHaveBeenCalledTimes(1);
      const inbound = handler.mock.calls[0][0];
      expect(inbound.conversationType).toBe('group');
      expect(inbound.content.text).toBe('What is 2+2?');
      expect(inbound.groupId).toBe('-100456');
    });

    it('should process all group messages when groupPolicy is all', async () => {
      const allConfig = { ...VALID_CONFIG, groupPolicy: 'all' };
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      plugin = new TelegramPlugin();
      await plugin.initialize(allConfig);

      const handler = vi.fn().mockResolvedValue('ok');
      plugin.onMessage(handler);

      const groupUpdate = {
        update_id: 103,
        message: {
          message_id: 5,
          from: { id: 666, is_bot: false, first_name: 'Alice' },
          chat: { id: -100789, type: 'group' },
          date: Math.floor(Date.now() / 1000),
          text: 'Random message',
        },
      };

      mockFetch
        .mockResolvedValueOnce(mockApiResponse([groupUpdate]))
        .mockResolvedValueOnce(mockApiResponse({ message_id: 6 }));

      await plugin.start();
      await new Promise(resolve => setTimeout(resolve, 200));
      await plugin.stop();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].content.text).toBe('Random message');
    });
  });

  describe('apiCall', () => {
    it('should call Telegram API with correct URL', async () => {
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      await plugin.initialize(VALID_CONFIG);

      mockFetch.mockResolvedValueOnce(mockApiResponse({ message_id: 1 }));
      await plugin.apiCall('sendMessage', { chat_id: '123', text: 'test' });

      const [url, options] = mockFetch.mock.calls[1];
      expect(url).toBe('https://api.telegram.org/bottest-token-123/sendMessage');
      expect(options.method).toBe('POST');
    });

    it('should use GET when no body provided', async () => {
      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      await plugin.initialize(VALID_CONFIG);

      mockFetch.mockResolvedValueOnce(mockApiResponse(MOCK_BOT_INFO));
      await plugin.apiCall('getMe');

      const [, options] = mockFetch.mock.calls[1];
      expect(options.method).toBe('GET');
      expect(options.body).toBeUndefined();
    });
  });
});
