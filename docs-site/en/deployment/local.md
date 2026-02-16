# Local Development

This guide covers setting up HiveAgent for local development.

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 20 or higher |
| npm | 10 or higher |
| Git | 2.x |

## Get the Source

```bash
git clone https://github.com/anthropics/claude-code.git
cd HiveAgent
```

## Install Dependencies

```bash
npm install
```

## Configuration

Copy the example config:

```bash
cp hiveagent.json.example hiveagent.json
```

Edit `hiveagent.json`, configure at least one model provider:

```json5
{
  "providers": {
    "anthropic": {
      "enabled": true,
      "apiKey": "sk-ant-..."
    }
  }
}
```

Or use environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Development Mode

```bash
npm run dev
```

Uses `tsx watch` to auto-restart on file changes.

## Build

```bash
npm run build
```

Output goes to `dist/` directory.

## Run Tests

```bash
npm run test
```

Uses vitest test runner.

## Type Check

```bash
npm run typecheck
```

## Directory Structure

```
HiveAgent/
├── src/
│   ├── index.ts          # Entry point, assembles all modules
│   ├── config/           # Config loading and schema validation
│   ├── gateway/          # HTTP server and message routing
│   │   ├── server.ts     # HTTP endpoints
│   │   ├── router.ts     # Message routing
│   │   ├── session.ts    # Session management
│   │   └── auth.ts       # Auth service
│   ├── agent/            # Agent runtime
│   │   ├── runner.ts     # Agent execution engine
│   │   ├── skill-manager.ts  # Skill management
│   │   └── marketplace-client.ts  # Marketplace API client
│   ├── channels/         # Channel adapters
│   │   ├── interface.ts  # Channel interface definitions
│   │   └── webchat/      # WebChat implementation
│   ├── plugins/          # Plugin system
│   │   ├── types.ts      # Plugin type definitions
│   │   ├── registry.ts   # Plugin registry
│   │   └── loader.ts     # Plugin loader
│   ├── memory/           # Memory storage
│   └── utils/            # Utilities
├── cli/                  # CLI entry point
│   └── index.ts          # All CLI command definitions
├── plugins/              # External plugins
│   ├── dingtalk/         # DingTalk plugin
│   └── wechat/           # WeCom plugin
├── skills/               # Built-in skills
│   ├── code-review/
│   └── data-analyst/
└── tests/
```

## Data Directory

Runtime data is stored in `~/.hiveagent/`:

```
~/.hiveagent/
├── hiveagent.json        # Configuration file
├── auth.json             # Login credentials
├── hiveagent.pid         # Process PID file
├── memory.db             # SQLite memory database
├── memory/               # Markdown memory files
├── skills/               # Installed skills
└── logs/
    └── hiveagent.log     # Log file
```

## FAQ

### Port already in use

Default ports: Gateway 18800, WebChat 3001. Change `gateway.port` and `channels.webchat.port` in config.

### Model API connection timeout

If you can't access Anthropic API directly from China, configure the AgentTerm proxy:

```json5
{
  "providers": {
    "agentterm": {
      "enabled": true,
      "apiKey": "your-agentterm-key",
      "baseUrl": "https://lite.beebywork.com/api/v1/anthropic-proxy"
    }
  }
}
```

### Viewing Logs

```bash
# View last 50 lines
npx hiveagent logs

# Follow logs
npx hiveagent logs -f

# Errors only
npx hiveagent logs -l error
```
