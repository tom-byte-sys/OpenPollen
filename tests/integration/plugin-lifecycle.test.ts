import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginRegistry } from '../../src/plugins/registry.js';
import { isChannelPlugin } from '../../src/plugins/types.js';
import type { Plugin, PluginManifest } from '../../src/plugins/types.js';
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
    },
  },
}));

describe('Plugin Lifecycle', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('isChannelPlugin type guard', () => {
    it('should return true for channel plugins with sendMessage and onMessage', () => {
      const plugin = new DingtalkPlugin();
      expect(isChannelPlugin(plugin)).toBe(true);
    });

    it('should return false for non-channel plugins', () => {
      const plugin: Plugin = {
        manifest: {
          name: 'test-skill',
          version: '1.0.0',
          slot: 'skill',
          description: 'A test skill',
        },
        async initialize() {},
        async start() {},
        async stop() {},
        isHealthy() { return true; },
      };
      expect(isChannelPlugin(plugin)).toBe(false);
    });

    it('should return false for channel-slot plugin without required methods', () => {
      const plugin: Plugin = {
        manifest: {
          name: 'incomplete',
          version: '1.0.0',
          slot: 'channel',
          description: 'Incomplete channel',
        },
        async initialize() {},
        async start() {},
        async stop() {},
        isHealthy() { return true; },
      };
      expect(isChannelPlugin(plugin)).toBe(false);
    });
  });

  describe('Registry operations', () => {
    it('should register and list channel plugins', () => {
      const plugin = new DingtalkPlugin();
      registry.register('channel', 'dingtalk', plugin);

      const listed = registry.list('channel');
      expect(listed).toHaveLength(1);
      expect(listed[0]).toBe(plugin);
    });

    it('should filter channel plugins with isChannelPlugin', () => {
      const channelPlugin = new DingtalkPlugin();
      registry.register('channel', 'dingtalk', channelPlugin);

      const skillPlugin: Plugin = {
        manifest: { name: 'test-skill', version: '1.0.0', slot: 'skill', description: 'Test' },
        async initialize() {},
        async start() {},
        async stop() {},
        isHealthy() { return true; },
      };
      registry.register('skill', 'test-skill', skillPlugin);

      const channelPlugins = registry.list('channel').filter(isChannelPlugin);
      expect(channelPlugins).toHaveLength(1);
      expect(channelPlugins[0].name).toBe('dingtalk');
    });
  });

  describe('Full lifecycle: init → start → onMessage → stop', () => {
    it('should complete full lifecycle', async () => {
      const plugin = new DingtalkPlugin();

      // Initialize
      await plugin.initialize({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        groupPolicy: 'mention',
      });
      expect(plugin.isHealthy()).toBe(false);

      // Register message handler
      const handler = vi.fn().mockResolvedValue('test reply');
      plugin.onMessage(handler);

      // Start
      await plugin.start();
      expect(plugin.isHealthy()).toBe(true);

      // Stop
      await plugin.stop();
      expect(plugin.isHealthy()).toBe(false);
    });

    it('should manage lifecycle through registry', async () => {
      const plugin = new DingtalkPlugin();
      await plugin.initialize({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        groupPolicy: 'mention',
      });

      registry.register('channel', 'dingtalk', plugin);

      // startAll
      await registry.startAll();
      expect(plugin.isHealthy()).toBe(true);

      // stopAll
      await registry.stopAll();
      expect(plugin.isHealthy()).toBe(false);
    });
  });
});
