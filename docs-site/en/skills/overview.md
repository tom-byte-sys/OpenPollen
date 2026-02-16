# Skills Overview

Skills define the Agent's capabilities. Each skill is a directory containing a `SKILL.md` file with YAML frontmatter for metadata and Markdown body for instructions.

## How It Works

When a user sends a message, HiveAgent's AgentRunner:

1. Scans the installed skills directory for all `SKILL.md` files
2. Injects all skill instructions into the Agent's system prompt
3. Assigns available tools based on each skill's `allowed-tools` field
4. The Agent automatically matches and executes the appropriate skill

## Skill Sources

Skills can be installed from three sources:

| Source | Install Command | Description |
|--------|----------------|-------------|
| Local | `hiveagent skill install ./path` | Copy from local directory |
| Git | `hiveagent skill install <url>.git` | Clone from Git repository |
| Marketplace | `hiveagent skill install <name>` | Download from official marketplace |

## Managing Skills

### List Installed Skills

```bash
hiveagent skill list
```

Example output:

```
已安装技能 (2):

  code-review
    描述: 自动审查代码，给出改进建议
    来源: local
    路径: ~/.hiveagent/skills/code-review

  data-analyst
    描述: 分析数据、生成图表和报告
    来源: local
    路径: ~/.hiveagent/skills/data-analyst
```

### Install Skills

```bash
# Search and install from marketplace
hiveagent skill search coding
hiveagent skill install <skill-name>

# Install from Git
hiveagent skill install https://github.com/user/my-skill.git

# Install from local directory
hiveagent skill install ./my-skill
```

### Create a New Skill

```bash
hiveagent skill create my-skill
```

This creates a scaffold in the skills directory:

```
~/.hiveagent/skills/my-skill/
├── SKILL.md          # Skill definition file
├── examples/         # Examples directory
└── .source.json      # Source information
```

### Uninstall Skills

```bash
hiveagent skill remove my-skill
```

### Update Skills

```bash
# Only supported for Git-sourced skills
hiveagent skill update my-skill
```

## Skills Marketplace

HiveAgent provides an official skills marketplace for searching, installing, and publishing skills.

### Search Skills

```bash
hiveagent skill search <keyword>
hiveagent skill search coding --category coding --sort downloads
```

### Publish Skills

```bash
# Login first
hiveagent login

# Publish
hiveagent skill publish my-skill
```

Pricing options:
- Free
- One-time purchase
- Subscription

### View Earnings

```bash
hiveagent skill earnings
hiveagent skill earnings --month 2026-02
```

## Built-in Skills

HiveAgent ships with these built-in skills:

### code-review

Automatic code review focusing on security, performance, readability, and best practices.

Output uses severity markers:
- **[Critical]** — Must fix
- **[Suggestion]** — Recommended improvement
- **[Optimization]** — Optional optimization

### data-analyst

Data analysis, chart generation, and reporting.
