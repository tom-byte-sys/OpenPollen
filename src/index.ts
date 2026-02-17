import { resolve } from 'node:path';
import { loadConfig, resolveConfigPath } from './config/loader.js';
import { initLogger, getLogger } from './utils/logger.js';
import { SessionManager } from './gateway/session.js';
import { MessageRouter } from './gateway/router.js';
import { GatewayServer } from './gateway/server.js';
import { AgentRunner } from './agent/runner.js';
import { SkillManager } from './agent/skill-manager.js';
import { PluginRegistry } from './plugins/registry.js';
import { loadPluginsFromDirectory } from './plugins/loader.js';
import { isChannelPlugin } from './plugins/types.js';
import { WebchatAdapter } from './channels/webchat/index.js';
import { SqliteMemoryStore } from './memory/sqlite-store.js';
import { FileMemoryStore } from './memory/file-store.js';
import type { ChannelAdapter } from './channels/interface.js';
import type { MemoryStore } from './memory/interface.js';
import type { AppConfig } from './config/schema.js';

export interface HiveAgentInstance {
  config: AppConfig;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createHiveAgent(configPath?: string): Promise<HiveAgentInstance> {
  // 1. 加载配置
  const config = loadConfig(configPath);

  // 2. 初始化日志（仅写文件，不输出到终端；用户通过 hiveagent logs -f 查看）
  const log = initLogger({
    level: config.logging.level,
    file: config.logging.file,
    stdout: false,
  });
  const mainLog = getLogger('main');

  // 3. 初始化记忆系统
  let memory: MemoryStore;
  if (config.memory.backend === 'sqlite') {
    const sqliteStore = new SqliteMemoryStore(config.memory.sqlitePath);
    await sqliteStore.init();
    memory = sqliteStore;
  } else {
    memory = new FileMemoryStore(config.memory.fileDirectory);
  }

  // 4. 初始化技能管理器
  const skillManager = new SkillManager(config.skills.directory);
  skillManager.discover();

  // 5. 初始化插件注册中心并加载插件
  const pluginRegistry = new PluginRegistry();
  const pluginsDir = resolve(import.meta.dirname ?? '.', '..', 'plugins');

  // 构建插件配置（从 channels 配置中提取已启用的非内置渠道）
  const pluginConfigs: Record<string, Record<string, unknown>> = {};
  for (const [name, channelConfig] of Object.entries(config.channels)) {
    if (name !== 'webchat' && channelConfig && (channelConfig as Record<string, unknown>).enabled) {
      pluginConfigs[name] = channelConfig as Record<string, unknown>;
    }
  }
  await loadPluginsFromDirectory(pluginsDir, pluginRegistry, pluginConfigs);

  // 6. 初始化 Agent Runner
  const agentRunner = new AgentRunner({ config, skillManager, memory });

  // 7. 初始化会话管理
  const sessionManager = new SessionManager({
    timeoutMinutes: config.gateway.session.timeoutMinutes,
    maxConcurrent: config.gateway.session.maxConcurrent,
  });

  // 8. 初始化消息路由
  const router = new MessageRouter({ sessionManager, agentRunner, memory });

  // 9. 初始化 Gateway
  const server = new GatewayServer({ config: config.gateway, router });

  // 10. 初始化 Channel 适配器
  const channels: ChannelAdapter[] = [];

  if (config.channels.webchat?.enabled) {
    const webchat = new WebchatAdapter();
    await webchat.initialize(config.channels.webchat as unknown as Record<string, unknown>);
    webchat.inject({
      router,
      sessionManager: router.sessionManager,
      memory: router.memory,
      appConfig: config,
      configFilePath: resolveConfigPath(configPath),
      reloadConfig: async () => {
        const newConfig = loadConfig(configPath);
        Object.assign(config, newConfig);
        mainLog.info('配置已热重载');
      },
      skillManager,
    });
    channels.push(webchat);
    mainLog.info('WebChat Channel 已配置');
  }

  // 11. 动态接入渠道插件
  const channelPlugins = pluginRegistry.list('channel').filter(isChannelPlugin);
  for (const cp of channelPlugins) {
    cp.onMessage(async (msg, onChunk) => await router.handleMessage(msg, onChunk));
    mainLog.info({ channel: cp.name }, 'Channel 插件已配置');
  }

  return {
    config,
    async start() {
      mainLog.info('HiveAgent 启动中...');

      // 启动会话 GC
      sessionManager.startGC();

      // 启动 Gateway HTTP 服务
      await server.start();

      // 启动所有 Channel
      for (const channel of channels) {
        try {
          await channel.start();
          mainLog.info({ channel: channel.name }, 'Channel 已启动');
        } catch (error) {
          mainLog.error({ channel: channel.name, error }, 'Channel 启动失败');
        }
      }

      // 启动所有插件
      await pluginRegistry.startAll();

      mainLog.info({
        gateway: `http://${config.gateway.host}:${config.gateway.port}`,
        channels: [...channels.map(c => c.name), ...channelPlugins.map(cp => cp.name)],
        skills: skillManager.list().map(s => s.name),
      }, 'HiveAgent 已启动');
    },

    async stop() {
      mainLog.info('HiveAgent 停止中...');

      // 停止所有插件
      await pluginRegistry.stopAll();

      // 停止所有 Channel
      for (const channel of channels) {
        try {
          await channel.stop();
        } catch (error) {
          mainLog.error({ channel: channel.name, error }, 'Channel 停止失败');
        }
      }

      // 停止 Gateway
      await server.stop();

      // 停止会话 GC
      sessionManager.stopGC();

      // 关闭记忆存储
      await memory.close();

      mainLog.info('HiveAgent 已停止');
    },
  };
}

// 如果直接运行此文件（非 CLI 入口）
const entryFile = process.argv[1] ?? '';
const isDirectRun = entryFile.endsWith('src/index.js') || entryFile.endsWith('src/index.ts');
if (isDirectRun) {
  createHiveAgent()
    .then(hub => hub.start())
    .catch(error => {
      console.error('启动失败:', error);
      process.exit(1);
    });
}
