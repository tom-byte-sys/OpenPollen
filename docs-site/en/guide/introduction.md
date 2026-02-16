# Introduction

HiveAgent is a secure, easy-to-use, China-ready AI Agent platform built on the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents).

## Why HiveAgent?

- **Plug and play**: One command to initialize, auto-configured WebChat interface
- **Unified channels**: Same Agent serves WebChat, DingTalk, WeCom simultaneously
- **Extensible skills**: SKILL.md open standard for defining Agent capabilities
- **China-friendly**: Access Claude models without VPN via AgentTerm proxy
- **Enterprise security**: API Key / JWT auth, tool whitelisting, concurrency control, budget limits

## Core Concepts

### Gateway

The Gateway is HiveAgent's core service, providing HTTP API and message routing. All messages (regardless of channel) are routed through the Gateway to the Agent.

### Channel

Channels bridge users and the Agent. HiveAgent ships with a built-in WebChat channel and supports DingTalk, WeCom via plugins.

### Skill

Skills define the Agent's capabilities. Each skill is a directory containing a `SKILL.md` file with YAML frontmatter for metadata and Markdown body for instructions.

### Plugin

Plugins extend HiveAgent through 4 slot types:
- **channel**: Chat platform adapters (e.g., DingTalk)
- **skill**: Agent skill packages
- **provider**: Model providers
- **memory**: Memory storage backends

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20+ / TypeScript |
| Agent Core | Claude Agent SDK (TS) |
| Channels | WebChat (WebSocket), DingTalk (Stream SDK) |
| Config | JSON5 + TypeBox schema |
| Memory | SQLite (better-sqlite3) + Markdown |
| Logging | pino |
| CLI | commander |
| Testing | vitest |
