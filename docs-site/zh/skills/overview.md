# 技能系统概览

技能（Skill）定义了 Agent 的能力边界。每个技能是一个包含 `SKILL.md` 文件的目录，通过 YAML frontmatter 声明元数据，Markdown 正文提供指令。

## 工作原理

当用户发送消息时，HiveAgent 的 AgentRunner 会：

1. 扫描已安装技能目录，发现所有包含 `SKILL.md` 的技能
2. 将所有技能的指令内容注入到 Agent 的系统提示词中
3. 根据每个技能的 `allowed-tools` 字段分配可用工具
4. Agent 根据用户请求自动匹配并执行对应技能

## 技能来源

技能支持三种安装来源：

| 来源 | 安装方式 | 说明 |
|------|---------|------|
| 本地 | `hiveagent skill install ./path` | 从本地目录复制 |
| Git | `hiveagent skill install <url>.git` | 从 Git 仓库克隆 |
| 市场 | `hiveagent skill install <name>` | 从官方技能市场下载 |

## 管理技能

### 列出已安装技能

```bash
hiveagent skill list
```

输出示例：

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

### 安装技能

```bash
# 从市场搜索并安装
hiveagent skill search coding
hiveagent skill install <skill-name>

# 从 Git 仓库安装
hiveagent skill install https://github.com/user/my-skill.git

# 从本地目录安装
hiveagent skill install ./my-skill
```

### 创建新技能

```bash
hiveagent skill create my-skill
```

这会在技能目录下创建脚手架：

```
~/.hiveagent/skills/my-skill/
├── SKILL.md          # 技能定义文件
├── examples/         # 示例目录
└── .source.json      # 来源信息
```

### 卸载技能

```bash
hiveagent skill remove my-skill
```

### 更新技能

```bash
# 仅支持 Git 来源的技能
hiveagent skill update my-skill
```

## 技能市场

HiveAgent 提供官方技能市场，支持搜索、安装和发布技能。

### 搜索技能

```bash
hiveagent skill search <keyword>
hiveagent skill search coding --category coding --sort downloads
```

### 发布技能

```bash
# 先登录
hiveagent login

# 发布
hiveagent skill publish my-skill
```

发布时可选择定价模式：
- 免费
- 一次性付费
- 订阅制

### 查看收入

```bash
hiveagent skill earnings
hiveagent skill earnings --month 2026-02
```

## 内置技能

HiveAgent 自带以下内置技能：

### code-review

自动审查代码，关注安全性、性能、可读性和最佳实践。

审查输出使用标记分级：
- **[严重]** — 必须修复的问题
- **[建议]** — 推荐改进
- **[优化]** — 可选优化

### data-analyst

分析数据、生成图表和报告。
