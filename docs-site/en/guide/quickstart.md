# Quick Start

This guide helps you quickly launch OpenPollen locally and chat via WebChat.

## Prerequisites

- Node.js 20 or higher
- npm or pnpm
- Claude API Key (or Beelive API Key)

## Installation

```bash
# Clone the repository
git clone https://github.com/anthropics/claude-code.git
cd OpenPollen

# Install dependencies
npm install

# Build
npm run build
```

## Initialize Configuration

Run the interactive init command:

```bash
npx openpollen init
```

The wizard guides you through:

1. **Choose model provider**
   - Beelive cloud proxy (recommended for China)
   - Anthropic API Key
   - Local model (Ollama)

2. **Choose chat platforms**
   - DingTalk Bot (requires Client ID and Secret)
   - WebChat (enabled by default, port 3001)

3. **Install built-in skills**
   - code-review
   - data-analyst

Configuration is saved to `~/.openpollen/openpollen.json`.

## Start the Service

```bash
npx openpollen start
```

On successful start:

```
  OpenPollen v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  Web Chat: http://localhost:3001
```

## Start Chatting

Open `http://localhost:3001` in your browser to chat with the Agent via WebChat.

### Session Commands

| Command | Description |
|---------|-------------|
| `/new` | Reset current session, start fresh |
| `/resume` | List session history |
| `/resume N` | Resume session #N |
| `/market` | View skills marketplace |

## Check Status

```bash
npx openpollen status
```

## Stop the Service

```bash
npx openpollen stop
```

## Next Steps

- [Architecture](/en/guide/architecture) — Learn how OpenPollen works internally
- [Configuration](/en/reference/config) — Full configuration reference
- [Skills Overview](/en/skills/overview) — Install and manage Agent skills
