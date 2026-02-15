import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import JSON5 from 'json5';
import { Value } from '@sinclair/typebox/value';
import { AppConfigSchema, type AppConfig } from './schema.js';

/**
 * 替换配置值中的 ${ENV_VAR} 为实际环境变量值
 */
function substituteEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
      return process.env[varName] ?? '';
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVars);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }
  return obj;
}

/**
 * 展开 ~ 为用户目录
 */
export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return resolve(homedir(), filepath.slice(2));
  }
  return filepath;
}

/**
 * 查找配置文件路径
 * 优先级：命令行参数 > 当前目录 > ~/.hiveagent/
 */
function findConfigFile(explicitPath?: string): string | null {
  if (explicitPath) {
    const resolved = resolve(explicitPath);
    if (existsSync(resolved)) return resolved;
    throw new Error(`配置文件不存在: ${resolved}`);
  }

  const candidates = [
    resolve(process.cwd(), 'hiveagent.json'),
    resolve(homedir(), '.hiveagent', 'hiveagent.json'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * 创建默认配置
 */
function createDefaultConfig(): AppConfig {
  return Value.Create(AppConfigSchema) as AppConfig;
}

/**
 * 加载并验证配置
 */
export function loadConfig(explicitPath?: string): AppConfig {
  const configPath = findConfigFile(explicitPath);

  let rawConfig: Record<string, unknown>;

  if (configPath) {
    const content = readFileSync(configPath, 'utf-8');
    rawConfig = JSON5.parse(content) as Record<string, unknown>;
  } else {
    rawConfig = {};
  }

  // 环境变量替换
  const substituted = substituteEnvVars(rawConfig) as Record<string, unknown>;

  // 合并默认值
  const defaultConfig = createDefaultConfig();
  const merged = deepMerge(defaultConfig as unknown as Record<string, unknown>, substituted);

  // Schema 校验
  const errors = [...Value.Errors(AppConfigSchema, merged)];
  if (errors.length > 0) {
    const details = errors.map(e => `  ${e.path}: ${e.message}`).join('\n');
    throw new Error(`配置校验失败:\n${details}`);
  }

  // 展开路径中的 ~ 并将相对路径 resolve 为绝对路径
  const config = merged as AppConfig;
  config.skills.directory = resolve(expandHome(config.skills.directory));
  config.memory.sqlitePath = resolve(expandHome(config.memory.sqlitePath));
  config.memory.fileDirectory = resolve(expandHome(config.memory.fileDirectory));
  if (config.logging.file) {
    config.logging.file = resolve(expandHome(config.logging.file));
  }

  return config;
}

/**
 * 深度合并对象（target 会被 source 覆盖）
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

/**
 * 获取配置文件所在目录
 */
export function getConfigDir(explicitPath?: string): string {
  const configPath = findConfigFile(explicitPath);
  if (configPath) return dirname(configPath);
  return resolve(homedir(), '.hiveagent');
}
