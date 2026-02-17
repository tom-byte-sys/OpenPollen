import type { GatewayBrowserClient } from "../gateway.ts";
import type { LogEntry, LogLevel } from "../types.ts";

export type LogsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  logsLoading: boolean;
  logsError: string | null;
  logsCursor: number | null;
  logsFile: string | null;
  logsEntries: LogEntry[];
  logsTruncated: boolean;
  logsLastFetchAt: number | null;
  logsLimit: number;
  logsMaxBytes: number;
};

const LOG_BUFFER_LIMIT = 2000;
const LEVELS = new Set<LogLevel>(["trace", "debug", "info", "warn", "error", "fatal"]);

function parseMaybeJsonString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeLevel(value: unknown): LogLevel | null {
  if (typeof value === "string") {
    const lowered = value.toLowerCase() as LogLevel;
    return LEVELS.has(lowered) ? lowered : null;
  }
  if (typeof value === "number") {
    return PINO_LEVEL_MAP[value] ?? null;
  }
  return null;
}

const PINO_LEVEL_MAP: Record<number, LogLevel> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

export function parseLogLine(line: string): LogEntry {
  if (!line.trim()) {
    return { raw: line, message: line };
  }
  try {
    const obj = JSON.parse(line) as Record<string, unknown>;
    const meta =
      obj && typeof obj._meta === "object" && obj._meta !== null
        ? (obj._meta as Record<string, unknown>)
        : null;

    // Time: pino uses numeric ms timestamp; legacy uses string or _meta.date
    let time: string | null = null;
    if (typeof obj.time === "number") {
      time = new Date(obj.time).toISOString();
    } else if (typeof obj.time === "string") {
      time = obj.time;
    } else if (typeof meta?.date === "string") {
      time = meta.date;
    }

    // Level: pino uses numeric (30=info); legacy uses _meta.logLevelName
    const level = normalizeLevel(obj.level) ?? normalizeLevel(meta?.logLevelName ?? meta?.level);

    // Subsystem: pino child logger sets obj.module; legacy uses obj["0"] or _meta.name
    let subsystem: string | null = null;
    if (typeof obj.module === "string") {
      subsystem = obj.module;
    } else {
      const contextCandidate =
        typeof obj["0"] === "string" ? obj["0"] : typeof meta?.name === "string" ? meta?.name : null;
      const contextObj = parseMaybeJsonString(contextCandidate);
      if (contextObj) {
        if (typeof contextObj.subsystem === "string") {
          subsystem = contextObj.subsystem;
        } else if (typeof contextObj.module === "string") {
          subsystem = contextObj.module;
        }
      }
      if (!subsystem && contextCandidate && contextCandidate.length < 120) {
        subsystem = contextCandidate;
      }
    }

    // Message: pino uses obj.msg; legacy uses obj["1"] or obj["0"] or obj.message
    let message: string | null = null;
    if (typeof obj.msg === "string") {
      message = obj.msg;
    } else if (typeof obj["1"] === "string") {
      message = obj["1"];
    } else if (!subsystem && typeof obj["0"] === "string") {
      message = obj["0"];
    } else if (typeof obj.message === "string") {
      message = obj.message;
    }

    return {
      raw: line,
      time,
      level,
      subsystem,
      message: message ?? line,
      meta: meta ?? undefined,
    };
  } catch {
    return { raw: line, message: line };
  }
}

export async function loadLogs(state: LogsState, opts?: { reset?: boolean; quiet?: boolean }) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.logsLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.logsLoading = true;
  }
  state.logsError = null;
  try {
    const res = await state.client.request("logs.tail", {
      cursor: opts?.reset ? undefined : (state.logsCursor ?? undefined),
      limit: state.logsLimit,
      maxBytes: state.logsMaxBytes,
    });
    const payload = res as {
      file?: string;
      cursor?: number;
      size?: number;
      lines?: unknown;
      truncated?: boolean;
      reset?: boolean;
    };
    const lines = Array.isArray(payload.lines)
      ? payload.lines.filter((line) => typeof line === "string")
      : [];
    const entries = lines.map(parseLogLine);
    const shouldReset = Boolean(opts?.reset || payload.reset || state.logsCursor == null);
    state.logsEntries = shouldReset
      ? entries
      : [...state.logsEntries, ...entries].slice(-LOG_BUFFER_LIMIT);
    if (typeof payload.cursor === "number") {
      state.logsCursor = payload.cursor;
    }
    if (typeof payload.file === "string") {
      state.logsFile = payload.file;
    }
    state.logsTruncated = Boolean(payload.truncated);
    state.logsLastFetchAt = Date.now();
  } catch (err) {
    state.logsError = String(err);
  } finally {
    if (!opts?.quiet) {
      state.logsLoading = false;
    }
  }
}
