import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DingtalkAdapter } from '../../src/channels/dingtalk/index.js';

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

      // Test helper to simulate incoming message
      async simulateMessage(data: Record<string, unknown>): Promise<void> {
        const handler = this.callbacks.get('/v1.0/im/bot/messages/get');
        if (handler) {
          await handler({ data: JSON.stringify(data), headers: {} });
        }
      }
    },
  },
}));

describe('DingtalkAdapter', () => {
  let adapter: DingtalkAdapter;

  beforeEach(() => {
    adapter = new DingtalkAdapter();
  });

  it('should initialize with valid config', async () => {
    await adapter.initialize({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      groupPolicy: 'mention',
    });

    expect(adapter.name).toBe('dingtalk');
    expect(adapter.type).toBe('dingtalk');
  });

  it('should reject initialization without credentials', async () => {
    await expect(
      adapter.initialize({ clientId: '', clientSecret: '' }),
    ).rejects.toThrow('钉钉配置缺少 clientId 或 clientSecret');
  });

  it('should report unhealthy before start', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  it('should accept message handler', async () => {
    await adapter.initialize({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      groupPolicy: 'mention',
    });

    const handler = vi.fn();
    adapter.onMessage(handler);

    // Handler should be registered (we can't easily test the full flow
    // without starting, but we verify no error)
    expect(handler).not.toHaveBeenCalled();
  });
});
