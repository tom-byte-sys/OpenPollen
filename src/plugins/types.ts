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

export interface PluginModule {
  default: new () => Plugin;
  manifest?: PluginManifest;
}
