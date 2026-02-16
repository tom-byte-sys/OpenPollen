# Architecture

HiveAgent uses a layered architecture that decouples message ingestion, routing, Agent execution, and storage.

## Architecture Diagram

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   WebChat   │  │   DingTalk  │  │    WeCom    │
│  (built-in) │  │  (plugin)   │  │  (plugin)   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                ┌───────▼───────┐
                │    Gateway    │
                │  HTTP Server  │
                │  /health      │
                │  /api/status  │
                │  /api/chat    │
                └───────┬───────┘
                        │
                ┌───────▼───────┐
                │ MessageRouter │
                │  Session mgmt │
                │  Concurrency  │
                │  Commands     │
                └───────┬───────┘
                        │
              ┌─────────▼─────────┐
              │   SessionManager  │
              │  Lifecycle mgmt   │
              │  Timeout GC       │
              └─────────┬─────────┘
                        │
                ┌───────▼───────┐
                │  AgentRunner  │
                │  Claude SDK   │
                │  Skill inject │
                │  Tool assign  │
                └───────┬───────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
   ┌──────▼──────┐ ┌───▼────┐ ┌─────▼─────┐
   │ SkillManager│ │ Memory │ │  Plugins  │
   │ Discovery   │ │ SQLite │ │ Registry  │
   └─────────────┘ │  File  │ │ Lifecycle │
                   └────────┘ └───────────┘
```

## Message Flow

1. **Ingestion**: User messages arrive from channels (WebChat / DingTalk / HTTP API)
2. **Routing**: MessageRouter finds or creates a Session by channel type and user ID
3. **Concurrency**: Only one message per session is processed at a time
4. **Execution**: AgentRunner invokes Claude Agent SDK with injected skills and tools
5. **Streaming**: Agent replies are streamed as chunks in real-time (WebChat)
6. **Memory**: Conversation summaries are stored per user namespace for cross-session context

## Core Modules

### Gateway Server

HTTP server providing REST API endpoints:

- `GET /health` — Health check
- `GET /api/status` — Runtime status (active sessions, processing count, uptime)
- `POST /api/chat` — Send message (supports API Key / JWT auth)

### MessageRouter

Core message routing, responsible for:
- Session lookup and creation
- Request deduplication and concurrency control
- Built-in command parsing (`/new`, `/resume`, `/market`)
- Conversation summary storage

### SessionManager

Manages all active session lifecycles:
- Sessions identified by channelType + userId + conversationType
- Automatic timeout GC (default 30 minutes)
- Maximum concurrent session limit (default 50)

### AgentRunner

Agent execution engine:
- Integrates Claude Agent SDK
- Injects installed skill SKILL.md content into system prompts
- Assigns available tools per configuration
- Supports multi-model switching and budget control

### PluginRegistry

Plugin registration center:
- Auto-scans `plugins/` directory for plugins
- Manages plugin initialize, start, stop lifecycle
- Supports 4 slots: channel / skill / provider / memory
