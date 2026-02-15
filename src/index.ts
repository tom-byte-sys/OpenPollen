import { resolve } from 'node:path';
import { loadConfig } from './config/loader.js';
import { initLogger, getLogger } from './utils/logger.js';
import { SessionManager } from './gateway/session.js';
import { MessageRouter } from './gateway/router.js';
import { GatewayServer } from './gateway/server.js';
import { AgentRunner } from './agent/runner.js';
import { SkillManager } from './agent/skill-manager.js';
import { PluginRegistry } from './plugins/registry.js';
import { loadPluginsFromDirectory } from './plugins/loader.js';
import { DingtalkAdapter } from './channels/dingtalk/index.js';
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

  // 2. 初始化日志
  const log = initLogger({
    level: config.logging.level,
    file: config.logging.file,
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
  await loadPluginsFromDirectory(pluginsDir, pluginRegistry);

  // 6. 初始化 Agent Runner
  const agentRunner = new AgentRunner({ config, skillManager });

  // 7. 初始化会话管理
  const sessionManager = new SessionManager({
    timeoutMinutes: config.gateway.session.timeoutMinutes,
    maxConcurrent: config.gateway.session.maxConcurrent,
  });

  // 8. 初始化消息路由
  const router = new MessageRouter({ sessionManager, agentRunner });

  // 9. 初始化 Gateway
  const server = new GatewayServer({ config: config.gateway, router });

  // 10. 初始化 Channel 适配器
  const channels: ChannelAdapter[] = [];

  if (config.channels.dingtalk?.enabled) {
    const dingtalk = new DingtalkAdapter();
    await dingtalk.initialize(config.channels.dingtalk as unknown as Record<string, unknown>);
    dingtalk.onMessage(async (msg) => {
      const response = await router.handleMessage(msg);
      if (msg.raw && (msg.raw as Record<string, unknown>)['sessionWebhook']) {
        // 钉钉通过 webhook 回复，已在适配器内处理
      }
    });
    channels.push(dingtalk);
    mainLog.info('钉钉 Channel 已配置');
  }

  if (config.channels.webchat?.enabled) {
    const webchat = new WebchatAdapter();
    await webchat.initialize(config.channels.webchat as unknown as Record<string, unknown>);
    webchat.onMessage(async (msg) => {
      const response = await router.handleMessage(msg);
      return response as unknown as void;
    });
    channels.push(webchat);
    mainLog.info('WebChat Channel 已配置');
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
        channels: channels.map(c => c.name),
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
