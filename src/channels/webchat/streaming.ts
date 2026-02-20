import type { WebSocket } from 'ws';
import { eventFrame, type ChatEventPayload, type ChatEventState } from './protocol.js';

/**
 * StreamingController — manages throttled delta/final event delivery
 * for a single chat run over a WebSocket connection.
 *
 * - 150ms throttle to avoid WS message storms
 * - Accumulates full text buffer (each delta sends cumulative text)
 * - Auto-incrementing seq numbers
 */
export class StreamingController {
  private buffer = '';
  private thinkingBuffer = '';
  private seq = 0;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFlush = false;

  constructor(
    private ws: WebSocket,
    private runId: string,
    private sessionKey: string,
    private throttleMs = 150,
  ) {}

  /** Push incremental text from the Agent SDK. */
  pushDelta(chunk: string): void {
    this.buffer += chunk;
    this.scheduleSend();
  }

  /** Push incremental thinking text from the Agent SDK. */
  pushThinkingDelta(chunk: string): void {
    this.thinkingBuffer += chunk;
    this.scheduleSend();
  }

  /** Send final completed message. */
  sendFinal(): void {
    this.flushPending();
    this.send('final');
  }

  /** Send error event. */
  sendError(message: string): void {
    this.flushPending();
    this.seq++;
    const payload: ChatEventPayload = {
      runId: this.runId,
      sessionKey: this.sessionKey,
      seq: this.seq,
      state: 'error',
      errorMessage: message,
    };
    this.safeSend(eventFrame('chat', payload, this.seq));
  }

  /** Send aborted event. */
  sendAborted(): void {
    this.flushPending();
    this.send('aborted');
  }

  /** Get accumulated buffer text. */
  getBuffer(): string {
    return this.buffer;
  }

  /** Get accumulated thinking buffer text. */
  getThinkingBuffer(): string {
    return this.thinkingBuffer;
  }

  /** Clean up any pending timer. */
  destroy(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
  }

  private scheduleSend(): void {
    if (this.throttleTimer) {
      this.pendingFlush = true;
      return;
    }
    this.sendDelta();
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      if (this.pendingFlush) {
        this.pendingFlush = false;
        this.sendDelta();
      }
    }, this.throttleMs);
  }

  private sendDelta(): void {
    this.send('delta');
  }

  private flushPending(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    if (this.pendingFlush) {
      this.pendingFlush = false;
    }
  }

  private send(state: ChatEventState): void {
    this.seq++;
    const content: Array<{ type: 'text'; text: string } | { type: 'thinking'; thinking: string }> = [];
    if (this.thinkingBuffer) {
      content.push({ type: 'thinking', thinking: this.thinkingBuffer });
    }
    content.push({ type: 'text', text: this.buffer });
    const payload: ChatEventPayload = {
      runId: this.runId,
      sessionKey: this.sessionKey,
      seq: this.seq,
      state,
      message: {
        role: 'assistant',
        content,
      },
    };
    this.safeSend(eventFrame('chat', payload, this.seq));
  }

  private safeSend(frame: unknown): void {
    try {
      if (this.ws.readyState === 1 /* OPEN */) {
        this.ws.send(JSON.stringify(frame));
      }
    } catch {
      // Ignore send failures on closed sockets
    }
  }
}
