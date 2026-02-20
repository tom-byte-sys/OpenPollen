import { okResponse, errorResponse, type ResponseFrame } from '../protocol.js';
import type { CronScheduler } from '../../../cron/scheduler.js';

/**
 * cron.status — returns scheduler status overview.
 */
export async function handleCronStatus(
  reqId: string,
  scheduler: CronScheduler,
): Promise<ResponseFrame> {
  try {
    const status = await scheduler.getStatus();
    return okResponse(reqId, status);
  } catch (err) {
    return errorResponse(reqId, 'INTERNAL', err instanceof Error ? err.message : 'Failed to get cron status');
  }
}

/**
 * cron.list — returns all cron jobs.
 */
export async function handleCronList(
  reqId: string,
  params: { includeDisabled?: boolean },
  scheduler: CronScheduler,
): Promise<ResponseFrame> {
  try {
    const jobs = await scheduler.listJobs(params?.includeDisabled ?? false);
    return okResponse(reqId, { jobs });
  } catch (err) {
    return errorResponse(reqId, 'INTERNAL', err instanceof Error ? err.message : 'Failed to list cron jobs');
  }
}

/**
 * cron.add — creates a new cron job.
 */
export async function handleCronAdd(
  reqId: string,
  params: {
    name: string;
    description?: string;
    agentId?: string;
    enabled?: boolean;
    schedule: { kind: string; [key: string]: unknown };
    sessionTarget?: string;
    wakeMode?: string;
    payload: { kind: string; [key: string]: unknown };
    delivery?: { mode: string; [key: string]: unknown };
  },
  scheduler: CronScheduler,
): Promise<ResponseFrame> {
  if (!params?.name) {
    return errorResponse(reqId, 'BAD_PARAMS', 'name is required');
  }
  if (!params.schedule) {
    return errorResponse(reqId, 'BAD_PARAMS', 'schedule is required');
  }
  if (!params.payload) {
    return errorResponse(reqId, 'BAD_PARAMS', 'payload is required');
  }

  try {
    const id = await scheduler.addJob(params as Parameters<CronScheduler['addJob']>[0]);
    return okResponse(reqId, { id });
  } catch (err) {
    return errorResponse(reqId, 'INTERNAL', err instanceof Error ? err.message : 'Failed to add cron job');
  }
}

/**
 * cron.update — patches an existing cron job.
 */
export async function handleCronUpdate(
  reqId: string,
  params: { id: string; patch: Record<string, unknown> },
  scheduler: CronScheduler,
): Promise<ResponseFrame> {
  if (!params?.id) {
    return errorResponse(reqId, 'BAD_PARAMS', 'id is required');
  }

  try {
    await scheduler.updateJob(params.id, params.patch ?? {});
    return okResponse(reqId, {});
  } catch (err) {
    return errorResponse(reqId, 'INTERNAL', err instanceof Error ? err.message : 'Failed to update cron job');
  }
}

/**
 * cron.run — force-runs a cron job immediately.
 */
export async function handleCronRun(
  reqId: string,
  params: { id: string; mode?: string },
  scheduler: CronScheduler,
): Promise<ResponseFrame> {
  if (!params?.id) {
    return errorResponse(reqId, 'BAD_PARAMS', 'id is required');
  }

  try {
    // Fire and forget — don't block the RPC response
    scheduler.runJob(params.id).catch(() => {
      // Error is logged inside runJob -> executeJob
    });
    return okResponse(reqId, {});
  } catch (err) {
    return errorResponse(reqId, 'INTERNAL', err instanceof Error ? err.message : 'Failed to run cron job');
  }
}

/**
 * cron.remove — deletes a cron job and its run history.
 */
export async function handleCronRemove(
  reqId: string,
  params: { id: string },
  scheduler: CronScheduler,
): Promise<ResponseFrame> {
  if (!params?.id) {
    return errorResponse(reqId, 'BAD_PARAMS', 'id is required');
  }

  try {
    await scheduler.removeJob(params.id);
    return okResponse(reqId, {});
  } catch (err) {
    return errorResponse(reqId, 'INTERNAL', err instanceof Error ? err.message : 'Failed to remove cron job');
  }
}

/**
 * cron.runs — returns run history for a cron job.
 */
export async function handleCronRuns(
  reqId: string,
  params: { id: string; limit?: number },
  scheduler: CronScheduler,
): Promise<ResponseFrame> {
  if (!params?.id) {
    return errorResponse(reqId, 'BAD_PARAMS', 'id is required');
  }

  try {
    const entries = await scheduler.getRunLog(params.id, params.limit ?? 50);
    return okResponse(reqId, { entries });
  } catch (err) {
    return errorResponse(reqId, 'INTERNAL', err instanceof Error ? err.message : 'Failed to get cron runs');
  }
}
