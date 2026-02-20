// OpenPollen WebSocket RPC Protocol v3 — frame types, constants, error codes

export const PROTOCOL_VERSION = 3;

// --- Frame types ---

export interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

export type Frame = RequestFrame | ResponseFrame | EventFrame;

// --- Error codes ---

export const ErrorCode = {
  INVALID_FRAME: 'INVALID_FRAME',
  METHOD_NOT_FOUND: 'METHOD_NOT_FOUND',
  UNAVAILABLE: 'UNAVAILABLE',
  INTERNAL: 'INTERNAL',
  BAD_PARAMS: 'BAD_PARAMS',
  ABORT_FAILED: 'ABORT_FAILED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
} as const;

// --- Chat event states ---

export type ChatEventState = 'delta' | 'final' | 'error' | 'aborted';

export interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  seq: number;
  state: ChatEventState;
  message?: {
    role: 'assistant';
    content: Array<{ type: 'text'; text: string } | { type: 'thinking'; thinking: string }>;
  };
  errorMessage?: string;
}

// --- Handshake payloads ---

export interface ChallengePayload {
  nonce: string;
  ts: number;
}

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client?: {
    name?: string;
    version?: string;
  };
  device?: {
    id?: string;
  };
}

export interface HelloOkPayload {
  protocol: number;
  server: {
    version: string;
    connId: string;
  };
  features: {
    methods: string[];
    events: string[];
  };
}

// --- Helper builders ---

export function okResponse(id: string, payload?: unknown): ResponseFrame {
  return { type: 'res', id, ok: true, payload };
}

export function errorResponse(id: string, code: string, message: string): ResponseFrame {
  return { type: 'res', id, ok: false, error: { code, message } };
}

export function eventFrame(event: string, payload?: unknown, seq?: number): EventFrame {
  return { type: 'event', event, payload, seq };
}

export function isRequestFrame(data: unknown): data is RequestFrame {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).type === 'req' &&
    typeof (data as Record<string, unknown>).id === 'string' &&
    typeof (data as Record<string, unknown>).method === 'string'
  );
}
