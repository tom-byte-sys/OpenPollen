import { readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getLogger } from '../utils/logger.js';
import type { Plugin, PluginModule } from './types.js';
import { PluginRegistry } from './registry.js';

const log = getLogger('plugin-loader');

/**
 * 扫描插件目录，动态加载插件
 */
export async function loadPluginsFromDirectory(
  directory: string,
  registry: PluginRegistry,
  configs: Record<string, Record<string, unknown>> = {},
): Promise<void> {
  if (!existsSync(directory)) {
    log.debug({ directory }, '插件目录不存在，跳过');
    return;
  }

  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = resolve(directory, entry.name);
    const indexPath = join(pluginDir, 'index.js');
    const indexTsPath = join(pluginDir, 'index.ts');

    const modulePath = existsSync(indexPath) ? indexPath : existsSync(indexTsPath) ? indexTsPath : null;
    if (!modulePath) {
      log.debug({ plugin: entry.name }, '未找到入口文件，跳过');
      continue;
    }

    try {
      const moduleUrl = pathToFileURL(modulePath).href;
      const mod = await import(moduleUrl) as PluginModule;

      if (!mod.default || typeof mod.default !== 'function') {
        log.warn({ plugin: entry.name }, '插件缺少默认导出类');
        continue;
      }

      const plugin: Plugin = new mod.default();
      const { manifest } = plugin;

      if (!manifest?.slot || !manifest?.name) {
        log.warn({ plugin: entry.name }, '插件 manifest 不完整');
        continue;
      }

      const config = configs[manifest.name] ?? {};
      await plugin.initialize(config);
      registry.register(manifest.slot, manifest.name, plugin);

      log.info({ plugin: manifest.name, slot: manifest.slot }, '插件加载完成');
    } catch (error) {
      log.error({ plugin: entry.name, error }, '插件加载失败');
    }
  }
}
