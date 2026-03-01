#!/usr/bin/env node

import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, writeFileSync, readFileSync, watchFile, statSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { createOpenPollen } from '../src/index.js';
import { loadConfig, resolveConfigPath } from '../src/config/loader.js';
import { SkillManager } from '../src/agent/skill-manager.js';
import { MarketplaceClient } from '../src/agent/marketplace-client.js';
import { BeeliveClient } from '../src/agent/beelive-client.js';
import { maskSecret } from '../src/utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// cli/index.ts → dist/cli/index.js, 需要往上两级到包根目录
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf-8'));

const PID_FILE = resolve(homedir(), '.openpollen', 'openpollen.pid');
const AUTH_FILE = resolve(homedir(), '.openpollen', 'auth.json');

function loadAuthToken(): string | null {
  try {
    if (!existsSync(AUTH_FILE)) return null;
    const data = JSON.parse(readFileSync(AUTH_FILE, 'utf-8')) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

function createMarketplaceClient(configPath?: string): MarketplaceClient {
  const config = loadConfig(configPath);
  const apiUrl = (config as Record<string, any>).marketplace?.apiUrl || process.env.BEELIVE_MARKETPLACE_URL || 'https://lite.beebywork.com/api/v1/skills-market';
  const token = loadAuthToken();
  return new MarketplaceClient(apiUrl, token ?? undefined);
}

function writePidFile(): void {
  const dir = resolve(homedir(), '.openpollen');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
}

function removePidFile(): void {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch {
    // ignore cleanup errors
  }
}

// 获取内置技能目录路径（相对于 CLI 入口）
function getBuiltinSkillsDir(): string {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  // dist/cli/ → 项目根/skills/
  return resolve(cliDir, '..', '..', 'skills');
}

/**
 * 保存 auth token 到 ~/.openpollen/auth.json
 */
function saveAuthToken(token: string, email: string): void {
  const authDir = resolve(homedir(), '.openpollen');
  if (!existsSync(authDir)) mkdirSync(authDir, { recursive: true });
  const authPath = resolve(authDir, 'auth.json');
  writeFileSync(authPath, JSON.stringify({
    token,
    email,
    loginAt: new Date().toISOString(),
  }, null, 2));
}

/**
 * 显示 Beelive 平台账户状态（套餐/试用）
 */
async function showAccountStatus(client: BeeliveClient): Promise<void> {
  try {
    const sub = await client.getSubscription();
    console.log(`\n  套餐: ${sub.plan} (${sub.status})`);
    if (sub.expires_at) {
      console.log(`  到期: ${sub.expires_at}`);
    }
    if (sub.rate_limit) {
      console.log(`  速率: ${sub.rate_limit.requests_per_minute} 次/分, ${sub.rate_limit.requests_per_day} 次/天`);
    }
  } catch {
    // 无订阅，尝试试用状态
    try {
      const trial = await client.getTrialStatus();
      if (trial.trial_active) {
        console.log(`\n  试用中: 剩余 ${trial.remaining_days ?? '?'} 天`);
        if (trial.remaining_requests !== undefined) {
          console.log(`  剩余请求: ${trial.remaining_requests}/${trial.total_requests ?? '?'}`);
        }
      } else {
        console.log('\n  试用已过期，请升级套餐。');
      }
    } catch {
      // 无试用信息
    }
  }
}

/**
 * 更新配置文件中的 providers.beelive
 */
function updateConfigProviders(apiKey: string, configPath?: string): void {
  const resolvedPath = resolveConfigPath(configPath) ?? resolve(homedir(), '.openpollen', 'openpollen.json');

  let config: Record<string, unknown> = {};
  if (existsSync(resolvedPath)) {
    try {
      config = JSON.parse(readFileSync(resolvedPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // 如果解析失败，用空对象
    }
  }

  // 确保 providers 对象存在
  if (!config.providers || typeof config.providers !== 'object') {
    config.providers = {};
  }
  const providers = config.providers as Record<string, unknown>;
  providers.beelive = {
    enabled: true,
    apiKey,
  };

  // 确保目录存在
  const dir = dirname(resolvedPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(resolvedPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 创建 BeeliveClient 实例
 */
function createBeeliveClient(token?: string): BeeliveClient {
  return new BeeliveClient(undefined, token ?? undefined);
}

/**
 * 打开浏览器（跨平台）
 */
async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('node:child_process');
  const platform = process.platform;
  const cmd = platform === 'win32' ? `start "" "${url}"`
    : platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  const child = exec(cmd, () => {});
  // 不让子进程阻塞 Node.js 退出
  child.unref();
}

/**
 * 浏览器认证流程 (Device Flow)
 * CLI 发起认证 → 打开浏览器 → 用户登录 → CLI 轮询获取 token
 */
async function doBrowserAuth(providers: Record<string, unknown>): Promise<void> {
  const atClient = createBeeliveClient();
  const s = p.spinner();

  try {
    s.start('正在发起认证...');
    const { session_id, auth_url } = await atClient.startCliAuth();
    s.stop('认证链接已生成');

    p.log.info(`请在浏览器中完成登录:`);
    p.log.message(auth_url);

    // 尝试自动打开浏览器
    await openBrowser(auth_url);

    s.start('等待浏览器认证...');

    // 轮询等待认证完成（每 2 秒一次，最多 5 分钟）
    const maxAttempts = 150;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));

      try {
        const result = await atClient.pollCliAuth(session_id);
        if (result.status === 'completed') {
          s.stop(`认证成功! 欢迎 ${result.email || '用户'}`);

          // 保存 token
          if (result.token) {
            saveAuthToken(result.token, result.email || '');
            atClient.setToken(result.token);
          }

          // 保存 API Key 到 providers
          if (result.api_key) {
            providers['beelive'] = { enabled: true, apiKey: result.api_key };
            p.log.success(`API Key 已获取: ${maskSecret(result.api_key)}`);
          } else {
            // 没有新 key（已存在），尝试通过 token 获取
            try {
              const keyResult = await atClient.getDesktopApiKey();
              if (keyResult.api_key) {
                providers['beelive'] = { enabled: true, apiKey: keyResult.api_key };
                p.log.success(`API Key 已获取: ${maskSecret(keyResult.api_key)}`);
              } else if (keyResult.exists) {
                p.log.info(`Desktop Key 已存在 (${keyResult.key_prefix})，请前往控制台复制完整密钥后配置。`);
              }
            } catch {
              // 忽略，token 已保存，用户可以稍后配置 API Key
            }
          }

          // 显示账户状态
          await showAccountStatus(atClient);
          return;
        }
      } catch {
        // 轮询失败（网络问题等），继续重试
      }
    }

    s.stop('认证超时');
    p.log.warn('浏览器认证超时，请重试或使用 API Key 方式。');
  } catch (err) {
    s.stop('认证失败');
    p.log.error(err instanceof Error ? err.message : String(err));
    p.log.info('提示: 可使用 API Key 方式，或稍后运行 `openpollen login`。');
  }
}

const program = new Command();

program
  .name('openpollen')
  .description('OpenPollen — 安全、易用、可扩展的开源 AI Agent 框架')
  .version(pkg.version);

// === start ===
program
  .command('start')
  .description('启动 OpenPollen Gateway')
  .option('-c, --config <path>', '配置文件路径')
  .option('-d, --daemon', '后台运行')
  .action(async (options: { config?: string; daemon?: boolean }) => {
    try {
      const hub = await createOpenPollen(options.config);
      await hub.start();

      writePidFile();

      console.log(`\n  OpenPollen v${pkg.version} 已启动`);
      console.log(`  Gateway: http://${hub.config.gateway.host}:${hub.config.gateway.port}`);

      if (hub.config.channels.webchat?.enabled) {
        console.log(`  Web Chat: http://localhost:${hub.config.channels.webchat.port}`);
      }
      if (hub.config.channels.dingtalk?.enabled) {
        console.log('  钉钉 Bot: 已连接 (Stream 模式)');
      }
      console.log('');

      // 优雅关闭（防止重复调用）
      let stopping = false;
      const shutdown = async () => {
        if (stopping) {
          console.log('\n强制退出...');
          process.exit(1);
        }
        stopping = true;
        console.log('\n正在停止...');
        removePidFile();
        await hub.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      process.on('exit', removePidFile);
    } catch (error) {
      console.error('启动失败:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// === init ===
program
  .command('init')
  .description('交互式初始化配置')
  .action(async () => {
    p.intro('欢迎使用 OpenPollen!');

    // 1. 选择模型来源
    const providerChoice = await p.select({
      message: '选择 AI 模型来源',
      options: [
        { value: 'cloud', label: 'OpenPollen Cloud', hint: '官方云服务，开箱即用' },
        { value: 'anthropic', label: 'Anthropic', hint: '使用自有 Claude API Key' },
        { value: 'ollama', label: '本地模型 (Ollama)', hint: '离线运行，完全私有' },
        { value: 'compatible', label: '其他兼容模型', hint: 'DeepSeek / Kimi / GLM 等' },
      ],
    });
    if (p.isCancel(providerChoice)) { p.cancel('已取消'); process.exit(0); }

    const providers: Record<string, unknown> = {};

    if (providerChoice === 'cloud') {
      // OpenPollen Cloud
      const authMethod = await p.select({
        message: 'OpenPollen Cloud 配置方式',
        options: [
          { value: 'browser', label: '浏览器登录 (推荐)', hint: '自动打开浏览器完成认证' },
          { value: 'apikey', label: '输入已有 API Key', hint: '已在控制台创建过 Key' },
        ],
      });
      if (p.isCancel(authMethod)) { p.cancel('已取消'); process.exit(0); }

      if (authMethod === 'browser') {
        await doBrowserAuth(providers);
      } else {
        const apiKey = await p.text({ message: '输入你的 OpenPollen Cloud API Key', validate: (v) => !v ? 'API Key 不能为空' : undefined });
        if (p.isCancel(apiKey)) { p.cancel('已取消'); process.exit(0); }
        providers['beelive'] = { enabled: true, apiKey };
      }
    } else if (providerChoice === 'anthropic') {
      const apiKey = await p.text({ message: '输入你的 Anthropic API Key', validate: (v) => !v ? 'API Key 不能为空' : undefined });
      if (p.isCancel(apiKey)) { p.cancel('已取消'); process.exit(0); }
      providers['anthropic'] = { enabled: true, apiKey };
    } else if (providerChoice === 'ollama') {
      const baseUrl = await p.text({ message: 'Ollama 地址', defaultValue: 'http://localhost:11434' });
      if (p.isCancel(baseUrl)) { p.cancel('已取消'); process.exit(0); }
      const model = await p.text({ message: '模型名称', defaultValue: 'qwen3-coder' });
      if (p.isCancel(model)) { p.cancel('已取消'); process.exit(0); }
      providers['ollama'] = { enabled: true, baseUrl, model };
    } else if (providerChoice === 'compatible') {
      // 其他兼容模型
      const compatModel = await p.select({
        message: '选择模型提供商',
        options: [
          { value: 'deepseek', label: 'DeepSeek', hint: 'deepseek.com' },
          { value: 'kimi', label: 'Kimi (Moonshot)', hint: 'platform.moonshot.cn' },
          { value: 'glm', label: 'GLM (智谱)', hint: 'open.bigmodel.cn' },
          { value: 'custom', label: '自定义兼容 API', hint: '任意 OpenAI 兼容接口' },
        ],
      });
      if (p.isCancel(compatModel)) { p.cancel('已取消'); process.exit(0); }

      const compatDefaults: Record<string, { baseUrl: string; defaultModel: string }> = {
        deepseek: { baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
        kimi: { baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k' },
        glm: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-flash' },
        custom: { baseUrl: '', defaultModel: '' },
      };
      const defaults = compatDefaults[compatModel as string];

      const apiKey = await p.text({ message: '输入 API Key', validate: (v) => !v ? 'API Key 不能为空' : undefined });
      if (p.isCancel(apiKey)) { p.cancel('已取消'); process.exit(0); }

      const baseUrl = await p.text({
        message: 'API Base URL',
        defaultValue: defaults.baseUrl,
        validate: (v) => !v ? 'Base URL 不能为空' : undefined,
      });
      if (p.isCancel(baseUrl)) { p.cancel('已取消'); process.exit(0); }

      const model = await p.text({
        message: '模型名称',
        defaultValue: defaults.defaultModel,
        validate: (v) => !v ? '模型名称不能为空' : undefined,
      });
      if (p.isCancel(model)) { p.cancel('已取消'); process.exit(0); }

      // 兼容模型走 anthropic provider 并覆盖 baseUrl
      providers['anthropic'] = { enabled: true, apiKey, baseUrl, model };
    }

    // 2. 选择聊天平台
    const channels: Record<string, unknown> = {};

    const channelChoices = await p.multiselect({
      message: '启用聊天平台',
      options: [
        { value: 'webchat', label: 'Web Chat', hint: '内置网页聊天' },
        { value: 'dingtalk', label: '钉钉 Bot', hint: 'Stream 模式' },
        { value: 'wechat', label: '企业微信', hint: '回调模式' },
      ],
      initialValues: ['webchat'],
      required: false,
    });
    if (p.isCancel(channelChoices)) { p.cancel('已取消'); process.exit(0); }

    if (channelChoices.includes('webchat')) {
      const port = await p.text({ message: 'WebChat 端口', defaultValue: '3001' });
      if (p.isCancel(port)) { p.cancel('已取消'); process.exit(0); }
      channels['webchat'] = { enabled: true, port: parseInt(port, 10) };
    }

    if (channelChoices.includes('dingtalk')) {
      const clientId = await p.text({ message: '钉钉 Client ID', validate: (v) => !v ? '不能为空' : undefined });
      if (p.isCancel(clientId)) { p.cancel('已取消'); process.exit(0); }
      const clientSecret = await p.text({ message: '钉钉 Client Secret', validate: (v) => !v ? '不能为空' : undefined });
      if (p.isCancel(clientSecret)) { p.cancel('已取消'); process.exit(0); }
      channels['dingtalk'] = { enabled: true, clientId, clientSecret, groupPolicy: 'mention' };
    }

    if (channelChoices.includes('wechat')) {
      const corpId = await p.text({ message: '企业微信 Corp ID', validate: (v) => !v ? '不能为空' : undefined });
      if (p.isCancel(corpId)) { p.cancel('已取消'); process.exit(0); }
      const agentId = await p.text({ message: '企业微信 Agent ID', validate: (v) => !v ? '不能为空' : undefined });
      if (p.isCancel(agentId)) { p.cancel('已取消'); process.exit(0); }
      const secret = await p.text({ message: '企业微信 Secret', validate: (v) => !v ? '不能为空' : undefined });
      if (p.isCancel(secret)) { p.cancel('已取消'); process.exit(0); }
      const token = await p.text({ message: '企业微信 Token', validate: (v) => !v ? '不能为空' : undefined });
      if (p.isCancel(token)) { p.cancel('已取消'); process.exit(0); }
      const encodingAESKey = await p.text({ message: '企业微信 EncodingAESKey', validate: (v) => !v ? '不能为空' : undefined });
      if (p.isCancel(encodingAESKey)) { p.cancel('已取消'); process.exit(0); }
      channels['wechat'] = { enabled: true, corpId, agentId, secret, token, encodingAESKey, callbackPort: 3002 };
    }

    // 3. 内置技能
    const builtinDir = getBuiltinSkillsDir();
    let installSkills = false;
    let builtinSkills: string[] = [];
    if (existsSync(builtinDir)) {
      builtinSkills = readdirSync(builtinDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);

      if (builtinSkills.length > 0) {
        const shouldInstall = await p.confirm({
          message: `是否安装内置技能 (${builtinSkills.join(', ')})?`,
          initialValue: true,
        });
        if (p.isCancel(shouldInstall)) { p.cancel('已取消'); process.exit(0); }
        installSkills = shouldInstall;
      }
    }

    // 4. 生成配置
    const config = {
      agent: {
        model: 'claude-sonnet-4-20250514',
        maxTurns: 15,
        maxBudgetUsd: 1.0,
        defaultTools: ['Read', 'Grep', 'Glob', 'WebSearch'],
        defaultSkills: [],
      },
      gateway: {
        host: '127.0.0.1',
        port: 18800,
        auth: { mode: 'none' },
        session: { timeoutMinutes: 30, maxConcurrent: 50 },
      },
      channels,
      providers,
      skills: { directory: '~/.openpollen/skills', enabled: [] },
      memory: { backend: 'sqlite', sqlitePath: '~/.openpollen/memory.db', fileDirectory: '~/.openpollen/memory' },
      logging: { level: 'info', file: '~/.openpollen/logs/openpollen.log' },
    };

    // 5. 写入配置文件
    const hiveDir = resolve(homedir(), '.openpollen');
    if (!existsSync(hiveDir)) {
      mkdirSync(hiveDir, { recursive: true });
    }

    const configPath = resolve(hiveDir, 'openpollen.json');
    let shouldWrite = true;
    if (existsSync(configPath)) {
      const overwrite = await p.confirm({ message: `配置文件已存在，是否覆盖?`, initialValue: false });
      if (p.isCancel(overwrite)) { p.cancel('已取消'); process.exit(0); }
      shouldWrite = overwrite;
    }

    if (shouldWrite) {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      p.log.success(`配置已保存到 ${configPath}`);
    } else {
      p.log.info('已跳过，配置未修改。');
    }

    // 6. 创建技能目录 & 安装内置技能
    const skillsDir = resolve(homedir(), '.openpollen', 'skills');
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    if (installSkills && builtinSkills.length > 0) {
      const manager = new SkillManager(skillsDir);
      for (const name of builtinSkills) {
        const skillPath = resolve(builtinDir, name);
        try {
          if (!existsSync(resolve(skillsDir, name))) {
            manager.installFromLocal(skillPath);
            p.log.success(`已安装技能: ${name}`);
          } else {
            p.log.info(`技能已存在: ${name} (跳过)`);
          }
        } catch (error) {
          p.log.error(`安装技能 ${name} 失败: ${error instanceof Error ? error.message : error}`);
        }
      }
    }

    // 7. 创建日志目录
    const logsDir = resolve(homedir(), '.openpollen', 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    // 8. 配置摘要
    const providerNames: Record<string, string> = {
      beelive: 'OpenPollen Cloud',
      anthropic: 'Anthropic',
      ollama: 'Ollama',
    };
    const activeProviders = Object.keys(providers).map(k => providerNames[k] || k);
    const activeChannels = Object.keys(channels).map(k => {
      const names: Record<string, string> = { webchat: 'Web Chat', dingtalk: '钉钉 Bot', wechat: '企业微信' };
      return names[k] || k;
    });

    p.note(
      [
        `模型来源:  ${activeProviders.join(', ') || '(未配置)'}`,
        `聊天平台:  ${activeChannels.join(', ') || '(未配置)'}`,
        `内置技能:  ${installSkills ? builtinSkills.join(', ') : '未安装'}`,
        `配置文件:  ${configPath}`,
        '',
        '常用命令:',
        '  openpollen start          启动服务',
        '  openpollen config show    查看当前配置',
        '  openpollen model list     查看模型状态',
        '  openpollen skill list     查看已安装技能',
      ].join('\n'),
      '配置摘要',
    );

    p.outro('初始化完成! 运行 `openpollen start` 启动。');
    process.exit(0);
  });

// === login ===
program
  .command('login')
  .description('登录到 OpenPollen Cloud')
  .option('--email', '使用邮箱密码方式登录')
  .action(async (options: { email?: boolean }) => {
    p.intro('登录 OpenPollen Cloud');

    if (!options.email) {
      // 默认走浏览器认证
      const loginProviders: Record<string, unknown> = {};
      await doBrowserAuth(loginProviders);

      // 如果获取到了 API Key，更新配置文件
      const beelive = loginProviders['beelive'] as { apiKey?: string } | undefined;
      if (beelive?.apiKey) {
        updateConfigProviders(beelive.apiKey);
        p.log.info('已自动更新配置文件');
      }

      p.outro('');
      process.exit(0);
    }

    // --email 方式：邮箱密码登录
    const email = await p.text({ message: '邮箱', validate: (v) => !v ? '邮箱不能为空' : undefined });
    if (p.isCancel(email)) { p.cancel('已取消'); process.exit(0); }
    const password = await p.text({ message: '密码', validate: (v) => !v ? '密码不能为空' : undefined });
    if (p.isCancel(password)) { p.cancel('已取消'); process.exit(0); }

    const s = p.spinner();
    s.start('正在登录...');
    try {
      const atClient = createBeeliveClient();
      const authResult = await atClient.login(email, password);
      atClient.setToken(authResult.access_token);
      saveAuthToken(authResult.access_token, email);
      s.stop('登录成功!');

      // 获取/创建 Desktop API Key 并更新配置
      try {
        const keyResult = await atClient.getDesktopApiKey();
        if (keyResult.api_key) {
          updateConfigProviders(keyResult.api_key);
          p.log.success(`API Key: ${maskSecret(keyResult.api_key)}`);
          p.log.info('已自动更新配置文件');
        } else if (keyResult.exists) {
          p.log.info(`Desktop Key 已存在 (${keyResult.key_prefix})`);
          p.log.info('完整密钥仅首次创建时显示，请前往控制台查看或删除后重新创建。');
        }
      } catch (keyErr) {
        p.log.warn(`获取 API Key 失败: ${keyErr instanceof Error ? keyErr.message : keyErr}`);
      }

      await showAccountStatus(atClient);
      p.outro('');
      process.exit(0);
    } catch (error) {
      s.stop('登录失败');
      p.log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// === stop ===
program
  .command('stop')
  .description('停止 OpenPollen Gateway')
  .action(() => {
    if (!existsSync(PID_FILE)) {
      console.log('OpenPollen 未运行（PID 文件不存在）。');
      return;
    }

    const pidStr = readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid)) {
      console.log('PID 文件内容无效，已清理。');
      removePidFile();
      return;
    }

    // 检查进程是否存活
    try {
      process.kill(pid, 0);
    } catch {
      console.log(`进程 ${pid} 不存在，清理过期 PID 文件。`);
      removePidFile();
      return;
    }

    // 发送 SIGTERM
    console.log(`正在停止 OpenPollen (PID: ${pid})...`);
    process.kill(pid, 'SIGTERM');

    // 等待确认进程退出
    let checks = 0;
    const interval = setInterval(() => {
      checks++;
      try {
        process.kill(pid, 0);
        if (checks >= 10) {
          clearInterval(interval);
          console.log(`进程 ${pid} 未在 5 秒内退出。可使用 kill -9 ${pid} 强制终止。`);
        }
      } catch {
        clearInterval(interval);
        removePidFile();
        console.log('OpenPollen 已停止。');
      }
    }, 500);
  });

// === status ===
program
  .command('status')
  .description('查看运行状态')
  .option('-c, --config <path>', '配置文件路径')
  .action(async (options: { config?: string }) => {
    try {
      const config = loadConfig(options.config);
      const url = `http://${config.gateway.host}:${config.gateway.port}/api/status`;
      const response = await fetch(url);
      const data = await response.json();
      console.log('OpenPollen 状态:', JSON.stringify(data, null, 2));
    } catch {
      console.log('OpenPollen 未运行');
    }
  });

// === config show ===
const configCmd = program.command('config').description('配置管理');
configCmd
  .command('show')
  .description('显示当前配置（密钥脱敏）')
  .option('-c, --config <path>', '配置文件路径')
  .action((options: { config?: string }) => {
    try {
      const config = loadConfig(options.config);
      // 脱敏处理
      const sanitized = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
      maskConfigSecrets(sanitized);
      console.log(JSON.stringify(sanitized, null, 2));
    } catch (error) {
      console.error('加载配置失败:', error instanceof Error ? error.message : error);
    }
  });

// === skill ===
const skillCmd = program.command('skill').description('技能管理');

skillCmd
  .command('list')
  .description('列出已安装技能')
  .option('-c, --config <path>', '配置文件路径')
  .action((options: { config?: string }) => {
    const config = loadConfig(options.config);
    const manager = new SkillManager(config.skills.directory);
    const skills = manager.discover();

    if (skills.length === 0) {
      console.log('暂无已安装技能。使用 `openpollen skill install <name>` 安装技能。');
      return;
    }

    console.log(`已安装技能 (${skills.length}):\n`);
    for (const skill of skills) {
      console.log(`  ${skill.name}`);
      console.log(`    描述: ${skill.description}`);
      console.log(`    来源: ${skill.source.type}${skill.source.version ? ` v${skill.source.version}` : ''}`);
      console.log(`    路径: ${skill.directory}`);
      console.log('');
    }
  });

skillCmd
  .command('install <nameOrPath>')
  .description('安装技能（市场名称 / Git URL / 本地路径）')
  .option('-c, --config <path>', '配置文件路径')
  .action(async (nameOrPath: string, options: { config?: string }) => {
    const config = loadConfig(options.config);
    const manager = new SkillManager(config.skills.directory);

    try {
      if (nameOrPath.startsWith('./') || nameOrPath.startsWith('/') || nameOrPath.startsWith('~')) {
        // 本地安装
        const skill = manager.installFromLocal(nameOrPath);
        console.log(`已安装 ${skill.name} 到 ${skill.directory}`);
      } else if (nameOrPath.startsWith('http') || nameOrPath.endsWith('.git')) {
        // Git URL 安装
        const skill = manager.installFromGit(nameOrPath);
        console.log(`已安装 ${skill.name} 到 ${skill.directory}`);
      } else {
        // 市场安装
        const client = createMarketplaceClient(options.config);
        console.log(`正在从市场搜索 "${nameOrPath}" ...`);

        const result = await client.search(nameOrPath, { pageSize: 5 });
        const exact = result.items.find(s => s.name === nameOrPath);

        if (!exact) {
          if (result.items.length === 0) {
            console.log(`未在市场中找到 "${nameOrPath}"。`);
          } else {
            console.log(`未找到精确匹配，相关结果:`);
            for (const s of result.items) {
              const priceStr = s.pricing_model === 'free' ? '免费' : `¥${s.price}`;
              console.log(`  ${s.name} - ${s.display_name} (${priceStr})`);
            }
            console.log(`\n使用精确名称安装: openpollen skill install <name>`);
          }
          return;
        }

        // 免费技能直接下载
        if (exact.pricing_model === 'free') {
          console.log(`正在下载 ${exact.display_name} ...`);
          const pkg = await client.downloadPackage(exact.id);
          const skill = manager.installFromMarketplace(exact.name, pkg, 'latest', exact.id);
          console.log(`已安装 ${skill.name} 到 ${skill.directory}`);
          return;
        }

        // 付费技能
        const token = loadAuthToken();
        if (!token) {
          console.log(`技能 "${exact.display_name}" 需要付费 (¥${exact.price})。请先登录: openpollen login`);
          return;
        }

        // 检查是否已购买
        const purchased = await client.checkPurchase(exact.id);
        if (purchased) {
          console.log(`已购买，正在下载 ${exact.display_name} ...`);
          const pkg = await client.downloadPackage(exact.id);
          const skill = manager.installFromMarketplace(exact.name, pkg, 'latest', exact.id);
          console.log(`已安装 ${skill.name} 到 ${skill.directory}`);
          return;
        }

        // 未购买，创建支付订单
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const confirm = await new Promise<string>(resolve =>
          rl.question(`技能 "${exact.display_name}" 需要 ¥${exact.price}，是否购买? (y/N): `, answer => {
            resolve(answer.trim().toLowerCase());
            rl.close();
          }),
        );

        if (confirm !== 'y') {
          console.log('已取消。');
          return;
        }

        console.log('正在创建支付订单...');
        const purchase = await client.createPurchase(exact.id);

        if (purchase.status === 'installed') {
          console.log('购买成功! 正在下载...');
          const pkg = await client.downloadPackage(exact.id);
          const skill = manager.installFromMarketplace(exact.name, pkg, 'latest', exact.id);
          console.log(`已安装 ${skill.name} 到 ${skill.directory}`);
          return;
        }

        if (purchase.qr_code_url) {
          console.log(`\n请使用微信扫描以下链接支付 ¥${purchase.amount}:`);
          console.log(`  ${purchase.qr_code_url}`);
          console.log('\n支付完成后，重新运行此命令完成安装。');
        }
      }
    } catch (error) {
      console.error('安装失败:', error instanceof Error ? error.message : error);
    }
  });

skillCmd
  .command('remove <name>')
  .description('卸载技能')
  .option('-c, --config <path>', '配置文件路径')
  .action((name: string, options: { config?: string }) => {
    const config = loadConfig(options.config);
    const manager = new SkillManager(config.skills.directory);
    manager.discover();

    try {
      manager.remove(name);
      console.log(`已卸载技能: ${name}`);
    } catch (error) {
      console.error('卸载失败:', error instanceof Error ? error.message : error);
    }
  });

skillCmd
  .command('create <name>')
  .description('创建新技能脚手架')
  .option('-c, --config <path>', '配置文件路径')
  .action((name: string, options: { config?: string }) => {
    const config = loadConfig(options.config);
    const manager = new SkillManager(config.skills.directory);

    try {
      const dir = manager.create(name);
      console.log(`已创建技能脚手架: ${dir}`);
      console.log('编辑 SKILL.md 文件来定义你的技能。');
    } catch (error) {
      console.error('创建失败:', error instanceof Error ? error.message : error);
    }
  });

skillCmd
  .command('update <name>')
  .description('更新技能到最新版（仅支持 Git 来源）')
  .option('-c, --config <path>', '配置文件路径')
  .action((name: string, options: { config?: string }) => {
    const config = loadConfig(options.config);
    const manager = new SkillManager(config.skills.directory);
    manager.discover();

    try {
      const skill = manager.update(name);
      console.log(`已更新技能: ${skill.name}`);
    } catch (error) {
      console.error('更新失败:', error instanceof Error ? error.message : error);
    }
  });

skillCmd
  .command('search <keyword>')
  .description('搜索官方技能市场')
  .option('-c, --config <path>', '配置文件路径')
  .option('--category <category>', '按分类过滤 (coding/writing/data/automation/other)')
  .option('--sort <sort>', '排序方式 (downloads/rating/newest)', 'newest')
  .action(async (keyword: string, options: { config?: string; category?: string; sort?: string }) => {
    try {
      const client = createMarketplaceClient(options.config);
      console.log(`搜索 "${keyword}" ...\n`);

      const result = await client.search(keyword, {
        category: options.category,
        sortBy: (options.sort as 'downloads' | 'rating' | 'newest') || 'newest',
      });

      if (result.items.length === 0) {
        console.log('未找到相关技能。');
        return;
      }

      console.log(`找到 ${result.total} 个技能:\n`);
      for (let i = 0; i < result.items.length; i++) {
        const s = result.items[i];
        const priceStr = s.pricing_model === 'free' ? '免费' : `¥${s.price}`;
        const ratingStr = s.rating_count > 0 ? `${s.avg_rating}/5` : '-';
        const officialTag = s.is_official ? ' [官方]' : '';
        console.log(`  ${i + 1}. ${s.name}${officialTag}`);
        console.log(`     ${s.display_name} - ${s.description?.slice(0, 60) || ''}`);
        console.log(`     评分: ${ratingStr} | 下载: ${s.download_count} | 价格: ${priceStr}`);
        console.log('');
      }

      console.log(`安装: openpollen skill install <name>`);
    } catch (error) {
      console.error('搜索失败:', error instanceof Error ? error.message : error);
    }
  });

skillCmd
  .command('publish <name>')
  .description('发布技能到官方市场')
  .option('-c, --config <path>', '配置文件路径')
  .action(async (name: string, options: { config?: string }) => {
    const token = loadAuthToken();
    if (!token) {
      console.log('请先登录: openpollen login');
      return;
    }

    const config = loadConfig(options.config);
    const manager = new SkillManager(config.skills.directory);
    manager.discover();

    const skill = manager.get(name);
    if (!skill) {
      console.error(`技能不存在: ${name}。请先创建或安装此技能。`);
      return;
    }

    const skillMdContent = manager.getSkillContent(name);
    if (!skillMdContent) {
      console.error(`无法读取 SKILL.md: ${name}`);
      return;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> =>
      new Promise(resolve => rl.question(q, answer => resolve(answer.trim())));

    try {
      console.log(`\n发布技能: ${skill.name}`);
      console.log(`描述: ${skill.description}\n`);

      // 选择定价模式
      console.log('定价模式:');
      console.log('  1. 免费');
      console.log('  2. 一次性付费');
      console.log('  3. 订阅制');
      const pricingChoice = await ask('请选择 (1-3): ');
      const pricingMap: Record<string, string> = { '1': 'free', '2': 'one_time', '3': 'subscription' };
      const pricingModel = pricingMap[pricingChoice] || 'free';

      let price = 0;
      if (pricingModel !== 'free') {
        const priceStr = await ask('价格（元）: ');
        price = parseFloat(priceStr) || 0;
      }

      // 选择分类
      console.log('\n分类:');
      console.log('  1. coding (编程)');
      console.log('  2. writing (写作)');
      console.log('  3. data (数据)');
      console.log('  4. automation (自动化)');
      console.log('  5. other (其他)');
      const catChoice = await ask('请选择 (1-5): ');
      const catMap: Record<string, string> = { '1': 'coding', '2': 'writing', '3': 'data', '4': 'automation', '5': 'other' };
      const category = catMap[catChoice] || 'other';

      const version = await ask('版本号 (如 1.0.0): ') || '1.0.0';

      const client = createMarketplaceClient(options.config);
      console.log('\n正在发布...');

      // 创建技能
      const published = await client.publish({
        name: skill.name,
        display_name: skill.name,
        description: skill.description,
        category,
        pricing_model: pricingModel,
        price,
      });

      // 打包技能目录
      const { execSync: execSyncLocal } = await import('node:child_process');
      const tmpTar = resolve(skill.directory, '..', `${name}.tar.gz`);
      execSyncLocal(`tar -czf ${tmpTar} -C ${skill.directory} .`, { stdio: 'pipe' });
      const packageData = readFileSync(tmpTar);

      // 上传版本
      await client.uploadVersion(published.id, Buffer.from(packageData), version, '初始版本', skillMdContent);

      // 清理临时文件
      try { unlinkSync(tmpTar); } catch { /* ignore */ }

      console.log(`\n技能已提交审核!`);
      console.log(`  名称: ${published.name}`);
      console.log(`  ID: ${published.id}`);
      console.log(`  状态: 待审核`);
      console.log('\n审核通过后将在市场中可见。');
    } catch (error) {
      console.error('发布失败:', error instanceof Error ? error.message : error);
    } finally {
      rl.close();
    }
  });

skillCmd
  .command('earnings')
  .description('查看开发者技能收入')
  .option('-c, --config <path>', '配置文件路径')
  .option('--month <month>', '指定月份 (如 2026-02)')
  .action(async (options: { config?: string; month?: string }) => {
    const token = loadAuthToken();
    if (!token) {
      console.log('请先登录: openpollen login');
      return;
    }

    try {
      const client = createMarketplaceClient(options.config);
      const earnings = await client.getEarnings(options.month);

      if (!earnings || earnings.length === 0) {
        console.log('暂无收入记录。');
        return;
      }

      console.log('\n技能收入概览:\n');
      let totalAll = 0;
      for (const e of earnings) {
        console.log(`  ${e.month}`);
        console.log(`    安装数: ${e.install_count} | 总收入: ¥${e.author_earning.toFixed(2)} (扣除平台费 ¥${e.platform_fee.toFixed(2)})`);
        totalAll += e.author_earning;
      }
      console.log(`\n  累计净收入: ¥${totalAll.toFixed(2)}`);
    } catch (error) {
      console.error('查询失败:', error instanceof Error ? error.message : error);
    }
  });

// === model ===
const modelCmd = program.command('model').description('模型/Provider 管理');

modelCmd
  .command('list')
  .description('列出已配置的 Provider 及状态')
  .option('-c, --config <path>', '配置文件路径')
  .action(async (options: { config?: string }) => {
    try {
      const config = loadConfig(options.config);
      const { providers } = config;

      console.log('\n已配置的 AI Provider:\n');

      // Beelive 平台
      const beeliveProvider = providers.beelive;
      if (beeliveProvider) {
        const status = beeliveProvider.enabled ? (beeliveProvider.apiKey ? 'OK' : '缺少 API Key') : '未启用';
        console.log(`  OpenPollen Cloud`);
        console.log(`    状态: ${status}`);
        if (beeliveProvider.apiKey) console.log(`    API Key: ${maskSecret(beeliveProvider.apiKey)}`);
        if (beeliveProvider.baseUrl) console.log(`    Base URL: ${beeliveProvider.baseUrl}`);
      }

      // Anthropic
      if (providers.anthropic) {
        const an = providers.anthropic;
        const status = an.enabled ? (an.apiKey ? 'OK' : '缺少 API Key') : '未启用';
        console.log(`  Anthropic`);
        console.log(`    状态: ${status}`);
        if (an.apiKey) console.log(`    API Key: ${maskSecret(an.apiKey)}`);
        if (an.baseUrl) console.log(`    Base URL: ${an.baseUrl}`);
      }

      // Ollama
      if (providers.ollama) {
        const ol = providers.ollama;
        const status = ol.enabled ? 'OK' : '未启用';
        console.log(`  Ollama`);
        console.log(`    状态: ${status}`);
        if (ol.baseUrl) console.log(`    Base URL: ${ol.baseUrl}`);
        if (ol.model) console.log(`    模型: ${ol.model}`);
      }

      if (!providers.beelive && !providers.anthropic && !providers.ollama) {
        console.log('  (无) 请运行 `openpollen init` 配置 Provider。');
      }

      // 若已登录 Beelive，显示远程套餐信息
      const token = loadAuthToken();
      if (token && providers.beelive?.enabled) {
        const atClient = createBeeliveClient(token);
        console.log('\n  OpenPollen Cloud 账户信息:');
        await showAccountStatus(atClient);
      }

      console.log('');
    } catch (error) {
      console.error('加载配置失败:', error instanceof Error ? error.message : error);
    }
  });

// === channel ===
const channelCmd = program.command('channel').description('聊天平台管理');

channelCmd
  .command('list')
  .description('列出已配置的平台')
  .option('-c, --config <path>', '配置文件路径')
  .action((options: { config?: string }) => {
    const config = loadConfig(options.config);
    console.log('已配置的聊天平台:\n');

    if (config.channels.dingtalk) {
      const dt = config.channels.dingtalk;
      console.log(`  钉钉: ${dt.enabled ? '已启用' : '未启用'}`);
      if (dt.enabled) {
        console.log(`    Client ID: ${maskSecret(dt.clientId)}`);
        console.log(`    群消息策略: ${dt.groupPolicy}`);
      }
    }

    if (config.channels.webchat) {
      const wc = config.channels.webchat;
      console.log(`  WebChat: ${wc.enabled ? '已启用' : '未启用'}`);
      if (wc.enabled) {
        console.log(`    端口: ${wc.port}`);
      }
    }

    if (config.channels.feishu) {
      const fs = config.channels.feishu;
      console.log(`  飞书: ${fs.enabled ? '已启用' : '未启用'}`);
      if (fs.enabled) {
        console.log(`    App ID: ${maskSecret(fs.appId)}`);
        console.log(`    群消息策略: ${fs.groupPolicy}`);
      }
    }
  });

channelCmd
  .command('test <name>')
  .description('发送测试消息到指定平台')
  .option('-c, --config <path>', '配置文件路径')
  .action(async (name: string, options: { config?: string }) => {
    const config = loadConfig(options.config);

    if (name === 'webchat' && config.channels.webchat?.enabled) {
      const port = config.channels.webchat.port;
      try {
        const response = await fetch(`http://127.0.0.1:${port}`);
        if (response.ok) {
          console.log(`WebChat 运行正常，访问 http://localhost:${port} 进行测试。`);
        } else {
          console.log(`WebChat 返回状态码 ${response.status}，请检查是否已启动。`);
        }
      } catch {
        console.log(`无法连接 WebChat (端口 ${port})。请先运行 \`openpollen start\`。`);
      }
    } else if (name === 'dingtalk' || name === 'feishu') {
      // 通过 Gateway HTTP API 发送测试消息
      const url = `http://${config.gateway.host}:${config.gateway.port}/api/chat`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'OpenPollen 测试消息', userId: 'test-user' }),
        });
        const data = await response.json() as { response?: string; error?: string };
        if (data.response) {
          console.log(`Gateway 响应: ${data.response.slice(0, 200)}`);
        } else {
          console.log(`Gateway 返回: ${JSON.stringify(data)}`);
        }
      } catch {
        console.log('无法连接 Gateway。请先运行 `openpollen start`。');
      }
    } else {
      console.log(`未知或未启用的平台: ${name}`);
      console.log('可用平台: webchat, dingtalk, feishu');
    }
  });

// === logs ===
program
  .command('logs')
  .description('查看日志')
  .option('-l, --level <level>', '过滤日志级别 (info/warn/error/debug)')
  .option('-n, --lines <n>', '显示最近 N 行', '50')
  .option('-f, --follow', '持续跟踪日志')
  .action(async (options: { level?: string; lines: string; follow?: boolean }) => {
    const logFile = resolve(homedir(), '.openpollen', 'logs', 'openpollen.log');

    if (!existsSync(logFile)) {
      console.log('日志文件不存在。OpenPollen 是否已经运行过?');
      console.log(`预期路径: ${logFile}`);
      return;
    }

    const content = readFileSync(logFile, 'utf-8');
    const allLines = content.split('\n').filter(Boolean);
    const maxLines = parseInt(options.lines, 10) || 50;

    let lines = allLines;

    // 按级别过滤
    if (options.level) {
      const level = options.level.toLowerCase();
      const levelMap: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
      const minLevel = levelMap[level];
      if (minLevel) {
        lines = lines.filter(line => {
          try {
            const parsed = JSON.parse(line) as { level?: number };
            return (parsed.level ?? 0) >= minLevel;
          } catch {
            return true;
          }
        });
      }
    }

    // 取最后 N 行
    const tail = lines.slice(-maxLines);

    for (const line of tail) {
      try {
        const parsed = JSON.parse(line) as { level?: number; time?: number; msg?: string; [k: string]: unknown };
        const levelNames: Record<number, string> = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' };
        const levelName = levelNames[parsed.level ?? 30] ?? 'INFO';
        const time = parsed.time ? new Date(parsed.time).toISOString().slice(11, 19) : '';
        console.log(`${time} [${levelName}] ${parsed.msg ?? ''}`);
      } catch {
        console.log(line);
      }
    }

    if (options.follow) {
      console.log('\n--- 持续跟踪中 (Ctrl+C 退出) ---');
      let lastSize = statSync(logFile).size;
      watchFile(logFile, { interval: 1000 }, () => {
        const newContent = readFileSync(logFile, 'utf-8');
        const newData = newContent.slice(lastSize);
        lastSize = newContent.length;
        if (newData.trim()) {
          process.stdout.write(newData);
        }
      });
    }
  });

program.parse();

/**
 * 递归脱敏配置中的敏感字段
 */
function maskConfigSecrets(obj: Record<string, unknown>): void {
  const secretKeys = ['apiKey', 'clientSecret', 'secret', 'password'];
  for (const [key, value] of Object.entries(obj)) {
    if (secretKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase())) && typeof value === 'string' && value) {
      obj[key] = maskSecret(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      maskConfigSecrets(value as Record<string, unknown>);
    }
  }
}
