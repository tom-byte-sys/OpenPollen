import type { ResponseFrame } from '../protocol.js';
import { okResponse } from '../protocol.js';
import type { AppConfig } from '../../../config/schema.js';

/**
 * agents.list — returns the list of agents.
 * Currently single-agent; uses fixed ID "default".
 */
export function handleAgentsList(reqId: string, appConfig: AppConfig): ResponseFrame {
  const name = appConfig.channels.webchat?.assistantName ?? 'OpenPollen';

  return okResponse(reqId, {
    defaultId: 'default',
    mainKey: 'default',
    scope: 'openpollen',
    agents: [
      {
        id: 'default',
        name,
        identity: {
          name,
          emoji: '\u{1F916}',
        },
      },
    ],
  });
}

/**
 * agents.files.list — stub returning empty file list.
 * Placeholder for future workspace file management.
 */
export function handleAgentsFilesList(reqId: string): ResponseFrame {
  return okResponse(reqId, { files: [] });
}

/**
 * channels.status — stub returning empty channel list.
 * Placeholder for future channel status reporting.
 */
export function handleChannelsStatus(reqId: string): ResponseFrame {
  return okResponse(reqId, { channels: [] });
}

/**
 * cron.list — stub returning empty cron job list.
 * Placeholder for future scheduled task management.
 */
export function handleCronList(reqId: string): ResponseFrame {
  return okResponse(reqId, { jobs: [] });
}

/**
 * agent.identity.get — returns identity info for a single agent.
 */
export function handleAgentIdentityGet(
  reqId: string,
  params: { agentId?: string },
  appConfig: AppConfig,
): ResponseFrame {
  const name = appConfig.channels.webchat?.assistantName ?? 'OpenPollen';

  return okResponse(reqId, {
    agentId: params.agentId ?? 'default',
    name,
    avatar: null,
    emoji: '\u{1F916}',
  });
}
