import type { WebSocket } from 'ws';
import type { RequestFrame, ResponseFrame } from './protocol.js';
import { errorResponse, okResponse } from './protocol.js';
import { handleHealth, handleStatus, handleSkillsStatus, handleSkillsUpdate, handleModelsList, handleLastHeartbeat, handleSystemPresence } from './handlers/system.js';
import { handleAgentsList, handleAgentsFilesList, handleAgentIdentityGet, handleChannelsStatus } from './handlers/agents.js';
import { handleCronStatus, handleCronList, handleCronAdd, handleCronUpdate, handleCronRun, handleCronRemove, handleCronRuns } from './handlers/cron.js';
import { handleConfigGetFull, handleConfigSchema, handleConfigSet, handleConfigApply } from './handlers/config.js';
import { handleLogsTail } from './handlers/logs.js';
import { handleSessionsList, handleSessionsPatch, handleSessionsDelete } from './handlers/sessions.js';
import { handleSessionsUsage, handleUsageCost, handleSessionUsageTimeSeries, handleSessionUsageLogs } from './handlers/usage.js';
import { handleChatSend, handleChatHistory, handleChatAbort, type ChatSendParams } from './handlers/chat.js';
import { AbortManager } from './abort-manager.js';
import { ChatHistoryStore } from './history-store.js';
import type { MessageRouter } from '../../gateway/router.js';
import type { SessionManager } from '../../gateway/session.js';
import type { MemoryStore } from '../../memory/interface.js';
import type { AppConfig } from '../../config/schema.js';
import type { SkillManager } from '../../agent/skill-manager.js';
import type { CronScheduler } from '../../cron/scheduler.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('webchat:rpc');

export interface DispatcherDeps {
  router: MessageRouter;
  sessionManager: SessionManager;
  memory: MemoryStore;
  abortManager: AbortManager;
  historyStore: ChatHistoryStore;
  appConfig: AppConfig;
  configFilePath: string | null;
  reloadConfig: () => Promise<void>;
  getLastHeartbeatTs: () => number | null;
  skillManager: SkillManager;
  cronScheduler: CronScheduler;
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

      case 'skills.status':
        return handleSkillsStatus(id, this.deps.skillManager);

      case 'skills.update':
        return handleSkillsUpdate(id, params as { skillKey?: string; enabled?: boolean }, this.deps.skillManager);

      // --- Agents ---
      case 'agents.list':
        return handleAgentsList(id, this.deps.appConfig);

      case 'agent.identity.get':
        return handleAgentIdentityGet(id, params as { agentId?: string }, this.deps.appConfig);

      case 'agents.files.list':
        return handleAgentsFilesList(id);

      case 'channels.status':
        return handleChannelsStatus(id, this.deps.appConfig);

      case 'system-presence':
        return handleSystemPresence(id);

      // --- Cron ---
      case 'cron.status':
        return handleCronStatus(id, this.deps.cronScheduler);

      case 'cron.list':
        return handleCronList(id, params as { includeDisabled?: boolean }, this.deps.cronScheduler);

      case 'cron.add':
        return handleCronAdd(id, params as Parameters<typeof handleCronAdd>[1], this.deps.cronScheduler);

      case 'cron.update':
        return handleCronUpdate(id, params as { id: string; patch: Record<string, unknown> }, this.deps.cronScheduler);

      case 'cron.run':
        return handleCronRun(id, params as { id: string; mode?: string }, this.deps.cronScheduler);

      case 'cron.remove':
        return handleCronRemove(id, params as { id: string }, this.deps.cronScheduler);

      case 'cron.runs':
        return handleCronRuns(id, params as { id: string; limit?: number }, this.deps.cronScheduler);

      // --- Config ---
      case 'config.get':
        return handleConfigGetFull(id, this.deps.configFilePath);

      case 'config.schema':
        return handleConfigSchema(id);

      case 'config.set':
        return handleConfigSet(
          id,
          params as { raw?: string; expectedHash?: string },
          this.deps.configFilePath,
        );

      case 'config.apply':
        return handleConfigApply(
          id,
          params as { raw?: string; expectedHash?: string },
          this.deps.configFilePath,
          this.deps.reloadConfig,
        );

      // --- Update ---
      case 'update.run':
        return okResponse(id, { message: '自动更新功能暂未开放' });

      // --- Debug ---
      case 'models.list':
        return handleModelsList(id, this.deps.appConfig);

      case 'last-heartbeat':
        return handleLastHeartbeat(id, this.deps.getLastHeartbeatTs);

      // --- Logs ---
      case 'logs.tail':
        return handleLogsTail(
          id,
          params as { cursor?: number; limit?: number; maxBytes?: number },
          this.deps.appConfig,
        );

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
        return handleSessionsPatch(id, params as { key?: string; label?: string }, this.deps.memory);

      case 'sessions.delete':
        return handleSessionsDelete(
          id,
          params as { key?: string; deleteTranscript?: boolean },
          this.deps.sessionManager,
          this.deps.memory,
          this.deps.historyStore,
          userId,
        );

      // --- Usage ---
      case 'sessions.usage':
        return handleSessionsUsage(
          id,
          params as { startDate?: string; endDate?: string; limit?: number },
          this.deps.memory,
        );

      case 'usage.cost':
        return handleUsageCost(
          id,
          params as { startDate?: string; endDate?: string },
          this.deps.memory,
        );

      case 'sessions.usage.timeseries':
        return handleSessionUsageTimeSeries(
          id,
          params as { key?: string },
          this.deps.memory,
        );

      case 'sessions.usage.logs':
        return handleSessionUsageLogs(
          id,
          params as { key?: string; limit?: number },
          this.deps.memory,
        );

      // --- Nodes / Devices (stubs) ---
      case 'node.list':
        return okResponse(id, { nodes: [] });

      case 'device.pair.list':
        return okResponse(id, { devices: [] });

      // --- Fallback ---
      default:
        log.warn({ method }, 'Unknown RPC method');
        return errorResponse(id, 'UNAVAILABLE', `Method "${method}" is not implemented`);
    }
  }
}
