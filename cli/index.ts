#!/usr/bin/env node

import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, writeFileSync, readFileSync, watchFile, statSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHiveAgent } from '../src/index.js';
import { loadConfig } from '../src/config/loader.js';
import { SkillManager } from '../src/agent/skill-manager.js';
import { maskSecret } from '../src/utils/crypto.js';

const PID_FILE = resolve(homedir(), '.hiveagent', 'hiveagent.pid');

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
      'AgentTerm 云端托管 (推荐，无需翻墙，按量计费)',
      '自有 API Key (Anthropic)',
      '本地模型 (Ollama)',
    ]);

    const providers: Record<string, unknown> = {};

    if (providerIndex === 0) {
      const apiKey = await ask('输入你的 AgentTerm API Key: ');
      providers['agentterm'] = { enabled: true, apiKey };
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
  .action((nameOrPath: string, options: { config?: string }) => {
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
        // 市场安装 (Phase 3)
        console.log(`技能市场安装将在未来版本支持。技能名: ${nameOrPath}`);
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
  .action((keyword: string) => {
    console.log(`搜索 "${keyword}" ...`);
    console.log('技能市场搜索将在未来版本支持。目前可通过 Git URL 或本地路径安装技能。');
  });

skillCmd
  .command('publish <name>')
  .description('发布技能到官方市场')
  .action((name: string) => {
    console.log(`发布技能 "${name}" ...`);
    console.log('技能市场发布将在未来版本支持。');
  });

skillCmd
  .command('earnings')
  .description('查看开发者技能收入')
  .action(() => {
    console.log('技能收入查看将在未来版本支持。');
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
