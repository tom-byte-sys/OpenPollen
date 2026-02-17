import { describe, it, expect, vi, beforeEach } from 'vitest';
import WechatPlugin from '../../plugins/wechat/index.js';

describe('WechatPlugin', () => {
  let plugin: WechatPlugin;

  beforeEach(() => {
    plugin = new WechatPlugin();
  });

  describe('manifest', () => {
    it('should have correct manifest', () => {
      expect(plugin.manifest).toEqual({
        name: 'wechat',
        version: '1.0.0',
        slot: 'channel',
        description: '企业微信聊天平台适配器',
      });
    });

    it('should have correct name and type', () => {
      expect(plugin.name).toBe('wechat');
      expect(plugin.type).toBe('wechat');
    });
  });

  describe('initialize', () => {
    it('should initialize with valid config', async () => {
      await plugin.initialize({
        corpId: 'test-corp-id',
        agentId: '1000001',
        secret: 'test-secret',
        token: 'test-token',
        encodingAESKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
        callbackPort: 3002,
      });

      expect(plugin.isHealthy()).toBe(false); // not started yet
    });

    it('should reject initialization without corpId', async () => {
      await expect(
        plugin.initialize({
          corpId: '',
          agentId: '1000001',
          secret: 'test-secret',
          token: 'test-token',
          encodingAESKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
        }),
      ).rejects.toThrow('企业微信配置缺少 corpId');
    });

    it('should reject initialization without secret', async () => {
      await expect(
        plugin.initialize({
          corpId: 'test-corp-id',
          agentId: '1000001',
          secret: '',
          token: 'test-token',
          encodingAESKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
        }),
      ).rejects.toThrow('企业微信配置缺少 secret');
    });

    it('should reject initialization without token', async () => {
      await expect(
        plugin.initialize({
          corpId: 'test-corp-id',
          agentId: '1000001',
          secret: 'test-secret',
          token: '',
          encodingAESKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
        }),
      ).rejects.toThrow('企业微信配置缺少 token');
    });

    it('should reject initialization without encodingAESKey', async () => {
      await expect(
        plugin.initialize({
          corpId: 'test-corp-id',
          agentId: '1000001',
          secret: 'test-secret',
          token: 'test-token',
          encodingAESKey: '',
        }),
      ).rejects.toThrow('企业微信配置缺少 encodingAESKey');
    });

    it('should use default callbackPort when not provided', async () => {
      await plugin.initialize({
        corpId: 'test-corp-id',
        agentId: '1000001',
        secret: 'test-secret',
        token: 'test-token',
        encodingAESKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      });

      // No error means it accepted missing callbackPort
      expect(plugin.isHealthy()).toBe(false);
    });
  });

  describe('onMessage', () => {
    it('should accept message handler', async () => {
      await plugin.initialize({
        corpId: 'test-corp-id',
        agentId: '1000001',
        secret: 'test-secret',
        token: 'test-token',
        encodingAESKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      });

      const handler = vi.fn();
      plugin.onMessage(handler);

      // Handler registered without error
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('start/stop lifecycle', () => {
    it('should start and stop the HTTP server', async () => {
      await plugin.initialize({
        corpId: 'test-corp-id',
        agentId: '1000001',
        secret: 'test-secret',
        token: 'test-token',
        encodingAESKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
        callbackPort: 0, // use random port
      });

      await plugin.start();
      expect(plugin.isHealthy()).toBe(true);

      await plugin.stop();
      expect(plugin.isHealthy()).toBe(false);
    });
  });
});
