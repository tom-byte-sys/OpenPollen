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
 * channels.status — returns channel status based on actual configuration.
 */
export function handleChannelsStatus(reqId: string, appConfig: AppConfig): ResponseFrame {
  const channels: Record<string, { configured: boolean; running: boolean; connected: boolean }> = {};
  const channelOrder: string[] = [];

  const channelsConfig = appConfig.channels;

  if (channelsConfig.webchat?.enabled) {
    channels.webchat = { configured: true, running: true, connected: true };
    channelOrder.push('webchat');
  }

  if (channelsConfig.dingtalk?.enabled) {
    channels.dingtalk = { configured: true, running: true, connected: true };
    channelOrder.push('dingtalk');
  }

  if (channelsConfig.wechat?.enabled) {
    channels.wechat = { configured: true, running: true, connected: true };
    channelOrder.push('wechat');
  }

  return okResponse(reqId, {
    channels,
    channelOrder,
    channelLabels: {
      webchat: 'WebChat',
      dingtalk: 'DingTalk',
      wechat: 'WeChat',
    },
    channelAccounts: {},
    channelDefaultAccountId: {},
    ts: Date.now(),
  });
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
