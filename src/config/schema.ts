import { Type, type Static } from '@sinclair/typebox';

export const AgentConfigSchema = Type.Object({
  model: Type.String({ default: 'claude-sonnet-4-20250514' }),
  fallbackModel: Type.Optional(Type.String()),
  maxTurns: Type.Number({ default: 15, minimum: 1, maximum: 100 }),
  maxBudgetUsd: Type.Number({ default: 1.0, minimum: 0 }),
  systemPrompt: Type.Optional(Type.String()),
});

export const AuthConfigSchema = Type.Object({
  mode: Type.Union([
    Type.Literal('api-key'),
    Type.Literal('jwt'),
    Type.Literal('none'),
  ], { default: 'none' }),
  backendUrl: Type.Optional(Type.String()),
});

export const SessionConfigSchema = Type.Object({
  timeoutMinutes: Type.Number({ default: 30, minimum: 1 }),
  maxConcurrent: Type.Number({ default: 50, minimum: 1 }),
});

export const GatewayConfigSchema = Type.Object({
  host: Type.String({ default: '127.0.0.1' }),
  port: Type.Number({ default: 18800 }),
  auth: AuthConfigSchema,
  session: SessionConfigSchema,
});

export const DingtalkChannelSchema = Type.Object({
  enabled: Type.Boolean({ default: false }),
  clientId: Type.String(),
  clientSecret: Type.String(),
  robotCode: Type.Optional(Type.String()),
  groupPolicy: Type.Union([
    Type.Literal('mention'),
    Type.Literal('all'),
  ], { default: 'mention' }),
});

export const WebchatChannelSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  port: Type.Number({ default: 3001 }),
  assistantName: Type.Optional(Type.String({ default: 'OpenPollen' })),
});

export const WechatChannelSchema = Type.Object({
  enabled: Type.Boolean({ default: false }),
  corpId: Type.String(),
  agentId: Type.String(),
  secret: Type.String(),
  token: Type.String(),
  encodingAESKey: Type.String(),
  callbackPort: Type.Number({ default: 3002 }),
});

export const FeishuChannelSchema = Type.Object({
  enabled: Type.Boolean({ default: false }),
  appId: Type.String(),
  appSecret: Type.String(),
  groupPolicy: Type.Union([
    Type.Literal('mention'),
    Type.Literal('all'),
  ], { default: 'mention' }),
});

export const QQChannelSchema = Type.Object({
  enabled: Type.Boolean({ default: false }),
  appId: Type.String(),
  appSecret: Type.String(),
  sandbox: Type.Boolean({ default: false }),
  groupPolicy: Type.Union([
    Type.Literal('mention'),
    Type.Literal('all'),
  ], { default: 'mention' }),
});

export const ChannelsConfigSchema = Type.Object({
  dingtalk: Type.Optional(DingtalkChannelSchema),
  webchat: Type.Optional(WebchatChannelSchema),
  wechat: Type.Optional(WechatChannelSchema),
  feishu: Type.Optional(FeishuChannelSchema),
  qq: Type.Optional(QQChannelSchema),
});

export const ProviderSchema = Type.Object({
  enabled: Type.Boolean({ default: false }),
  apiKey: Type.Optional(Type.String()),
  baseUrl: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
});

export const ProvidersConfigSchema = Type.Object({
  beelive: Type.Optional(ProviderSchema),
  anthropic: Type.Optional(ProviderSchema),
  openai: Type.Optional(ProviderSchema),
  ollama: Type.Optional(ProviderSchema),
});

export const SkillsConfigSchema = Type.Object({
  directory: Type.String({ default: '~/.openpollen/skills' }),
});

export const MemoryConfigSchema = Type.Object({
  backend: Type.Union([
    Type.Literal('sqlite'),
    Type.Literal('file'),
  ], { default: 'sqlite' }),
  sqlitePath: Type.String({ default: '~/.openpollen/memory.db' }),
  fileDirectory: Type.String({ default: '~/.openpollen/memory' }),
});

export const LoggingConfigSchema = Type.Object({
  level: Type.Union([
    Type.Literal('trace'),
    Type.Literal('debug'),
    Type.Literal('info'),
    Type.Literal('warn'),
    Type.Literal('error'),
    Type.Literal('fatal'),
  ], { default: 'info' }),
  file: Type.Optional(Type.String()),
});

export const MarketplaceConfigSchema = Type.Object({
  apiUrl: Type.String({ default: process.env.BEELIVE_MARKETPLACE_URL || 'https://lite.beebywork.com/api/v1/skills-market' }),
});

export const AppConfigSchema = Type.Object({
  agent: AgentConfigSchema,
  gateway: GatewayConfigSchema,
  channels: ChannelsConfigSchema,
  providers: ProvidersConfigSchema,
  skills: SkillsConfigSchema,
  memory: MemoryConfigSchema,
  logging: LoggingConfigSchema,
});

export type AgentConfig = Static<typeof AgentConfigSchema>;
export type GatewayConfig = Static<typeof GatewayConfigSchema>;
export type ChannelsConfig = Static<typeof ChannelsConfigSchema>;
export type ProvidersConfig = Static<typeof ProvidersConfigSchema>;
export type SkillsConfig = Static<typeof SkillsConfigSchema>;
export type MemoryConfig = Static<typeof MemoryConfigSchema>;
export type LoggingConfig = Static<typeof LoggingConfigSchema>;
export type AppConfig = Static<typeof AppConfigSchema>;
