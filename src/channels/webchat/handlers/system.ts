import type { ResponseFrame } from '../protocol.js';
import { okResponse } from '../protocol.js';
import type { AppConfig } from '../../../config/schema.js';
import type { SkillManager } from '../../../agent/skill-manager.js';

const startTime = Date.now();

export function handleHealth(reqId: string): ResponseFrame {
  return okResponse(reqId, { status: 'ok', ts: Date.now() });
}

export function handleStatus(reqId: string, extra?: { sessions?: number; memory?: string }): ResponseFrame {
  return okResponse(reqId, {
    uptime: Date.now() - startTime,
    sessions: extra?.sessions ?? 0,
    memory: extra?.memory ?? 'unknown',
  });
}

export function handleConfigGet(reqId: string): ResponseFrame {
  return okResponse(reqId, {});
}

export function handleSkillsStatus(reqId: string, skillManager?: SkillManager): ResponseFrame {
  if (!skillManager) {
    return okResponse(reqId, { skills: [] });
  }

  const skills = skillManager.list().map((s) => ({
    name: s.name,
    description: s.description,
    source: s.source.type,
    filePath: `${s.directory}/SKILL.md`,
    baseDir: s.directory,
    skillKey: s.name,
    eligible: true,
    always: false,
    disabled: false,
    blockedByAllowlist: false,
  }));

  return okResponse(reqId, { skills });
}

export function handleModelsList(reqId: string, appConfig: AppConfig): ResponseFrame {
  const models: Array<{ id: string; source: string }> = [];

  // Primary model
  if (appConfig.agent.model) {
    models.push({ id: appConfig.agent.model, source: 'agent.model' });
  }

  // Fallback model
  if (appConfig.agent.fallbackModel) {
    models.push({ id: appConfig.agent.fallbackModel, source: 'agent.fallbackModel' });
  }

  // Models from providers
  if (appConfig.providers) {
    for (const [name, provider] of Object.entries(appConfig.providers)) {
      if (provider?.enabled && provider.model) {
        models.push({ id: provider.model, source: `providers.${name}` });
      }
    }
  }

  return okResponse(reqId, { models });
}

/**
 * system-presence — returns current instance presence info.
 */
export function handleSystemPresence(reqId: string): ResponseFrame {
  const hostname = typeof globalThis.process !== 'undefined' ? globalThis.process.env.HOSTNAME || 'localhost' : 'localhost';
  const platform = typeof globalThis.process !== 'undefined' ? globalThis.process.platform : 'unknown';

  return okResponse(reqId, [
    {
      instanceId: 'primary',
      host: hostname,
      ip: null,
      version: '0.1.7',
      platform,
      deviceFamily: null,
      modelIdentifier: null,
      roles: ['gateway', 'agent'],
      scopes: ['openpollen'],
      mode: 'standalone',
      lastInputSeconds: null,
      reason: null,
      text: null,
      ts: Date.now(),
    },
  ]);
}

const HEARTBEAT_INTERVAL_MS = 30_000;

export function handleLastHeartbeat(
  reqId: string,
  getLastTickTs: () => number | null,
): ResponseFrame {
  const lastTs = getLastTickTs();
  const now = Date.now();

  return okResponse(reqId, {
    lastHeartbeat: lastTs,
    agoMs: lastTs ? now - lastTs : null,
    intervalMs: HEARTBEAT_INTERVAL_MS,
  });
}
