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

    let validationErrors: Array<{ path: string; message: string }> = [];
    if (parsed && !parseError) {
      validationErrors = [...Value.Errors(AppConfigSchema, parsed)].map(e => ({
        path: e.path,
        message: e.message,
      }));
    }

    return okResponse(reqId, {
      path: configFilePath,
      raw,
      hash,
      parsed: parseError ? null : parsed,
      valid: !parseError && validationErrors.length === 0,
      parseError,
      validationErrors,
    });
  } catch (e) {
    return errorResponse(reqId, 'INTERNAL', `Failed to read config: ${(e as Error).message}`);
  }
}

export function handleConfigSchema(reqId: string): ResponseFrame {
  const sensitiveFields = [
    '/properties/channels/properties/dingtalk/properties/clientSecret',
    '/properties/channels/properties/dingtalk/properties/clientId',
    '/properties/channels/properties/wechat/properties/secret',
    '/properties/channels/properties/wechat/properties/token',
    '/properties/channels/properties/wechat/properties/encodingAESKey',
    '/properties/providers/properties/beelive/properties/apiKey',
    '/properties/providers/properties/agentterm/properties/apiKey',
    '/properties/providers/properties/anthropic/properties/apiKey',
    '/properties/providers/properties/openai/properties/apiKey',
    '/properties/providers/properties/ollama/properties/apiKey',
  ];

  return okResponse(reqId, {
    schema: AppConfigSchema,
    uiHints: { sensitiveFields },
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
