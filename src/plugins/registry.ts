import { getLogger } from '../utils/logger.js';
import type { Plugin, PluginSlot } from './types.js';

const log = getLogger('plugin-registry');

export class PluginRegistry {
  private plugins = new Map<string, Plugin>();

  private slotKey(slot: PluginSlot, name: string): string {
    return `${slot}:${name}`;
  }

  register(slot: PluginSlot, name: string, plugin: Plugin): void {
    const key = this.slotKey(slot, name);
    if (this.plugins.has(key)) {
      throw new Error(`插件已注册: ${key}`);
    }
    this.plugins.set(key, plugin);
    log.info({ slot, name }, '插件已注册');
  }

  unregister(slot: PluginSlot, name: string): void {
    const key = this.slotKey(slot, name);
    if (!this.plugins.has(key)) {
      log.warn({ slot, name }, '插件未找到，跳过注销');
      return;
    }
    this.plugins.delete(key);
    log.info({ slot, name }, '插件已注销');
  }

  get<T extends Plugin>(slot: PluginSlot, name: string): T | undefined {
    const key = this.slotKey(slot, name);
    return this.plugins.get(key) as T | undefined;
  }

  list(slot: PluginSlot): Plugin[] {
    const result: Plugin[] = [];
    for (const [key, plugin] of this.plugins) {
      if (key.startsWith(`${slot}:`)) {
        result.push(plugin);
      }
    }
    return result;
  }

  listAll(): Map<string, Plugin> {
    return new Map(this.plugins);
  }

  async startAll(): Promise<void> {
    for (const [key, plugin] of this.plugins) {
      try {
        await plugin.start();
        log.info({ plugin: key }, '插件已启动');
      } catch (error) {
        log.error({ plugin: key, error }, '插件启动失败');
        throw error;
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const [key, plugin] of this.plugins) {
      try {
        await plugin.stop();
        log.info({ plugin: key }, '插件已停止');
      } catch (error) {
        log.error({ plugin: key, error }, '插件停止失败');
      }
    }
  }
}
