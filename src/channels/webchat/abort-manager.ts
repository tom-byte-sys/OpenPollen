/**
 * Abort manager — tracks active runs and supports cooperative cancellation.
 * MVP uses a flag-based approach: the onChunk callback checks isAborted()
 * and skips sending. The Runner still completes but results are discarded.
 */
export class AbortManager {
  private runs = new Map<string, { aborted: boolean; buffer: string; sessionKey: string; controller?: AbortController }>();

  register(runId: string, sessionKey: string, controller?: AbortController): void {
    this.runs.set(runId, { aborted: false, buffer: '', sessionKey, controller });
  }

  isAborted(runId: string): boolean {
    return this.runs.get(runId)?.aborted ?? false;
  }

  /** Accumulate streamed text for partial recovery on abort. */
  appendBuffer(runId: string, text: string): void {
    const entry = this.runs.get(runId);
    if (entry) entry.buffer = text;
  }

  /** Abort a specific run, return accumulated buffer. */
  abort(runId: string): { buffer: string } | null {
    const entry = this.runs.get(runId);
    if (!entry) return null;
    entry.aborted = true;
    entry.controller?.abort();
    return { buffer: entry.buffer };
  }

  /** Abort all runs for a session, return aborted runIds. */
  abortBySession(sessionKey: string): string[] {
    const aborted: string[] = [];
    for (const [runId, entry] of this.runs) {
      if (entry.sessionKey === sessionKey && !entry.aborted) {
        entry.aborted = true;
        entry.controller?.abort();
        aborted.push(runId);
      }
    }
    return aborted;
  }

  /** Clean up a completed/aborted run. */
  remove(runId: string): void {
    this.runs.delete(runId);
  }

  /** Get session key for a run. */
  getSessionKey(runId: string): string | undefined {
    return this.runs.get(runId)?.sessionKey;
  }
}
