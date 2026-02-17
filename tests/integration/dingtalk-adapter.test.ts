import { describe, it, expect, vi, beforeEach } from 'vitest';
import DingtalkPlugin from '../../plugins/dingtalk/index.js';

// Mock dingtalk-stream module
vi.mock('dingtalk-stream', () => ({
  default: {
    DWClient: class MockDWClient {
      private callbacks = new Map<string, Function>();

      registerCallbackListener(topic: string, handler: Function): void {
        this.callbacks.set(topic, handler);
      }

      async connect(): Promise<void> {
        // Mock connect
      }

      async disconnect(): Promise<void> {
        // Mock disconnect
      }

      socketCallBackResponse(_messageId: string, _result: unknown): void {
        // Mock ACK
      }

      // Test helper to simulate incoming message
      async simulateMessage(data: Record<string, unknown>): Promise<void> {
        const handler = this.callbacks.get('/v1.0/im/bot/messages/get');
        if (handler) {
          await handler({ data: JSON.stringify(data), headers: { messageId: 'test-msg-id' } });
        }
      }
    },
  },
}));

describe('DingtalkPlugin', () => {
  let plugin: DingtalkPlugin;

  beforeEach(() => {
    plugin = new DingtalkPlugin();
  });

  it('should have correct manifest', () => {
    expect(plugin.manifest).toEqual({
      name: 'dingtalk',
      version: '1.0.0',
      slot: 'channel',
      description: '钉钉聊天平台适配器',
    });
  });

  it('should initialize with valid config', async () => {
    await plugin.initialize({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      groupPolicy: 'mention',
    });

    expect(plugin.name).toBe('dingtalk');
    expect(plugin.type).toBe('dingtalk');
  });

  it('should reject initialization without credentials', async () => {
    await expect(
      plugin.initialize({ clientId: '', clientSecret: '' }),
    ).rejects.toThrow('钉钉配置缺少 clientId 或 clientSecret');
  });

  it('should report unhealthy before start', () => {
    expect(plugin.isHealthy()).toBe(false);
  });

  it('should accept message handler', async () => {
    await plugin.initialize({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      groupPolicy: 'mention',
    });

    const handler = vi.fn();
    plugin.onMessage(handler);

    // Handler should be registered (we can't easily test the full flow
    // without starting, but we verify no error)
    expect(handler).not.toHaveBeenCalled();
  });
});
