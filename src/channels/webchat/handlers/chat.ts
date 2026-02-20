import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { okResponse, errorResponse, type ResponseFrame } from '../protocol.js';
import { StreamingController } from '../streaming.js';
import { AbortManager } from '../abort-manager.js';
import { ChatHistoryStore, type StoredMessage } from '../history-store.js';
import type { MessageRouter } from '../../../gateway/router.js';
import type { InboundMessage } from '../../interface.js';
import { getLogger } from '../../../utils/logger.js';

const log = getLogger('webchat:chat');

export interface ChatSendParams {
  sessionKey?: string;
  message: string;
  idempotencyKey?: string;
  thinking?: string;
  timeoutMs?: number;
}

export function handleChatSend(
  reqId: string,
  params: ChatSendParams,
  ws: WebSocket,
  userId: string,
  router: MessageRouter,
  abortManager: AbortManager,
  historyStore: ChatHistoryStore,
): ResponseFrame {
  // Validate params — UI sends message as a plain string
  const userText = typeof params?.message === 'string' ? params.message.trim() : '';
  if (!userText) {
    return errorResponse(reqId, 'BAD_PARAMS', 'message is required');
  }

  const runId = params.idempotencyKey || randomUUID();
  const sessionKey = params.sessionKey || `webchat:dm:${userId}`;

  // Register this run for abort tracking
  abortManager.register(runId, sessionKey);

  // Store user message
  const userMsg: StoredMessage = {
    role: 'user',
    content: [{ type: 'text', text: userText }],
    timestamp: Date.now(),
    runId,
  };
  historyStore.appendMessage(sessionKey, userMsg).catch(err =>
    log.warn({ error: err }, 'Failed to store user message'),
  );

  // Build InboundMessage for the router
  const inbound: InboundMessage = {
    id: runId,
    channelType: 'webchat',
    channelId: sessionKey,
    senderId: userId,
    senderName: userId,
    conversationType: 'dm',
    content: { type: 'text', text: userText },
    timestamp: Date.now(),
  };

  // Create streaming controller
  const stream = new StreamingController(ws, runId, sessionKey);

  // Fire-and-forget: run the agent asynchronously
  (async () => {
    try {
      const onChunk = (chunk: string, type?: 'text' | 'thinking') => {
        if (abortManager.isAborted(runId)) return;
        if (type === 'thinking') {
          stream.pushThinkingDelta(chunk);
        } else {
          stream.pushDelta(chunk);
        }
        abortManager.appendBuffer(runId, stream.getBuffer());
      };

      await router.handleMessage(inbound, onChunk);

      if (abortManager.isAborted(runId)) {
        stream.sendAborted();
      } else {
        stream.sendFinal();

        // Store assistant message
        const assistantContent: StoredMessage['content'] = [];
        const thinkingText = stream.getThinkingBuffer();
        if (thinkingText) {
          assistantContent.push({ type: 'thinking', thinking: thinkingText });
        }
        assistantContent.push({ type: 'text', text: stream.getBuffer() });
        const assistantMsg: StoredMessage = {
          role: 'assistant',
          content: assistantContent,
          timestamp: Date.now(),
          runId,
        };
        await historyStore.appendMessage(sessionKey, assistantMsg);
      }
    } catch (err) {
      log.error({ error: err, runId }, 'Chat run failed');
      stream.sendError(err instanceof Error ? err.message : 'Internal error');
    } finally {
      stream.destroy();
      abortManager.remove(runId);
    }
  })();

  // Return immediately with runId
  return okResponse(reqId, { runId, status: 'started' });
}

export async function handleChatHistory(
  reqId: string,
  params: { sessionKey?: string; limit?: number },
  userId: string,
  historyStore: ChatHistoryStore,
): Promise<ResponseFrame> {
  const sessionKey = params?.sessionKey || `webchat:dm:${userId}`;
  const limit = params?.limit ?? 100;

  try {
    const messages = await historyStore.getHistory(sessionKey, limit);
    return okResponse(reqId, { messages });
  } catch (err) {
    log.error({ error: err }, 'Failed to load chat history');
    return errorResponse(reqId, 'INTERNAL', 'Failed to load history');
  }
}

export function handleChatAbort(
  reqId: string,
  params: { runId?: string; sessionKey?: string },
  abortManager: AbortManager,
): ResponseFrame {
  if (params?.runId) {
    const result = abortManager.abort(params.runId);
    if (!result) {
      return errorResponse(reqId, 'ABORT_FAILED', 'Run not found or already completed');
    }
    return okResponse(reqId, { aborted: true, runIds: [params.runId] });
  }

  if (params?.sessionKey) {
    const runIds = abortManager.abortBySession(params.sessionKey);
    return okResponse(reqId, { aborted: runIds.length > 0, runIds });
  }

  return errorResponse(reqId, 'BAD_PARAMS', 'runId or sessionKey is required');
}
