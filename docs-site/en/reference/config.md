# Configuration Reference

HiveAgent uses JSON5 format configuration files with support for comments and trailing commas. The config file is located at `~/.hiveagent/hiveagent.json`, or can be placed as `hiveagent.json` in the project root.

Environment variables can be referenced using `${VAR_NAME}` syntax.

## agent

Agent runtime configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | string | `claude-sonnet-4-20250514` | Primary model identifier |
| `fallbackModel` | string | — | Fallback model (used when primary fails) |
| `maxTurns` | number | `15` | Max turns per conversation (1-100) |
| `maxBudgetUsd` | number | `1.0` | Budget limit per conversation (USD) |
| `systemPrompt` | string | — | Custom system prompt |
| `defaultSkills` | string[] | `[]` | Skills to load by default |
| `defaultTools` | string[] | `["Read","Grep","Glob","WebSearch"]` | Default available tools |

## gateway

Gateway HTTP service configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `host` | string | `127.0.0.1` | Listen address |
| `port` | number | `18800` | Listen port |

### gateway.auth

Authentication configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | string | `none` | Auth mode: `api-key` / `jwt` / `none` |
| `backendUrl` | string | — | JWT verification backend URL |

### gateway.session

Session management configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `timeoutMinutes` | number | `30` | Session timeout (minutes) |
| `maxConcurrent` | number | `50` | Max concurrent sessions |

## channels

Channel configuration. Each channel is an independent sub-object.

### channels.webchat

Built-in WebChat web interface.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable WebChat |
| `port` | number | `3001` | WebChat service port |
| `assistantName` | string | `HiveAgent` | Assistant name displayed in UI |

### channels.dingtalk

DingTalk Bot (implemented as plugin).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable DingTalk |
| `clientId` | string | — | DingTalk app Client ID |
| `clientSecret` | string | — | DingTalk app Client Secret |
| `robotCode` | string | — | Robot code (optional, defaults to clientId) |
| `groupPolicy` | string | `mention` | Group message policy: `mention` / `all` |

### channels.wechat

WeCom (implemented as plugin).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable WeCom |
| `corpId` | string | — | Corp ID |
| `agentId` | string | — | App Agent ID |
| `secret` | string | — | App Secret |
| `token` | string | — | Callback Token |
| `encodingAESKey` | string | — | Callback encryption key |
| `callbackPort` | number | `3002` | Callback service port |

## providers

Model provider configuration. Multiple can be configured; the first `enabled: true` provider is used.

### providers.beelive

Beelive cloud proxy (recommended for China users).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable |
| `apiKey` | string | — | Beelive API Key |
| `baseUrl` | string | `https://your-beelive-server.com/api/v1/anthropic-proxy` | Proxy URL |

### providers.anthropic

Anthropic official API.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable |
| `apiKey` | string | — | Anthropic API Key |

### providers.openai

OpenAI-compatible API.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable |
| `apiKey` | string | — | OpenAI API Key |

### providers.ollama

Local Ollama models.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable |
| `baseUrl` | string | `http://localhost:11434` | Ollama service URL |
| `model` | string | `qwen3-coder` | Model name |

## skills

Skills system configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `directory` | string | `~/.hiveagent/skills` | Skills storage directory |
| `enabled` | string[] | `[]` | Enabled skills whitelist (empty = all enabled) |

## memory

Memory system configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `backend` | string | `sqlite` | Storage backend: `sqlite` / `file` |
| `sqlitePath` | string | `~/.hiveagent/memory.db` | SQLite database path |
| `fileDirectory` | string | `~/.hiveagent/memory` | Markdown file storage directory |

## logging

Logging configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `level` | string | `info` | Log level: `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `file` | string | — | Log file path |

## marketplace

Skills marketplace configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiUrl` | string | `https://your-beelive-server.com/api/v1/skills-market` | Marketplace API URL |

## Full Example

```json5
{
  "agent": {
    "model": "claude-sonnet-4-20250514",
    "fallbackModel": "claude-haiku-4-20250514",
    "maxTurns": 15,
    "maxBudgetUsd": 1.0,
    "systemPrompt": "You are a helpful AI assistant.",
    "defaultSkills": [],
    "defaultTools": ["Read", "Grep", "Glob", "WebSearch"]
  },
  "gateway": {
    "host": "127.0.0.1",
    "port": 18800,
    "auth": { "mode": "none" },
    "session": { "timeoutMinutes": 30, "maxConcurrent": 50 }
  },
  "channels": {
    "webchat": { "enabled": true, "port": 3001 },
    "dingtalk": {
      "enabled": false,
      "clientId": "${DINGTALK_CLIENT_ID}",
      "clientSecret": "${DINGTALK_CLIENT_SECRET}"
    }
  },
  "providers": {
    "anthropic": {
      "enabled": true,
      "apiKey": "${ANTHROPIC_API_KEY}"
    }
  },
  "skills": { "directory": "~/.hiveagent/skills", "enabled": [] },
  "memory": { "backend": "sqlite", "sqlitePath": "~/.hiveagent/memory.db" },
  "logging": { "level": "info", "file": "~/.hiveagent/logs/hiveagent.log" }
}
```
