#!/usr/bin/env node

import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, writeFileSync, readFileSync, watchFile, statSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHiveAgent } from '../src/index.js';
import { loadConfig, resolveConfigPath } from '../src/config/loader.js';
import { SkillManager } from '../src/agent/skill-manager.js';
import { MarketplaceClient } from '../src/agent/marketplace-client.js';
import { BeeliveClient } from '../src/agent/beelive-client.js';
import { maskSecret } from '../src/utils/crypto.js';

const PID_FILE = resolve(homedir(), '.hiveagent', 'hiveagent.pid');
const AUTH_FILE = resolve(homedir(), '.hiveagent', 'auth.json');

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
  const apiUrl = config.marketplace?.apiUrl || process.env.BEELIVE_MARKETPLACE_URL || 'https://lite.beebywork.com/api/v1/skills-market';
  const token = loadAuthToken();
  return new MarketplaceClient(apiUrl, token ?? undefined);
}

function writePidFile(): void {
  const dir = resolve(homedir(), '.hiveagent');
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
 * 保存 auth token 到 ~/.hiveagent/auth.json
 */
function saveAuthToken(token: string, email: string): void {
  const authDir = resolve(homedir(), '.hiveagent');
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
  const resolvedPath = resolveConfigPath(configPath) ?? resolve(homedir(), '.hiveagent', 'hiveagent.json');

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

const program = new Command();

program
  .name('hiveagent')
  .description('HiveAgent — 安全、易用、国产化的 AI Agent 平台')
  .version('0.1.0');

// === start ===
program
  .command('start')
  .description('启动 HiveAgent Gateway')
  .option('-c, --config <path>', '配置文件路径')
  .option('-d, --daemon', '后台运行')
  .action(async (options: { config?: string; daemon?: boolean }) => {
    try {
      const hub = await createHiveAgent(options.config);
      await hub.start();

      writePidFile();

      console.log('\n  HiveAgent v0.1.0 已启动');
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
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> =>
      new Promise(resolve => rl.question(q, answer => resolve(answer.trim())));

    const choose = async (prompt: string, options: string[]): Promise<number> => {
      console.log(prompt);
      for (let i = 0; i < options.length; i++) {
        console.log(`  ${i + 1}. ${options[i]}`);
      }
      while (true) {
        const answer = await ask(`请选择 (1-${options.length}): `);
        const n = parseInt(answer, 10);
        if (n >= 1 && n <= options.length) return n - 1;
        console.log('无效选择，请重试。');
      }
    };

    console.log('\n  欢迎使用 HiveAgent!\n');

    // 1. 选择模型来源
    const providerIndex = await choose('选择 AI 模型来源:', [
      'Beelive 云端托管 (推荐，无需翻墙，按量计费)',
      '自有 API Key (Anthropic)',
      '本地模型 (Ollama)',
    ]);

    const providers: Record<string, unknown> = {};

    if (providerIndex === 0) {
      const subIndex = await choose('Beelive 平台配置方式:', [
        '我已有 API Key（直接输入）',
        '注册新账号',
        '登录已有账号',
      ]);

      if (subIndex === 0) {
        // 直接输入 API Key
        const apiKey = await ask('输入你的 Beelive API Key: ');
        providers['beelive'] = { enabled: true, apiKey };
      } else if (subIndex === 1) {
        // 注册新账号
        const email = await ask('邮箱: ');
        const password = await ask('密码: ');
        if (!email || !password) {
          console.log('邮箱和密码不能为空，跳过 Beelive 配置。');
        } else {
          try {
            const atClient = createBeeliveClient();
            const authResult = await atClient.register(email, password);
            atClient.setToken(authResult.access_token);
            saveAuthToken(authResult.access_token, email);
            console.log('  注册成功!');

            // 检查账号状态
            try {
              const me = await atClient.getMe();
              if (me.status === 'pending') {
                console.log('  账号待激活，请查收邮件完成激活后运行 `hiveagent login` 获取 API Key。');
              } else {
                // 获取 Desktop API Key
                try {
                  const keyResult = await atClient.getDesktopApiKey();
                  if (keyResult.api_key) {
                    providers['beelive'] = { enabled: true, apiKey: keyResult.api_key };
                    console.log(`  API Key 已获取: ${maskSecret(keyResult.api_key)}`);
                  } else if (keyResult.exists) {
                    console.log(`  Desktop Key 已存在 (${keyResult.key_prefix})`);
                    console.log('  完整密钥仅首次创建时显示，请手动输入。');
                    const manualKey = await ask('输入 API Key (留空跳过): ');
                    if (manualKey) {
                      providers['beelive'] = { enabled: true, apiKey: manualKey };
                    }
                  }
                } catch (keyErr) {
                  console.log(`  自动获取 API Key 失败: ${keyErr instanceof Error ? keyErr.message : keyErr}`);
                  const manualKey = await ask('手动输入 API Key (留空跳过): ');
                  if (manualKey) {
                    providers['beelive'] = { enabled: true, apiKey: manualKey };
                  }
                }
              }
            } catch {
              // getMe 失败时尝试直接获取 key
              try {
                const keyResult = await atClient.getDesktopApiKey();
                if (keyResult.api_key) {
                  providers['beelive'] = { enabled: true, apiKey: keyResult.api_key };
                  console.log(`  API Key 已获取: ${maskSecret(keyResult.api_key)}`);
                } else if (keyResult.exists) {
                  console.log(`  Desktop Key 已存在 (${keyResult.key_prefix})，请手动输入。`);
                }
              } catch {
                console.log('  请运行 `hiveagent login` 获取 API Key。');
              }
            }

            await showAccountStatus(atClient);
          } catch (err) {
            console.error('  注册失败:', err instanceof Error ? err.message : err);
            console.log('  提示: 如已有账号，可运行 `hiveagent login` 登录。');
          }
        }
      } else {
        // 登录已有账号
        const email = await ask('邮箱: ');
        const password = await ask('密码: ');
        if (!email || !password) {
          console.log('邮箱和密码不能为空，跳过 Beelive 配置。');
        } else {
          try {
            const atClient = createBeeliveClient();
            const authResult = await atClient.login(email, password);
            atClient.setToken(authResult.access_token);
            saveAuthToken(authResult.access_token, email);
            console.log('  登录成功!');

            // 获取 Desktop API Key
            try {
              const keyResult = await atClient.getDesktopApiKey();
              if (keyResult.api_key) {
                providers['beelive'] = { enabled: true, apiKey: keyResult.api_key };
                console.log(`  API Key 已获取: ${maskSecret(keyResult.api_key)}`);
              } else if (keyResult.exists) {
                console.log(`  Desktop Key 已存在 (${keyResult.key_prefix})`);
                console.log('  完整密钥仅首次创建时显示，请手动输入。');
                const manualKey = await ask('输入 API Key (留空跳过): ');
                if (manualKey) {
                  providers['beelive'] = { enabled: true, apiKey: manualKey };
                }
              }
            } catch (keyErr) {
              console.log(`  自动获取 API Key 失败: ${keyErr instanceof Error ? keyErr.message : keyErr}`);
              const manualKey = await ask('手动输入 API Key (留空跳过): ');
              if (manualKey) {
                providers['beelive'] = { enabled: true, apiKey: manualKey };
              }
            }

            await showAccountStatus(atClient);
          } catch (err) {
            console.error('  登录失败:', err instanceof Error ? err.message : err);
            console.log('  提示: 可稍后运行 `hiveagent login` 重试。');
          }
        }
      }
    } else if (providerIndex === 1) {
      const apiKey = await ask('输入你的 Anthropic API Key: ');
      providers['anthropic'] = { enabled: true, apiKey };
    } else {
      const baseUrl = await ask('Ollama 地址 (默认 http://localhost:11434): ') || 'http://localhost:11434';
      const model = await ask('模型名称 (默认 qwen3-coder): ') || 'qwen3-coder';
      providers['ollama'] = { enabled: true, baseUrl, model };
    }

    // 2. 选择聊天平台
    const channels: Record<string, unknown> = {};

    const enableDingtalk = (await ask('\n是否启用钉钉 Bot? (y/N): ')).toLowerCase() === 'y';
    if (enableDingtalk) {
      const clientId = await ask('钉钉 Client ID: ');
      const clientSecret = await ask('钉钉 Client Secret: ');
      channels['dingtalk'] = { enabled: true, clientId, clientSecret, groupPolicy: 'mention' };
    }

    const enableWebchat = (await ask('是否启用 Web Chat? (Y/n): ')).toLowerCase() !== 'n';
    if (enableWebchat) {
      const port = parseInt(await ask('WebChat 端口 (默认 3001): ') || '3001', 10);
      channels['webchat'] = { enabled: true, port };
    }

    // 3. 生成配置
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
      skills: { directory: '~/.hiveagent/skills', enabled: [] },
      memory: { backend: 'sqlite', sqlitePath: '~/.hiveagent/memory.db', fileDirectory: '~/.hiveagent/memory' },
      logging: { level: 'info', file: '~/.hiveagent/logs/hiveagent.log' },
    };

    // 4. 写入配置文件
    const hiveDir = resolve(homedir(), '.hiveagent');
    if (!existsSync(hiveDir)) {
      mkdirSync(hiveDir, { recursive: true });
    }

    const configPath = resolve(hiveDir, 'hiveagent.json');
    const overwrite = existsSync(configPath)
      ? (await ask(`\n配置文件已存在 (${configPath})，是否覆盖? (y/N): `)).toLowerCase() === 'y'
      : true;

    if (overwrite) {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`\n  配置已保存到 ${configPath}`);
    } else {
      console.log('\n  已取消，配置未修改。');
    }

    // 5. 创建技能目录
    const skillsDir = resolve(homedir(), '.hiveagent', 'skills');
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
      console.log(`  技能目录已创建: ${skillsDir}`);
    }

    // 6. 安装内置技能
    const builtinDir = getBuiltinSkillsDir();
    if (existsSync(builtinDir)) {
      const builtinSkills = readdirSync(builtinDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);

      if (builtinSkills.length > 0) {
        const installBuiltin = (await ask(`\n是否安装内置技能 (${builtinSkills.join(', ')})? (Y/n): `)).toLowerCase() !== 'n';
        if (installBuiltin) {
          const manager = new SkillManager(skillsDir);
          for (const name of builtinSkills) {
            const skillPath = resolve(builtinDir, name);
            try {
              if (!existsSync(resolve(skillsDir, name))) {
                manager.installFromLocal(skillPath);
                console.log(`  已安装技能: ${name}`);
              } else {
                console.log(`  技能已存在: ${name} (跳过)`);
              }
            } catch (error) {
              console.error(`  安装技能 ${name} 失败:`, error instanceof Error ? error.message : error);
            }
          }
        }
      }
    }

    // 7. 创建日志目录
    const logsDir = resolve(homedir(), '.hiveagent', 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    console.log('\n  初始化完成! 运行 `hiveagent start` 启动。\n');

    rl.close();
  });

// === login ===
program
  .command('login')
  .description('登录到 Beelive 平台')
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> =>
      new Promise(resolve => rl.question(q, answer => resolve(answer.trim())));

    try {
      const email = await ask('邮箱: ');
      const password = await ask('密码: ');

      if (!email || !password) {
        console.log('邮箱和密码不能为空');
        rl.close();
        return;
      }

      // 1. 登录
      const atClient = createBeeliveClient();
      const authResult = await atClient.login(email, password);
      atClient.setToken(authResult.access_token);

      // 2. 保存 JWT
      saveAuthToken(authResult.access_token, email);
      console.log('\n  登录成功!');

      // 3. 获取/创建 Desktop API Key 并更新配置
      try {
        const keyResult = await atClient.getDesktopApiKey();
        if (keyResult.api_key) {
          // 首次创建，拿到完整 key
          updateConfigProviders(keyResult.api_key);
          console.log(`  API Key: ${maskSecret(keyResult.api_key)}`);
          console.log('  已自动更新配置文件 providers.beelive');
        } else if (keyResult.exists) {
          // key 已存在，只有前缀
          console.log(`  Desktop Key 已存在 (${keyResult.key_prefix})`);
          console.log('  完整密钥仅首次创建时显示，请前往控制台查看或删除后重新创建。');
        }
      } catch (keyErr) {
        console.log(`  获取 API Key 失败: ${keyErr instanceof Error ? keyErr.message : keyErr}`);
      }

      // 4. 显示套餐/试用状态
      await showAccountStatus(atClient);

      console.log('');
    } catch (error) {
      console.error('登录失败:', error instanceof Error ? error.message : error);
    } finally {
      rl.close();
    }
  });

// === stop ===
program
  .command('stop')
  .description('停止 HiveAgent Gateway')
  .action(() => {
    if (!existsSync(PID_FILE)) {
      console.log('HiveAgent 未运行（PID 文件不存在）。');
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
    console.log(`正在停止 HiveAgent (PID: ${pid})...`);
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
        console.log('HiveAgent 已停止。');
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
      console.log('HiveAgent 状态:', JSON.stringify(data, null, 2));
    } catch {
      console.log('HiveAgent 未运行');
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
      console.log('暂无已安装技能。使用 `hiveagent skill install <name>` 安装技能。');
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
            console.log(`\n使用精确名称安装: hiveagent skill install <name>`);
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
          console.log(`技能 "${exact.display_name}" 需要付费 (¥${exact.price})。请先登录: hiveagent login`);
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

      console.log(`安装: hiveagent skill install <name>`);
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
      console.log('请先登录: hiveagent login');
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
      console.log('请先登录: hiveagent login');
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
      const beeliveProvider = providers.beelive ?? providers.agentterm;
      if (beeliveProvider) {
        const status = beeliveProvider.enabled ? (beeliveProvider.apiKey ? 'OK' : '缺少 API Key') : '未启用';
        console.log(`  Beelive 聚合平台`);
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

      // OpenAI
      if (providers.openai) {
        const oi = providers.openai;
        const status = oi.enabled ? (oi.apiKey ? 'OK' : '缺少 API Key') : '未启用';
        console.log(`  OpenAI`);
        console.log(`    状态: ${status}`);
        if (oi.apiKey) console.log(`    API Key: ${maskSecret(oi.apiKey)}`);
      }

      if (!providers.beelive && !providers.agentterm && !providers.anthropic && !providers.ollama && !providers.openai) {
        console.log('  (无) 请运行 `hiveagent init` 配置 Provider。');
      }

      // 若已登录 Beelive，显示远程套餐信息
      const token = loadAuthToken();
      if (token && (providers.beelive?.enabled || providers.agentterm?.enabled)) {
        const atClient = createBeeliveClient(token);
        console.log('\n  Beelive 平台账户信息:');
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
        console.log(`无法连接 WebChat (端口 ${port})。请先运行 \`hiveagent start\`。`);
      }
    } else if (name === 'dingtalk') {
      // 通过 Gateway HTTP API 发送测试消息
      const url = `http://${config.gateway.host}:${config.gateway.port}/api/chat`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'HiveAgent 测试消息', userId: 'test-user' }),
        });
        const data = await response.json() as { response?: string; error?: string };
        if (data.response) {
          console.log(`Gateway 响应: ${data.response.slice(0, 200)}`);
        } else {
          console.log(`Gateway 返回: ${JSON.stringify(data)}`);
        }
      } catch {
        console.log('无法连接 Gateway。请先运行 `hiveagent start`。');
      }
    } else {
      console.log(`未知或未启用的平台: ${name}`);
      console.log('可用平台: webchat, dingtalk');
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
    const logFile = resolve(homedir(), '.hiveagent', 'logs', 'hiveagent.log');

    if (!existsSync(logFile)) {
      console.log('日志文件不存在。HiveAgent 是否已经运行过?');
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
