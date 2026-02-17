import type { WebSocket } from 'ws';
import type { RequestFrame, ResponseFrame } from './protocol.js';
import { errorResponse } from './protocol.js';
import { handleHealth, handleStatus, handleConfigGet, handleSkillsStatus } from './handlers/system.js';
import { handleSessionsList, handleSessionsPatch } from './handlers/sessions.js';
import { handleChatSend, handleChatHistory, handleChatAbort, type ChatSendParams } from './handlers/chat.js';
import { AbortManager } from './abort-manager.js';
import { ChatHistoryStore } from './history-store.js';
import type { MessageRouter } from '../../gateway/router.js';
import type { SessionManager } from '../../gateway/session.js';
import type { MemoryStore } from '../../memory/interface.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('webchat:rpc');

export interface DispatcherDeps {
  router: MessageRouter;
  sessionManager: SessionManager;
  memory: MemoryStore;
  abortManager: AbortManager;
  historyStore: ChatHistoryStore;
}

/**
 * RpcDispatcher — routes incoming RPC request frames to the appropriate handler.
 */
export class RpcDispatcher {
  private deps: DispatcherDeps;

  constructor(deps: DispatcherDeps) {
    this.deps = deps;
  }

  async dispatch(frame: RequestFrame, ws: WebSocket, userId: string): Promise<ResponseFrame> {
    const { id, method, params } = frame;
    log.debug({ method, reqId: id }, 'Dispatching RPC');

    switch (method) {
      // --- System ---
      case 'health':
        return handleHealth(id);

      case 'status':
        return handleStatus(id, {
          sessions: this.deps.sessionManager.size,
          memory: 'sqlite',
        });

      case 'config.get':
        return handleConfigGet(id);

      case 'skills.status':
        return handleSkillsStatus(id);

      // --- Chat ---
      case 'chat.send':
        return handleChatSend(
          id,
          params as ChatSendParams,
          ws,
          userId,
          this.deps.router,
          this.deps.abortManager,
          this.deps.historyStore,
        );

      case 'chat.history':
        return handleChatHistory(
          id,
          params as { sessionKey?: string; limit?: number },
          userId,
          this.deps.historyStore,
        );

      case 'chat.abort':
        return handleChatAbort(
          id,
          params as { runId?: string },
          this.deps.abortManager,
        );

      // --- Sessions ---
      case 'sessions.list':
        return handleSessionsList(id, this.deps.sessionManager, this.deps.memory, userId);

      case 'sessions.patch':
        return handleSessionsPatch(id);

      // --- Fallback ---
      default:
        log.warn({ method }, 'Unknown RPC method');
        return errorResponse(id, 'UNAVAILABLE', `Method "${method}" is not implemented`);
    }
  }
}
