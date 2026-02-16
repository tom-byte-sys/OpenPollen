# SKILL.md Format

SKILL.md is the core definition file for HiveAgent skills, following the Agent Skills open standard format.

## File Structure

Each skill is a directory that must contain a `SKILL.md` file:

```
my-skill/
├── SKILL.md          # Required: Skill definition
├── examples/         # Optional: Example files
├── .source.json      # Auto-generated: Source information
└── ...               # Other resource files
```

## SKILL.md Format

The file consists of two parts: YAML frontmatter + Markdown body.

### Frontmatter Fields

```yaml
---
name: code-review
description: Automatic code review with improvement suggestions. Used when user requests code review.
allowed-tools: Read, Grep, Glob
---
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique skill identifier (lowercase, hyphen-separated) |
| `description` | Yes | Skill description (include trigger conditions) |
| `allowed-tools` | No | Allowed tools list (comma-separated) |
| `context` | No | Additional context information |
| `disable-model-invocation` | No | Disable model invocation (boolean) |

### Markdown Body

The body contains instructions for the Agent:

```markdown
# Skill Name

Describe the core functionality.

## Use Cases

When to use this skill.

## Steps

1. Step one
2. Step two

## Output Format

Define output structure and format.
```

## Full Example

The built-in `code-review` skill:

```markdown
---
name: code-review
description: Automatic code review with improvement suggestions. Used when user requests code review.
allowed-tools: Read, Grep, Glob
---

# Code Review

Review user-provided code focusing on:

1. **Security**: SQL injection, XSS, credential leaks
2. **Performance**: N+1 queries, unnecessary loops, memory leaks
3. **Readability**: Naming, single responsibility, comment quality
4. **Best Practices**: Adherence to project code style

## Output Format

- Critical issues marked with **[Critical]**
- Suggestions marked with **[Suggestion]**
- Optimizations marked with **[Optimization]**

## Review Steps

1. Read code holistically to understand intent
2. Check function by function / module by module
3. Sort output by severity
4. Provide specific fix suggestions for each issue
```

## Skill Loading Process

1. SkillManager scans all subdirectories in the skills directory
2. Looks for `SKILL.md` in each subdirectory
3. Parses YAML frontmatter for metadata
4. Validates `name` and `description` fields exist
5. Reads `.source.json` for installation source info
6. Registers the skill in the internal map

## System Prompt Injection

AgentRunner calls `SkillManager.buildSkillsPrompt()` at the start of each conversation to merge all skill content into the system prompt:

```
## Available Skills

### Skill: code-review
**Description:** Automatic code review...
**Allowed tools:** Read, Grep, Glob

[SKILL.md body content]
```

## Best Practices

- **Include trigger conditions in description**: e.g., "Used when user requests code review" helps the Agent decide when to use the skill
- **Declare allowed-tools precisely**: Only list tools the skill actually needs (principle of least privilege)
- **Clear, specific instructions**: Body instructions should be actionable
- **Define output format**: Helps the Agent produce structured, consistent output
