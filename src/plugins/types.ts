import type { InboundMessage, OutboundMessage } from '../channels/interface.js';

export type PluginSlot = 'channel' | 'skill' | 'provider' | 'memory';

export interface PluginConfigField {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface PluginManifest {
  name: string;
  version: string;
  slot: PluginSlot;
  description: string;
  author?: string;
  config?: Record<string, PluginConfigField>;
}

export interface Plugin {
  manifest: PluginManifest;
  initialize(config: Record<string, unknown>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isHealthy(): boolean;
}

export interface ChannelPlugin extends Plugin {
  readonly name: string;
  readonly type: string;
  sendMessage(message: OutboundMessage): Promise<void>;
  onMessage(handler: (message: InboundMessage, onChunk?: (text: string) => void) => Promise<string | void>): void;
}

export function isChannelPlugin(plugin: Plugin): plugin is ChannelPlugin {
  return plugin.manifest.slot === 'channel'
    && 'sendMessage' in plugin
    && 'onMessage' in plugin;
}

export interface PluginModule {
  default: new () => Plugin;
  manifest?: PluginManifest;
}
