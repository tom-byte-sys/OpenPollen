# 配置参考

OpenPollen 使用 JSON5 格式的配置文件，支持注释和尾逗号。配置文件位于 `~/.openpollen/openpollen.json`，也可以在项目根目录放置 `openpollen.json`。

环境变量使用 `${VAR_NAME}` 语法在配置文件中引用。

## agent

Agent 运行时配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | string | `claude-sonnet-4-20250514` | 主模型标识 |
| `fallbackModel` | string | — | 备选模型（主模型失败时使用） |
| `maxTurns` | number | `15` | 单次对话最大轮数（1-100） |
| `maxBudgetUsd` | number | `1.0` | 单次对话预算上限（美元） |
| `systemPrompt` | string | — | 自定义系统提示词 |
| `defaultSkills` | string[] | `[]` | 默认加载的技能名称列表 |
| `defaultTools` | string[] | `["Read","Grep","Glob","WebSearch"]` | 默认可用工具列表 |

## gateway

Gateway HTTP 服务配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `host` | string | `127.0.0.1` | 监听地址 |
| `port` | number | `18800` | 监听端口 |

### gateway.auth

认证配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mode` | string | `none` | 认证模式：`api-key` / `jwt` / `none` |
| `backendUrl` | string | — | JWT 验证后端 URL |

### gateway.session

会话管理配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `timeoutMinutes` | number | `30` | 会话超时时间（分钟） |
| `maxConcurrent` | number | `50` | 最大并发会话数 |

## channels

渠道配置。每个渠道是独立的子对象。

### channels.webchat

内置 WebChat 网页聊天。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用 |
| `port` | number | `3001` | WebChat 服务端口 |
| `assistantName` | string | `OpenPollen` | 聊天界面显示的助手名称 |

### channels.dingtalk

钉钉 Bot（通过插件实现）。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `clientId` | string | — | 钉钉应用 Client ID |
| `clientSecret` | string | — | 钉钉应用 Client Secret |
| `robotCode` | string | — | 机器人编码（可选，默认使用 clientId） |
| `groupPolicy` | string | `mention` | 群消息策略：`mention`（需@）/ `all`（所有消息） |

### channels.wechat

企业微信（通过插件实现）。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `corpId` | string | — | 企业 ID |
| `agentId` | string | — | 应用 Agent ID |
| `secret` | string | — | 应用 Secret |
| `token` | string | — | 回调 Token |
| `encodingAESKey` | string | — | 回调加密 Key |
| `callbackPort` | number | `3002` | 回调服务端口 |

## providers

模型提供商配置。支持同时配置多个，第一个 `enabled: true` 的将被使用。

### providers.beelive

Beelive 云端代理（推荐国内用户）。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `apiKey` | string | — | Beelive API Key |
| `baseUrl` | string | `https://lite.beebywork.com/api/v1/anthropic-proxy` | 代理地址 |

### providers.anthropic

Anthropic 官方 API。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `apiKey` | string | — | Anthropic API Key |

### providers.openai

OpenAI 兼容 API。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `apiKey` | string | — | OpenAI API Key |

### providers.ollama

本地 Ollama 模型。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `baseUrl` | string | `http://localhost:11434` | Ollama 服务地址 |
| `model` | string | `qwen3-coder` | 模型名称 |

## skills

技能系统配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `directory` | string | `~/.openpollen/skills` | 技能存储目录 |
| `enabled` | string[] | `[]` | 启用的技能白名单（空 = 全部启用） |

## memory

记忆系统配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `backend` | string | `sqlite` | 存储后端：`sqlite` / `file` |
| `sqlitePath` | string | `~/.openpollen/memory.db` | SQLite 数据库路径 |
| `fileDirectory` | string | `~/.openpollen/memory` | Markdown 文件存储目录 |

## logging

日志配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `level` | string | `info` | 日志级别：`trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `file` | string | — | 日志文件路径（如 `~/.openpollen/logs/openpollen.log`） |

## marketplace

技能市场配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiUrl` | string | `https://lite.beebywork.com/api/v1/skills-market` | 市场 API 地址 |

## 完整示例

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
  "skills": { "directory": "~/.openpollen/skills", "enabled": [] },
  "memory": { "backend": "sqlite", "sqlitePath": "~/.openpollen/memory.db" },
  "logging": { "level": "info", "file": "~/.openpollen/logs/openpollen.log" }
}
```
