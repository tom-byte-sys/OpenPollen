# CLI Commands

OpenPollen provides the `openpollen` CLI tool for managing services, configuration, skills, and channels.

## Global Options

Most subcommands support `-c, --config <path>` to specify the configuration file path.

## openpollen start

Start the OpenPollen Gateway service.

```bash
openpollen start [options]
```

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Configuration file path |
| `-d, --daemon` | Run in background |

## openpollen stop

Stop the running OpenPollen.

```bash
openpollen stop
```

Sends SIGTERM to the running process, waits up to 5 seconds.

## openpollen init

Interactive configuration initialization.

```bash
openpollen init
```

Guides you through:
1. Choose model provider (Beelive / Anthropic / Ollama)
2. Configure chat platforms (DingTalk / WebChat)
3. Install built-in skills
4. Generate config file at `~/.openpollen/openpollen.json`

## openpollen status

Check runtime status.

```bash
openpollen status [-c, --config <path>]
```

## openpollen login

Login to the OpenPollen marketplace.

```bash
openpollen login
```

Token is saved to `~/.openpollen/auth.json`.

## openpollen logs

View logs.

```bash
openpollen logs [options]
```

| Option | Description |
|--------|-------------|
| `-l, --level <level>` | Filter by log level (info / warn / error / debug) |
| `-n, --lines <n>` | Show last N lines (default 50) |
| `-f, --follow` | Follow log output |

## openpollen config show

Display current configuration (secrets are masked).

```bash
openpollen config show [-c, --config <path>]
```

## openpollen skill

Skill management commands.

### skill list

List installed skills.

```bash
openpollen skill list [-c, --config <path>]
```

### skill install

Install a skill from three sources:

```bash
# From marketplace
openpollen skill install <name>

# From Git repository
openpollen skill install https://github.com/user/skill-name.git

# From local directory
openpollen skill install ./my-skill
```

### skill remove

Uninstall a skill.

```bash
openpollen skill remove <name>
```

### skill create

Create a new skill scaffold.

```bash
openpollen skill create <name>
```

### skill update

Update a skill (Git sources only).

```bash
openpollen skill update <name>
```

### skill search

Search the official marketplace.

```bash
openpollen skill search <keyword> [options]
```

| Option | Description |
|--------|-------------|
| `--category <category>` | Filter by category: coding / writing / data / automation / other |
| `--sort <sort>` | Sort by: downloads / rating / newest (default) |

### skill publish

Publish a skill to the marketplace.

```bash
openpollen skill publish <name> [-c, --config <path>]
```

Requires `openpollen login` first. Skills are reviewed before becoming visible.

### skill earnings

View developer skill earnings.

```bash
openpollen skill earnings [--month <month>]
```

## openpollen channel

Channel management commands.

### channel list

List configured platforms.

```bash
openpollen channel list [-c, --config <path>]
```

### channel test

Send a test message to a platform.

```bash
openpollen channel test <name>
```

Supported platforms: `webchat`, `dingtalk`.
