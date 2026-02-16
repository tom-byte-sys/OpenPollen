# CLI Commands

HiveAgent provides the `hiveagent` CLI tool for managing services, configuration, skills, and channels.

## Global Options

Most subcommands support `-c, --config <path>` to specify the configuration file path.

## hiveagent start

Start the HiveAgent Gateway service.

```bash
hiveagent start [options]
```

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Configuration file path |
| `-d, --daemon` | Run in background |

## hiveagent stop

Stop the running HiveAgent.

```bash
hiveagent stop
```

Sends SIGTERM to the running process, waits up to 5 seconds.

## hiveagent init

Interactive configuration initialization.

```bash
hiveagent init
```

Guides you through:
1. Choose model provider (AgentTerm / Anthropic / Ollama)
2. Configure chat platforms (DingTalk / WebChat)
3. Install built-in skills
4. Generate config file at `~/.hiveagent/hiveagent.json`

## hiveagent status

Check runtime status.

```bash
hiveagent status [-c, --config <path>]
```

## hiveagent login

Login to the HiveAgent marketplace.

```bash
hiveagent login
```

Token is saved to `~/.hiveagent/auth.json`.

## hiveagent logs

View logs.

```bash
hiveagent logs [options]
```

| Option | Description |
|--------|-------------|
| `-l, --level <level>` | Filter by log level (info / warn / error / debug) |
| `-n, --lines <n>` | Show last N lines (default 50) |
| `-f, --follow` | Follow log output |

## hiveagent config show

Display current configuration (secrets are masked).

```bash
hiveagent config show [-c, --config <path>]
```

## hiveagent skill

Skill management commands.

### skill list

List installed skills.

```bash
hiveagent skill list [-c, --config <path>]
```

### skill install

Install a skill from three sources:

```bash
# From marketplace
hiveagent skill install <name>

# From Git repository
hiveagent skill install https://github.com/user/skill-name.git

# From local directory
hiveagent skill install ./my-skill
```

### skill remove

Uninstall a skill.

```bash
hiveagent skill remove <name>
```

### skill create

Create a new skill scaffold.

```bash
hiveagent skill create <name>
```

### skill update

Update a skill (Git sources only).

```bash
hiveagent skill update <name>
```

### skill search

Search the official marketplace.

```bash
hiveagent skill search <keyword> [options]
```

| Option | Description |
|--------|-------------|
| `--category <category>` | Filter by category: coding / writing / data / automation / other |
| `--sort <sort>` | Sort by: downloads / rating / newest (default) |

### skill publish

Publish a skill to the marketplace.

```bash
hiveagent skill publish <name> [-c, --config <path>]
```

Requires `hiveagent login` first. Skills are reviewed before becoming visible.

### skill earnings

View developer skill earnings.

```bash
hiveagent skill earnings [--month <month>]
```

## hiveagent channel

Channel management commands.

### channel list

List configured platforms.

```bash
hiveagent channel list [-c, --config <path>]
```

### channel test

Send a test message to a platform.

```bash
hiveagent channel test <name>
```

Supported platforms: `webchat`, `dingtalk`.
