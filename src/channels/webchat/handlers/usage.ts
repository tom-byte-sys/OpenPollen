import type { ResponseFrame } from '../protocol.js';
import { okResponse, errorResponse } from '../protocol.js';
import type { MemoryStore } from '../../../memory/interface.js';
import { getLogger } from '../../../utils/logger.js';

const log = getLogger('webchat:usage');

// --- Internal types ---

interface UsageLogRecord {
  timestamp: number;
  channelId?: string;
  sdkSessionId?: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
  numTurns?: number;
  durationMs?: number;
  isError?: boolean;
  stopReason?: string | null;
}

interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
}

// --- Helpers ---

function emptyTotals(): UsageTotals {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
    totalTokens: 0, totalCost: 0,
    inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0,
    missingCostEntries: 0,
  };
}

function addToTotals(totals: UsageTotals, rec: UsageLogRecord): void {
  totals.input += rec.inputTokens;
  totals.output += rec.outputTokens;
  totals.cacheRead += rec.cacheReadTokens;
  totals.cacheWrite += rec.cacheWriteTokens;
  totals.totalTokens += rec.totalTokens;
  totals.totalCost += rec.costUsd;
  if (rec.totalTokens > 0 && rec.costUsd === 0) {
    totals.missingCostEntries++;
  }
}

function toDateString(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateRange(startDate: string, endDate: string): { startTs: number; endTs: number } {
  const startTs = new Date(`${startDate}T00:00:00`).getTime();
  const endTs = new Date(`${endDate}T23:59:59.999`).getTime();
  return { startTs, endTs };
}

function extractTimestampFromKey(key: string): number | null {
  // key format: run:{timestamp}:{seq}
  const parts = key.split(':');
  if (parts.length >= 2) {
    const ts = parseInt(parts[1], 10);
    if (!isNaN(ts)) return ts;
  }
  return null;
}

async function loadUsageLogs(
  memory: MemoryStore,
  namespaceKey: string,
  startTs?: number,
  endTs?: number,
): Promise<UsageLogRecord[]> {
  const entries = await memory.list(`usage-log:${namespaceKey}`, 'run:');
  const records: UsageLogRecord[] = [];
  for (const entry of entries) {
    const keyTs = extractTimestampFromKey(entry.key);
    if (keyTs !== null) {
      if (startTs && keyTs < startTs) continue;
      if (endTs && keyTs > endTs) continue;
    }
    try {
      records.push(JSON.parse(entry.value) as UsageLogRecord);
    } catch { /* skip malformed */ }
  }
  return records;
}

const USAGE_LOG_PREFIX = 'usage-log:';

// --- Handler 1: sessions.usage ---

export async function handleSessionsUsage(
  reqId: string,
  params: { startDate?: string; endDate?: string; limit?: number },
  memory: MemoryStore,
): Promise<ResponseFrame> {
  const startDate = params?.startDate ?? toDateString(Date.now() - 30 * 86400000);
  const endDate = params?.endDate ?? toDateString(Date.now());
  const limit = params?.limit ?? 1000;
  const { startTs, endTs } = dateRange(startDate, endDate);

  try {
    const namespaces = await memory.listNamespaces(USAGE_LOG_PREFIX);

    const globalTotals = emptyTotals();
    const sessions: Array<{
      key: string;
      usage: UsageTotals & { firstActivity?: number; lastActivity?: number };
      model?: string;
      updatedAt?: number;
    }> = [];
    const dailyMap = new Map<string, { tokens: number; cost: number; messages: number; toolCalls: number; errors: number }>();
    const modelMap = new Map<string, { count: number; totals: UsageTotals }>();
    let totalMessages = 0;
    let totalErrors = 0;

    for (const ns of namespaces) {
      if (sessions.length >= limit) break;

      const sessionKey = ns.slice(USAGE_LOG_PREFIX.length);
      const records = await loadUsageLogs(memory, sessionKey, startTs, endTs);
      if (records.length === 0) continue;

      const sessionTotals = emptyTotals();
      let lastModel: string | undefined;
      let lastActivity = 0;
      let firstActivity = Infinity;

      for (const rec of records) {
        addToTotals(sessionTotals, rec);
        addToTotals(globalTotals, rec);
        if (rec.model) lastModel = rec.model;
        if (rec.timestamp > lastActivity) lastActivity = rec.timestamp;
        if (rec.timestamp < firstActivity) firstActivity = rec.timestamp;

        // Daily aggregation
        const day = toDateString(rec.timestamp);
        const daily = dailyMap.get(day) ?? { tokens: 0, cost: 0, messages: 0, toolCalls: 0, errors: 0 };
        daily.tokens += rec.totalTokens;
        daily.cost += rec.costUsd;
        daily.messages += rec.numTurns ?? 1;
        if (rec.isError) daily.errors++;
        dailyMap.set(day, daily);

        // Model aggregation
        const modelKey = rec.model ?? 'unknown';
        const modelEntry = modelMap.get(modelKey) ?? { count: 0, totals: emptyTotals() };
        modelEntry.count++;
        addToTotals(modelEntry.totals, rec);
        modelMap.set(modelKey, modelEntry);

        totalMessages += rec.numTurns ?? 1;
        if (rec.isError) totalErrors++;
      }

      sessions.push({
        key: sessionKey,
        usage: {
          ...sessionTotals,
          firstActivity: firstActivity === Infinity ? undefined : firstActivity,
          lastActivity: lastActivity || undefined,
        },
        model: lastModel,
        updatedAt: lastActivity || undefined,
      });
    }

    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    const byModel = Array.from(modelMap.entries()).map(([model, { count, totals }]) => ({
      model, count, totals,
    }));

    return okResponse(reqId, {
      updatedAt: Date.now(),
      startDate,
      endDate,
      sessions,
      totals: globalTotals,
      aggregates: {
        daily,
        messages: {
          total: totalMessages,
          user: 0,
          assistant: 0,
          toolCalls: 0,
          toolResults: 0,
          errors: totalErrors,
        },
        tools: { totalCalls: 0, uniqueTools: 0, tools: [] },
        byModel,
        byProvider: [],
        byAgent: [],
        byChannel: [],
      },
    });
  } catch (err) {
    log.error({ error: err }, 'Failed to load sessions usage');
    return errorResponse(reqId, 'INTERNAL', 'Failed to load usage data');
  }
}

// --- Handler 2: usage.cost ---

export async function handleUsageCost(
  reqId: string,
  params: { startDate?: string; endDate?: string },
  memory: MemoryStore,
): Promise<ResponseFrame> {
  const startDate = params?.startDate ?? toDateString(Date.now() - 30 * 86400000);
  const endDate = params?.endDate ?? toDateString(Date.now());
  const { startTs, endTs } = dateRange(startDate, endDate);

  try {
    const namespaces = await memory.listNamespaces(USAGE_LOG_PREFIX);
    const dailyMap = new Map<string, UsageTotals>();
    const globalTotals = emptyTotals();

    for (const ns of namespaces) {
      const sessionKey = ns.slice(USAGE_LOG_PREFIX.length);
      const records = await loadUsageLogs(memory, sessionKey, startTs, endTs);
      for (const rec of records) {
        addToTotals(globalTotals, rec);
        const day = toDateString(rec.timestamp);
        const dayTotals = dailyMap.get(day) ?? emptyTotals();
        addToTotals(dayTotals, rec);
        dailyMap.set(day, dayTotals);
      }
    }

    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, totals]) => ({ date, ...totals }));

    return okResponse(reqId, {
      updatedAt: Date.now(),
      days: daily.length,
      daily,
      totals: globalTotals,
    });
  } catch (err) {
    log.error({ error: err }, 'Failed to load usage cost');
    return errorResponse(reqId, 'INTERNAL', 'Failed to load cost data');
  }
}

// --- Handler 3: sessions.usage.timeseries ---

export async function handleSessionUsageTimeSeries(
  reqId: string,
  params: { key?: string },
  memory: MemoryStore,
): Promise<ResponseFrame> {
  const key = params?.key;
  if (!key) {
    return errorResponse(reqId, 'BAD_PARAMS', 'key is required');
  }

  try {
    const records = await loadUsageLogs(memory, key);
    records.sort((a, b) => a.timestamp - b.timestamp);

    let cumulativeTokens = 0;
    let cumulativeCost = 0;

    const points = records.map(rec => {
      cumulativeTokens += rec.totalTokens;
      cumulativeCost += rec.costUsd;
      return {
        timestamp: rec.timestamp,
        input: rec.inputTokens,
        output: rec.outputTokens,
        cacheRead: rec.cacheReadTokens,
        cacheWrite: rec.cacheWriteTokens,
        totalTokens: rec.totalTokens,
        cost: rec.costUsd,
        cumulativeTokens,
        cumulativeCost,
      };
    });

    return okResponse(reqId, { points });
  } catch (err) {
    log.error({ error: err }, 'Failed to load session timeseries');
    return errorResponse(reqId, 'INTERNAL', 'Failed to load timeseries');
  }
}

// --- Handler 4: sessions.usage.logs ---

export async function handleSessionUsageLogs(
  reqId: string,
  params: { key?: string; limit?: number },
  memory: MemoryStore,
): Promise<ResponseFrame> {
  const key = params?.key;
  if (!key) {
    return errorResponse(reqId, 'BAD_PARAMS', 'key is required');
  }

  const limit = params?.limit ?? 500;

  try {
    const namespace = `chat-history:${key}`;
    const entries = await memory.list(namespace, 'msg:');

    const logs: Array<{
      timestamp: number;
      role: string;
      content: string;
      tokens?: number;
      cost?: number;
    }> = [];

    for (const entry of entries) {
      try {
        const msg = JSON.parse(entry.value) as {
          role: 'user' | 'assistant';
          content: Array<{ type: string; text?: string; thinking?: string; name?: string }>;
          timestamp: number;
        };

        const textParts: string[] = [];
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            textParts.push(block.text);
          }
        }

        if (textParts.length > 0) {
          logs.push({
            timestamp: msg.timestamp,
            role: msg.role,
            content: textParts.join('\n'),
          });
        }
      } catch { /* skip malformed */ }
    }

    logs.sort((a, b) => a.timestamp - b.timestamp);
    const limited = logs.slice(-limit);

    return okResponse(reqId, { logs: limited });
  } catch (err) {
    log.error({ error: err }, 'Failed to load session logs');
    return errorResponse(reqId, 'INTERNAL', 'Failed to load logs');
  }
}
