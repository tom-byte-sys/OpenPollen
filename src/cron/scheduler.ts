import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
import { nextRun } from './cron-expr.js';
import type { MemoryStore } from '../memory/interface.js';
import type { MessageRouter } from '../gateway/router.js';
import type { InboundMessage } from '../channels/interface.js';

const log = getLogger('cron');

const NS_JOBS = 'cron-jobs';
const NS_RUNS_PREFIX = 'cron-runs:';
const CHECK_INTERVAL_MS = 60_000;
const MAX_RUN_LOG_ENTRIES = 100;

// --- Types (mirror the UI types) ---

export type CronSchedule =
  | { kind: 'at'; at: string }
  | { kind: 'every'; everyMs: number; anchorMs?: number }
  | { kind: 'cron'; expr: string; tz?: string };

export type CronSessionTarget = 'main' | 'isolated';
export type CronWakeMode = 'next-heartbeat' | 'now';

export type CronPayload =
  | { kind: 'systemEvent'; text: string }
  | { kind: 'agentTurn'; message: string; thinking?: string; timeoutSeconds?: number };

export type CronDelivery = {
  mode: 'none' | 'announce' | 'webhook';
  channel?: string;
  to?: string;
  bestEffort?: boolean;
};

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
  lastDurationMs?: number;
};

export type CronJob = {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  delivery?: CronDelivery;
  state?: CronJobState;
};

export type CronStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export type CronRunLogEntry = {
  ts: number;
  jobId: string;
  status: 'ok' | 'error' | 'skipped';
  durationMs?: number;
  error?: string;
  summary?: string;
  sessionId?: string;
  sessionKey?: string;
};

/**
 * CronScheduler — manages cron job persistence, scheduling, and execution.
 */
export class CronScheduler {
  private memory: MemoryStore;
  private router: MessageRouter;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(memory: MemoryStore, router: MessageRouter) {
    this.memory = memory;
    this.router = router;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    log.info('Cron scheduler started');

    // Run an initial check soon after startup
    setTimeout(() => {
      if (this.running) this.tick().catch(err => log.error({ error: err }, 'Cron tick error'));
    }, 5_000);

    this.timer = setInterval(() => {
      this.tick().catch(err => log.error({ error: err }, 'Cron tick error'));
    }, CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    log.info('Cron scheduler stopped');
  }

  // --- Public API (called by RPC handlers) ---

  async getStatus(): Promise<CronStatus> {
    const jobs = await this.listJobs(true);
    const enabledJobs = jobs.filter(j => j.enabled);

    let nextWakeAtMs: number | null = null;
    for (const job of enabledJobs) {
      const nextMs = this.computeNextRun(job);
      if (nextMs !== null && (nextWakeAtMs === null || nextMs < nextWakeAtMs)) {
        nextWakeAtMs = nextMs;
      }
    }

    return {
      enabled: this.running,
      jobs: enabledJobs.length,
      nextWakeAtMs,
    };
  }

  async listJobs(includeDisabled = false): Promise<CronJob[]> {
    const entries = await this.memory.list(NS_JOBS);
    const jobs: CronJob[] = [];

    for (const entry of entries) {
      try {
        const job = JSON.parse(entry.value) as CronJob;
        if (includeDisabled || job.enabled) {
          // Recompute nextRunAtMs for display
          if (job.enabled && job.state) {
            const nextMs = this.computeNextRun(job);
            if (nextMs !== null) job.state.nextRunAtMs = nextMs;
          }
          jobs.push(job);
        }
      } catch {
        log.warn({ key: entry.key }, 'Failed to parse cron job entry');
      }
    }

    return jobs.sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async addJob(params: {
    name: string;
    description?: string;
    agentId?: string;
    enabled?: boolean;
    schedule: CronSchedule;
    sessionTarget?: CronSessionTarget;
    wakeMode?: CronWakeMode;
    payload: CronPayload;
    delivery?: CronDelivery;
  }): Promise<string> {
    const id = randomUUID();
    const now = Date.now();

    const job: CronJob = {
      id,
      agentId: params.agentId,
      name: params.name,
      description: params.description,
      enabled: params.enabled ?? true,
      createdAtMs: now,
      updatedAtMs: now,
      schedule: params.schedule,
      sessionTarget: params.sessionTarget ?? 'isolated',
      wakeMode: params.wakeMode ?? 'next-heartbeat',
      payload: params.payload,
      delivery: params.delivery,
      state: {},
    };

    // Compute initial nextRunAtMs
    const nextMs = this.computeNextRun(job);
    if (nextMs !== null && job.state) {
      job.state.nextRunAtMs = nextMs;
    }

    await this.memory.set(NS_JOBS, id, JSON.stringify(job));
    log.info({ jobId: id, name: job.name }, 'Cron job added');
    return id;
  }

  async updateJob(id: string, patch: Partial<Pick<CronJob, 'name' | 'description' | 'enabled' | 'schedule' | 'payload' | 'delivery' | 'sessionTarget' | 'wakeMode'>>): Promise<void> {
    const raw = await this.memory.get(NS_JOBS, id);
    if (!raw) throw new Error(`Cron job not found: ${id}`);

    const job = JSON.parse(raw) as CronJob;
    if (patch.name !== undefined) job.name = patch.name;
    if (patch.description !== undefined) job.description = patch.description;
    if (patch.enabled !== undefined) job.enabled = patch.enabled;
    if (patch.schedule !== undefined) job.schedule = patch.schedule;
    if (patch.payload !== undefined) job.payload = patch.payload;
    if (patch.delivery !== undefined) job.delivery = patch.delivery;
    if (patch.sessionTarget !== undefined) job.sessionTarget = patch.sessionTarget;
    if (patch.wakeMode !== undefined) job.wakeMode = patch.wakeMode;
    job.updatedAtMs = Date.now();

    // Recompute next run
    if (!job.state) job.state = {};
    const nextMs = this.computeNextRun(job);
    job.state.nextRunAtMs = nextMs ?? undefined;

    await this.memory.set(NS_JOBS, id, JSON.stringify(job));
    log.info({ jobId: id, enabled: job.enabled }, 'Cron job updated');
  }

  async removeJob(id: string): Promise<void> {
    await this.memory.delete(NS_JOBS, id);
    await this.memory.clear(`${NS_RUNS_PREFIX}${id}`);
    log.info({ jobId: id }, 'Cron job removed');
  }

  async runJob(id: string): Promise<void> {
    const raw = await this.memory.get(NS_JOBS, id);
    if (!raw) throw new Error(`Cron job not found: ${id}`);

    const job = JSON.parse(raw) as CronJob;
    await this.executeJob(job);
  }

  async getRunLog(id: string, limit = 50): Promise<CronRunLogEntry[]> {
    const ns = `${NS_RUNS_PREFIX}${id}`;
    const entries = await this.memory.list(ns);

    const runs: CronRunLogEntry[] = [];
    for (const entry of entries) {
      try {
        runs.push(JSON.parse(entry.value) as CronRunLogEntry);
      } catch {
        // skip invalid entries
      }
    }

    // Sort newest first, then limit
    return runs.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  // --- Internal scheduling ---

  private async tick(): Promise<void> {
    const now = Date.now();
    const jobs = await this.listJobs(false); // only enabled jobs

    for (const job of jobs) {
      if (this.shouldRun(job, now)) {
        // Fire and forget — don't block the tick loop
        this.executeJob(job).catch(err =>
          log.error({ error: err, jobId: job.id }, 'Cron job execution failed'),
        );
      }
    }
  }

  private shouldRun(job: CronJob, now: number): boolean {
    if (!job.enabled) return false;
    // Skip if currently running
    if (job.state?.runningAtMs) return false;

    const schedule = job.schedule;

    if (schedule.kind === 'at') {
      const atMs = Date.parse(schedule.at);
      if (isNaN(atMs)) return false;
      // Run if we're past the scheduled time and haven't run yet
      return atMs <= now && !job.state?.lastRunAtMs;
    }

    if (schedule.kind === 'every') {
      const anchor = job.state?.lastRunAtMs ?? job.createdAtMs;
      return anchor + schedule.everyMs <= now;
    }

    if (schedule.kind === 'cron') {
      // Check if the next run time is in the past (or within the check window)
      const lastRun = job.state?.lastRunAtMs ?? job.createdAtMs;
      const nextMs = nextRun(schedule.expr, lastRun);
      return nextMs !== null && nextMs <= now;
    }

    return false;
  }

  private async executeJob(job: CronJob): Promise<void> {
    const startMs = Date.now();
    const sessionKey = job.sessionTarget === 'main'
      ? 'webchat:dm:cron'
      : `webchat:dm:cron_${job.id.slice(0, 8)}_${startMs}`;

    log.info({ jobId: job.id, name: job.name, sessionKey }, 'Executing cron job');

    // Mark as running
    if (!job.state) job.state = {};
    job.state.runningAtMs = startMs;
    await this.saveJobState(job);

    let status: 'ok' | 'error' = 'ok';
    let errorMsg: string | undefined;
    let summary: string | undefined;

    try {
      // Build the message text from payload
      let messageText: string;
      if (job.payload.kind === 'systemEvent') {
        messageText = job.payload.text;
      } else {
        messageText = job.payload.message;
      }

      const inbound: InboundMessage = {
        id: randomUUID(),
        channelType: 'webchat',
        channelId: sessionKey,
        senderId: 'cron',
        senderName: `cron:${job.name}`,
        conversationType: 'dm',
        content: { type: 'text', text: messageText },
        timestamp: startMs,
      };

      const response = await this.router.handleMessage(inbound);
      summary = response.slice(0, 200);
    } catch (err) {
      status = 'error';
      errorMsg = err instanceof Error ? err.message : String(err);
      log.error({ error: err, jobId: job.id }, 'Cron job execution error');
    }

    const durationMs = Date.now() - startMs;

    // Update job state
    job.state.runningAtMs = undefined;
    job.state.lastRunAtMs = startMs;
    job.state.lastStatus = status;
    job.state.lastError = errorMsg;
    job.state.lastDurationMs = durationMs;

    // Compute next run
    const nextMs = this.computeNextRun(job);
    job.state.nextRunAtMs = nextMs ?? undefined;

    // Handle one-time 'at' jobs
    if (job.schedule.kind === 'at') {
      if (job.deleteAfterRun) {
        await this.memory.delete(NS_JOBS, job.id);
      } else {
        job.enabled = false;
        job.updatedAtMs = Date.now();
        await this.saveJobState(job);
      }
    } else {
      await this.saveJobState(job);
    }

    // Append run log
    const runEntry: CronRunLogEntry = {
      ts: startMs,
      jobId: job.id,
      status,
      durationMs,
      error: errorMsg,
      summary,
      sessionKey,
    };
    await this.appendRunLog(job.id, runEntry);

    log.info({ jobId: job.id, status, durationMs }, 'Cron job completed');
  }

  private computeNextRun(job: CronJob): number | null {
    if (!job.enabled) return null;
    const now = Date.now();
    const schedule = job.schedule;

    if (schedule.kind === 'at') {
      const atMs = Date.parse(schedule.at);
      if (isNaN(atMs)) return null;
      return atMs > now ? atMs : null;
    }

    if (schedule.kind === 'every') {
      const anchor = job.state?.lastRunAtMs ?? job.createdAtMs;
      const next = anchor + schedule.everyMs;
      return next > now ? next : now;
    }

    if (schedule.kind === 'cron') {
      const afterMs = job.state?.lastRunAtMs ?? now;
      return nextRun(schedule.expr, afterMs);
    }

    return null;
  }

  private async saveJobState(job: CronJob): Promise<void> {
    await this.memory.set(NS_JOBS, job.id, JSON.stringify(job));
  }

  private async appendRunLog(jobId: string, entry: CronRunLogEntry): Promise<void> {
    const ns = `${NS_RUNS_PREFIX}${jobId}`;
    const key = `run:${entry.ts}:${randomUUID().slice(0, 8)}`;
    await this.memory.set(ns, key, JSON.stringify(entry));

    // Trim old entries if too many
    const entries = await this.memory.list(ns);
    if (entries.length > MAX_RUN_LOG_ENTRIES) {
      const sorted = entries.sort((a, b) => a.createdAt - b.createdAt);
      const toDelete = sorted.slice(0, entries.length - MAX_RUN_LOG_ENTRIES);
      for (const e of toDelete) {
        await this.memory.delete(ns, e.key);
      }
    }
  }
}
