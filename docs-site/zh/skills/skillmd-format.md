# SKILL.md 格式规范

SKILL.md 是 OpenPollen 技能的核心定义文件，采用 Agent Skills 开放标准格式。

## 文件结构

每个技能是一个目录，必须包含 `SKILL.md` 文件：

```
my-skill/
├── SKILL.md          # 必需：技能定义
├── examples/         # 可选：示例文件
├── .source.json      # 自动生成：来源信息
└── ...               # 其他资源文件
```

## SKILL.md 格式

文件由两部分组成：YAML frontmatter + Markdown 正文。

### Frontmatter 字段

```yaml
---
name: code-review
description: 自动审查代码，给出改进建议。当用户要求 review 代码时使用。
allowed-tools: Read, Grep, Glob
---
```

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 技能唯一标识（英文、小写、连字符分隔） |
| `description` | 是 | 技能描述（说明功能和触发条件） |
| `allowed-tools` | 否 | 允许使用的工具列表（逗号分隔） |
| `context` | 否 | 附加上下文信息 |
| `disable-model-invocation` | 否 | 是否禁用模型调用（布尔值） |

### Markdown 正文

正文部分是发给 Agent 的指令内容，建议包含以下结构：

```markdown
# 技能名称

描述此技能的核心功能。

## 使用场景

说明什么时候应该使用此技能。

## 执行步骤

1. 步骤一
2. 步骤二
3. ...

## 输出格式

定义输出的结构和格式。
```

## 完整示例

以下是内置 `code-review` 技能的完整定义：

```markdown
---
name: code-review
description: 自动审查代码，给出改进建议。当用户要求 review 代码时使用。
allowed-tools: Read, Grep, Glob
---

# 代码审查

审查用户提供的代码，关注以下方面：

1. **安全性**: 检查 SQL 注入、XSS、敏感信息泄露
2. **性能**: 找出 N+1 查询、不必要的循环、内存泄漏
3. **可读性**: 变量命名、函数职责单一、注释质量
4. **最佳实践**: 符合项目现有的代码风格和约定

## 输出格式

- 严重问题用 **[严重]** 标记
- 建议改进用 **[建议]** 标记
- 可选优化用 **[优化]** 标记

## 审查步骤

1. 先整体阅读代码，理解功能意图
2. 逐函数/逐模块检查
3. 按严重程度排序输出
4. 对每个问题给出具体修改建议
```

## 技能加载流程

1. SkillManager 扫描技能目录中的所有子目录
2. 查找每个子目录下的 `SKILL.md` 文件
3. 解析 YAML frontmatter 提取元数据
4. 验证 `name` 和 `description` 字段存在
5. 读取 `.source.json` 获取安装来源信息
6. 将技能注册到内部映射表

## 技能注入系统提示词

AgentRunner 在每次对话开始时，调用 `SkillManager.buildSkillsPrompt()` 将所有技能内容合并到系统提示词中：

```
## Available Skills

### Skill: code-review
**Description:** 自动审查代码...
**Allowed tools:** Read, Grep, Glob

[SKILL.md 正文内容]
```

## 最佳实践

- **description 要包含触发条件**：例如"当用户要求 review 代码时使用"，帮助 Agent 判断何时使用此技能
- **allowed-tools 精确声明**：只列出技能真正需要的工具，遵循最小权限原则
- **指令清晰具体**：正文中的指令应该明确、可执行
- **定义输出格式**：帮助 Agent 产生结构化、一致的输出
