import { readFileSync, writeFileSync } from 'node:fs';
import JSON5 from 'json5';
import { Value } from '@sinclair/typebox/value';
import { AppConfigSchema } from '../../../config/schema.js';
import { sha256 } from '../../../utils/crypto.js';
import { okResponse, errorResponse, type ResponseFrame } from '../protocol.js';

export function handleConfigGetFull(
  reqId: string,
  configFilePath: string | null,
): ResponseFrame {
  if (!configFilePath) {
    return errorResponse(reqId, 'NOT_FOUND', 'No config file found');
  }

  try {
    const raw = readFileSync(configFilePath, 'utf-8');
    const hash = sha256(raw);

    let parsed: unknown;
    let parseError: string | null = null;
    try {
      parsed = JSON5.parse(raw);
    } catch (e) {
      parseError = (e as Error).message;
    }

    // 将用户的部分配置与 schema 默认值合并，生成完整配置供表单渲染
    let merged: unknown = parsed;
    let validationErrors: Array<{ path: string; message: string }> = [];
    if (parsed && !parseError) {
      try {
        const defaults = Value.Create(AppConfigSchema);
        merged = deepMergeConfig(defaults as Record<string, unknown>, parsed as Record<string, unknown>);
      } catch {
        // 合并失败时回退到原始解析结果
        merged = parsed;
      }
      validationErrors = [...Value.Errors(AppConfigSchema, merged)].map(e => ({
        path: e.path,
        message: e.message,
      }));
    }

    return okResponse(reqId, {
      path: configFilePath,
      raw,
      hash,
      parsed: parseError ? null : parsed,
      config: parseError ? null : merged,
      valid: !parseError && validationErrors.length === 0,
      parseError,
      validationErrors,
      issues: validationErrors,
    });
  } catch (e) {
    return errorResponse(reqId, 'INTERNAL', `Failed to read config: ${(e as Error).message}`);
  }
}

function deepMergeConfig(
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
      result[key] = deepMergeConfig(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export function handleConfigSchema(reqId: string): ResponseFrame {
  const sensitiveFields = [
    '/properties/channels/properties/dingtalk/properties/clientSecret',
    '/properties/channels/properties/dingtalk/properties/clientId',
    '/properties/channels/properties/wechat/properties/secret',
    '/properties/channels/properties/wechat/properties/token',
    '/properties/channels/properties/wechat/properties/encodingAESKey',
    '/properties/providers/properties/beelive/properties/apiKey',
    '/properties/providers/properties/anthropic/properties/apiKey',
    '/properties/providers/properties/ollama/properties/apiKey',
  ];

  // 中文字段标签 — key 格式为点分路径，支持 * 通配符
  const labels: Record<string, { label?: string; help?: string }> = {
    // 通用字段
    '*.enabled': { label: '启用' },
    '*.apiKey': { label: 'API 密钥' },
    '*.baseUrl': { label: '接口地址' },
    '*.model': { label: '模型' },

    // 顶层分组
    'agent': { label: '智能体' },
    'gateway': { label: '网关' },
    'channels': { label: '渠道' },
    'providers': { label: '提供商' },
    'skills': { label: '技能' },
    'memory': { label: '记忆' },
    'logging': { label: '日志' },
    // 智能体
    'agent.model': { label: '模型', help: 'Claude 模型标识符' },
    'agent.fallbackModel': { label: '备选模型' },
    'agent.maxTurns': { label: '最大轮次', help: '单次对话最大交互轮数' },
    'agent.maxBudgetUsd': { label: '预算上限 (USD)', help: '单次对话最大花费' },
    'agent.systemPrompt': { label: '系统提示词', help: '留空则使用 Claude Code 内置的默认提示词，填写后会追加到默认提示词之后' },

    // 网关
    'gateway.host': { label: '监听地址' },
    'gateway.port': { label: '端口' },
    'gateway.auth': { label: '认证' },
    'gateway.auth.mode': { label: '认证模式' },
    'gateway.auth.backendUrl': { label: '后端地址' },
    'gateway.session': { label: '会话' },
    'gateway.session.timeoutMinutes': { label: '会话超时 (分钟)' },
    'gateway.session.maxConcurrent': { label: '最大并发数' },

    // 渠道 — 钉钉
    'channels.dingtalk': { label: '钉钉' },
    'channels.dingtalk.clientId': { label: '客户端 ID' },
    'channels.dingtalk.clientSecret': { label: '客户端密钥' },
    'channels.dingtalk.robotCode': { label: '机器人编码' },
    'channels.dingtalk.groupPolicy': { label: '群消息策略', help: 'mention: 仅 @机器人 时响应；all: 所有消息' },

    // 渠道 — WebChat
    'channels.webchat': { label: 'WebChat' },
    'channels.webchat.port': { label: '端口' },
    'channels.webchat.assistantName': { label: '助手名称' },

    // 渠道 — 企业微信
    'channels.wechat': { label: '企业微信' },
    'channels.wechat.corpId': { label: '企业 ID' },
    'channels.wechat.agentId': { label: '应用 ID' },
    'channels.wechat.secret': { label: '应用密钥' },
    'channels.wechat.token': { label: 'Token' },
    'channels.wechat.encodingAESKey': { label: '消息加密密钥' },
    'channels.wechat.callbackPort': { label: '回调端口' },

    // 提供商
    'providers.beelive': { label: 'Beelive' },
    'providers.beelive.baseUrl': { label: '接口地址', help: '留空则使用默认 Beelive 代理地址' },
    'providers.beelive.model': { label: '模型', help: '留空则使用智能体配置中的模型（默认 claude-sonnet-4-20250514）' },
    'providers.anthropic': { label: 'Anthropic' },
    'providers.anthropic.baseUrl': { label: '接口地址', help: '留空则使用 Anthropic 官方地址' },
    'providers.ollama': { label: 'Ollama' },

    // 技能
    'skills.directory': { label: '技能目录', help: '技能文件存放路径，默认 ~/.openpollen/skills' },

    // 记忆
    'memory.backend': { label: '存储后端' },
    'memory.sqlitePath': { label: 'SQLite 路径' },
    'memory.fileDirectory': { label: '文件目录' },

    // 日志
    'logging.level': { label: '日志级别' },
    'logging.file': { label: '日志文件', help: '日志输出文件路径，留空则不写文件' },
  };

  return okResponse(reqId, {
    schema: AppConfigSchema,
    uiHints: { sensitiveFields, ...labels },
  });
}

export function handleConfigSet(
  reqId: string,
  params: { raw?: string; expectedHash?: string } | undefined,
  configFilePath: string | null,
): ResponseFrame {
  if (!configFilePath) {
    return errorResponse(reqId, 'NOT_FOUND', 'No config file found');
  }

  if (!params?.raw || typeof params.raw !== 'string') {
    return errorResponse(reqId, 'BAD_PARAMS', 'Missing "raw" string in params');
  }

  // Optimistic concurrency: check hash
  if (params.expectedHash) {
    try {
      const current = readFileSync(configFilePath, 'utf-8');
      const currentHash = sha256(current);
      if (currentHash !== params.expectedHash) {
        return errorResponse(reqId, 'CONFLICT', 'Config file has been modified externally. Refresh and try again.');
      }
    } catch {
      // File might not exist yet, proceed
    }
  }

  // Validate JSON5 syntax
  try {
    JSON5.parse(params.raw);
  } catch (e) {
    return errorResponse(reqId, 'BAD_PARAMS', `Invalid JSON5 syntax: ${(e as Error).message}`);
  }

  try {
    writeFileSync(configFilePath, params.raw, 'utf-8');
    const newHash = sha256(params.raw);
    return okResponse(reqId, { saved: true, hash: newHash });
  } catch (e) {
    return errorResponse(reqId, 'INTERNAL', `Failed to write config: ${(e as Error).message}`);
  }
}

export async function handleConfigApply(
  reqId: string,
  params: { raw?: string; expectedHash?: string } | undefined,
  configFilePath: string | null,
  reloadConfig: () => Promise<void>,
): Promise<ResponseFrame> {
  const setResult = handleConfigSet(reqId, params, configFilePath);
  if (!setResult.ok) {
    return setResult;
  }

  try {
    await reloadConfig();
    return okResponse(reqId, { saved: true, reloaded: true, hash: (setResult.payload as { hash: string }).hash });
  } catch (e) {
    return errorResponse(reqId, 'INTERNAL', `Config saved but reload failed: ${(e as Error).message}`);
  }
}
