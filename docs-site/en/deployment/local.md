# Local Development

This guide covers setting up OpenPollen for local development.

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 20 or higher |
| npm | 10 or higher |
| Git | 2.x |

## Get the Source

```bash
git clone https://github.com/tom-byte-sys/OpenPollen.git
cd OpenPollen
```

## Install Dependencies

```bash
npm install
```

## Configuration

Copy the example config:

```bash
cp openpollen.json.example openpollen.json
```

Edit `openpollen.json`, configure at least one model provider:

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
OpenPollen/
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

Runtime data is stored in `~/.openpollen/`:

```
~/.openpollen/
├── openpollen.json        # Configuration file
├── auth.json             # Login credentials
├── openpollen.pid         # Process PID file
├── memory.db             # SQLite memory database
├── memory/               # Markdown memory files
├── skills/               # Installed skills
└── logs/
    └── openpollen.log     # Log file
```

## FAQ

### Port already in use

Default ports: Gateway 18800, WebChat 3001. Change `gateway.port` and `channels.webchat.port` in config.

### Model API connection timeout

If you can't access Anthropic API directly from China, configure the Beelive proxy:

```json5
{
  "providers": {
    "beelive": {
      "enabled": true,
      "apiKey": "your-beelive-key",
      "baseUrl": "https://api.openpollen.dev/api/v1/anthropic-proxy"
    }
  }
}
```

### Viewing Logs

```bash
# View last 50 lines
npx openpollen logs

# Follow logs
npx openpollen logs -f

# Errors only
npx openpollen logs -l error
```
