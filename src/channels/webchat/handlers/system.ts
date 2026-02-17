import type { ResponseFrame } from '../protocol.js';
import { okResponse } from '../protocol.js';

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

export function handleSkillsStatus(reqId: string): ResponseFrame {
  return okResponse(reqId, { skills: [] });
}
