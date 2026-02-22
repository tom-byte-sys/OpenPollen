# OpenPollen

> Secure, easy-to-use, and extensible open-source AI Agent framework

[中文](./README.md) | [Documentation](https://tom-byte-sys.github.io/OpenPollen/en/guide/introduction)

OpenPollen is an open-source multi-platform AI Agent framework built on Claude Agent SDK. It supports integration with chat platforms like DingTalk, Feishu (Lark), WeCom, and more. Skills are defined using SKILL.md (Agent Skills open standard) for easy installation, discovery, and execution.

## Features

- **Multi-Platform** — DingTalk, Feishu (Lark), WeCom, Web Chat, all with long-connection support
- **Skill System** — Declarative skills based on SKILL.md, one file per skill
- **Plugin Architecture** — Four-slot plugin system (channel / skill / provider / memory)
- **Multi-Model Support** — Anthropic Claude, OpenAI, local Ollama, seamlessly switchable
- **Memory System** — SQLite + Markdown file dual-mode persistent memory
- **Secure & Controllable** — Tool whitelisting, operation audit, session isolation

## Quick Start

### Install

```bash
npm install -g openpollen
```

### Initialize

```bash
openpollen init
```

The interactive wizard will guide you through:
1. Choosing an AI model source (cloud hosting / your own API key / local Ollama)
2. Selecting a chat platform (DingTalk / Feishu / Web Chat)
3. Installing recommended skills

### Start

```bash
openpollen start
```

## Documentation

Full documentation is available at [OpenPollen Docs](https://tom-byte-sys.github.io/OpenPollen/en/guide/introduction).

- [Quick Start](https://tom-byte-sys.github.io/OpenPollen/en/guide/quickstart)
- [Architecture](https://tom-byte-sys.github.io/OpenPollen/en/guide/architecture)
- [Channels](https://tom-byte-sys.github.io/OpenPollen/en/channels/webchat) — WebChat / DingTalk / Feishu (Lark)
- [Skills](https://tom-byte-sys.github.io/OpenPollen/en/skills/overview)
- [Configuration](https://tom-byte-sys.github.io/OpenPollen/en/reference/config)

Preview docs locally:

```bash
cd docs-site && npx vitepress dev
```

## Skill System

A skill is essentially a `SKILL.md` file, following the [Agent Skills open standard](https://agentskills.io).

```yaml
---
name: code-review
description: Automatically review code and provide improvement suggestions
allowed-tools: Read, Grep, Glob
---

# Code Review

Review the code provided by the user...
```

### Skill Management

```bash
openpollen skill list                    # List installed skills
openpollen skill install code-review     # Install from marketplace
openpollen skill install ./my-skill/     # Install from local directory
openpollen skill remove code-review      # Uninstall a skill
openpollen skill create my-skill         # Create a new skill
```

## Configuration

Configuration file `openpollen.json` (JSON5 format) supports `${ENV_VAR}` environment variable substitution.

See [openpollen.json.example](./openpollen.json.example) for the full list of configuration options.

## Development

```bash
git clone https://github.com/tom-byte-sys/OpenPollen.git
cd OpenPollen
npm install
npm run dev
```

## License

[Apache License 2.0](./LICENSE)
