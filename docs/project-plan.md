# AgentHub 项目实施计划

## Context

AgentHub 是一个全新的开源多平台 AI Agent 项目，独立于现有的 Beelive Lite SaaS (AgentTerm)。灵感来源于 OpenClaw 的插件架构和多平台能力，但基于 Claude Agent SDK 构建，解决 OpenClaw 的易用性和安全性问题。目标是成为"安全、易用、国产化的 AI Agent 平台"，通过开源吸引开发者生态，通过技能市场实现商业化。

**技术决策：**
- Gateway：TypeScript (Node.js)
- Agent 运行时：Claude Agent SDK (TS)
- 首个聊天平台：钉钉 (Stream SDK，无需公网 IP)
- 技能市场 API：扩展现有 FastAPI 后端
- 记忆系统：内嵌 SQLite + CLAUDE.md 风格文件
- 开源许可：Apache 2.0

---

## 分阶段实施

### Phase 1 — MVP（钉钉 + 基础 Agent）

**目标：** 一个能用的钉钉 Bot，接收消息 → 路由到 Claude Agent SDK → 返回响应

### Phase 2 — 技能系统

**目标：** 技能作为 SKILL.md 文件可安装、发现、执行（遵循 Anthropic Agent Skills 开放标准）

### Phase 3 — 技能市场 + 开源发布

**目标：** 与 FastAPI 后端集成的技能市场，完成开源准备

---

## Phase 1 详细实施计划

### 项目结构

```
/home/tony/AgentHub/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .gitignore
├── .env.example
├── README.md                    # 中文 README
├── LICENSE                      # Apache 2.0
├── CLAUDE.md                    # 项目上下文
├── agenthub.json.example       # 配置示例
├── src/
│   ├── index.ts                 # 入口：加载配置→启动 Gateway→注册 Channel
│   ├── config/
│   │   ├── schema.ts            # TypeBox 配置 schema 定义
│   │   └── loader.ts            # JSON5 解析 + 环境变量替换 + schema 校验
│   ├── gateway/
│   │   ├── server.ts            # WebSocket + HTTP 服务 (默认端口 18800)
│   │   ├── router.ts            # 消息路由：Channel → Session → Agent
│   │   ├── session.ts           # 会话管理：创建/超时/GC/隔离
│   │   └── auth.ts              # HTTP 客户端调用 FastAPI 验证 API Key/JWT
│   ├── agent/
│   │   ├── runner.ts            # Claude Agent SDK query() 封装 + 会话恢复
│   │   ├── skill-manager.ts     # 管理 SKILL.md 文件：安装/卸载/发现
│   │   └── permissions.ts       # 白名单 canUseTool + 操作审计日志
│   ├── channels/
│   │   ├── interface.ts         # ChannelAdapter / InboundMessage / OutboundMessage 接口
│   │   ├── dingtalk/
│   │   │   └── index.ts         # 钉钉 Stream SDK 适配器
│   │   └── webchat/
│   │       └── index.ts         # WebSocket 网页聊天（本地测试用）
│   ├── plugins/
│   │   ├── types.ts             # PluginSlot / PluginManifest / 4 种插件类型定义
│   │   ├── registry.ts          # 插件注册中心：注册/注销/生命周期管理
│   │   └── loader.ts            # 插件发现：扫描目录 → 动态 import → 校验
│   ├── memory/
│   │   ├── interface.ts         # MemoryStore 接口
│   │   ├── sqlite-store.ts      # better-sqlite3 实现，TTL 过期清理
│   │   └── file-store.ts        # Markdown 文件记忆 (CLAUDE.md 风格)
│   └── utils/
│       ├── logger.ts            # pino 结构化日志
│       └── crypto.ts            # UUID / SHA256 / 加密工具
├── cli/
│   └── index.ts                 # agenthub CLI (commander)
├── plugins/                     # 内置插件目录
│   └── .gitkeep
├── skills/                      # 内置技能目录 (Agent Skills 开放标准)
│   ├── code-review/             # 示例技能
│   │   ├── SKILL.md             # 技能定义 (YAML frontmatter + Markdown 指令)
│   │   └── examples/            # 可选辅助文件
│   └── data-analyst/            # 示例技能
│       ├── SKILL.md
│       └── scripts/
│           └── visualize.py     # 可选脚本
└── tests/
    ├── unit/
    │   ├── config.test.ts
    │   ├── permissions.test.ts
    │   └── session.test.ts
    └── integration/
        ├── dingtalk-adapter.test.ts
        └── agent-runner.test.ts
```

### 核心接口定义

**ChannelAdapter（聊天平台适配器）— `src/channels/interface.ts`**

```typescript
export interface InboundMessage {
  id: string;
  channelType: string;         // "dingtalk" | "webchat" | "telegram" ...
  channelId: string;
  senderId: string;
  senderName: string;
  conversationType: 'dm' | 'group';
  groupId?: string;
  content: MessageContent;
  timestamp: number;
  raw?: unknown;
}

export interface MessageContent {
  type: 'text' | 'image' | 'audio' | 'file' | 'rich';
  text?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
}

export interface OutboundMessage {
  conversationType: 'dm' | 'group';
  targetId: string;
  content: MessageContent;
  replyToMessageId?: string;
}

export interface ChannelAdapter {
  readonly name: string;
  readonly type: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: OutboundMessage): Promise<void>;
  onMessage(handler: (message: InboundMessage) => Promise<void>): void;
  isHealthy(): boolean;
}
```

**PluginSlot（四槽位插件系统）— `src/plugins/types.ts`**

```typescript
export type PluginSlot = 'channel' | 'skill' | 'provider' | 'memory';

export interface PluginManifest {
  name: string;
  version: string;
  slot: PluginSlot;
  description: string;
  author?: string;
  config?: Record<string, PluginConfigField>;
}

export interface PluginRegistry {
  register(slot: PluginSlot, name: string, plugin: Plugin): void;
  unregister(slot: PluginSlot, name: string): void;
  get<T>(slot: PluginSlot, name: string): T | undefined;
  list(slot: PluginSlot): Plugin[];
  startAll(): Promise<void>;
  stopAll(): Promise<void>;
}
```

**MemoryStore（记忆接口）— `src/memory/interface.ts`**

```typescript
export interface MemoryEntry {
  key: string;
  value: string;
  namespace: string;       // 'user' | 'session' | 'global'
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface MemoryStore {
  get(namespace: string, key: string): Promise<string | null>;
  set(namespace: string, key: string, value: string, ttl?: number): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  list(namespace: string, prefix?: string): Promise<MemoryEntry[]>;
  clear(namespace: string): Promise<void>;
}
```

### 技能系统设计理念

**关键决策：采用 SKILL.md（Agent Skills 开放标准），而非 MCP Server**

原因：
1. **Anthropic 官方趋势**：Claude 的 Skills 系统已成为开放标准 (agentskills.io)，跨工具可移植
2. **OpenClaw 的极简理念**：OpenClaw 刻意避开 MCP，用 bash/CLI 脚本替代，因为 MCP 存在复杂性和可靠性问题
3. **Skills 和 MCP 是互补的**：Skills = 教 Claude 怎么做（菜谱），MCP = 给 Claude 连接外部工具（厨房设备）
4. **更简单**：一个 SKILL.md 文件就是一个技能，比写 MCP Server 简单 10 倍

**技能的本质就是一个 SKILL.md 文件：**

```yaml
---
name: code-review
description: 自动审查代码，给出改进建议。当用户要求 review 代码时使用。
allowed-tools: Read, Grep, Glob, Bash(git diff *)
---

# 代码审查

审查用户提供的代码，关注以下方面：

1. **安全性**: 检查 SQL 注入、XSS、敏感信息泄露
2. **性能**: 找出 N+1 查询、不必要的循环、内存泄漏
3. **可读性**: 变量命名、函数职责单一、注释质量
4. **最佳实践**: 符合项目现有的代码风格和约定

## 输出格式
- 严重问题用 🔴 标记
- 建议改进用 🟡 标记
- 可选优化用 🟢 标记
```

**技能可以包含辅助文件和脚本：**
```
skills/code-review/
├── SKILL.md              # 主文件（必须）
├── examples/
│   └── sample-review.md  # 示例输出
└── scripts/
    └── lint-check.sh     # Claude 可以执行的脚本
```

**高级技能支持：**
- `context: fork` — 在隔离的子 Agent 中运行
- `$ARGUMENTS` — 接受用户参数
- `!`command`` — 动态注入 shell 命令输出
- `disable-model-invocation: true` — 仅手动触发

### Agent Runner 核心逻辑 — `src/agent/runner.ts`

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

async function runAgent(session: Session, userMessage: string): Promise<string> {
  // 确保用户的技能目录存在
  const skillsDir = getSkillsDir(session.userId);

  const result = query({
    prompt: userMessage,
    options: {
      // 关键：通过 settingSources 让 SDK 自动发现 SKILL.md 文件
      settingSources: ['user', 'project'],
      // 关键：启用 Skill 工具，让 Claude 自动调用相关技能
      allowedTools: ['Skill', ...config.agent.defaultTools],
      // 工作目录指向用户的技能目录
      cwd: skillsDir,
      model: session.model || config.agent.model,
      canUseTool: createPermissionHandler(session),
      resume: session.sdkSessionId,
      maxTurns: config.agent.maxTurns || 10,
      maxBudgetUsd: config.agent.maxBudgetUsd || 1.0,
    }
  });

  let responseText = '';
  for await (const message of result) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') responseText += block.text;
      }
    }
    if (message.type === 'result') {
      session.sdkSessionId = message.session_id;
      session.totalCostUsd += message.total_cost_usd;
    }
  }
  return responseText;
}
```

### 配置格式 — `agenthub.json` (JSON5)

```json5
{
  "agent": {
    "model": "claude-sonnet-4-20250514",
    "fallbackModel": "claude-haiku-4-20250514",
    "maxTurns": 15,
    "maxBudgetUsd": 1.0,
    "systemPrompt": "You are a helpful AI assistant.",
    "defaultSkills": [],
    "defaultTools": ["Read", "Grep", "Glob", "WebSearch"],
  },
  "gateway": {
    "host": "127.0.0.1",
    "port": 18800,
    "auth": {
      "mode": "api-key",      // "api-key" | "jwt" | "none"
      "backendUrl": "https://lite.beebywork.com/api/v1",
    },
    "session": {
      "timeoutMinutes": 30,
      "maxConcurrent": 50,
    },
  },
  "channels": {
    "dingtalk": {
      "enabled": true,
      "clientId": "${DINGTALK_CLIENT_ID}",
      "clientSecret": "${DINGTALK_CLIENT_SECRET}",
      "robotCode": "${DINGTALK_ROBOT_CODE}",
      "groupPolicy": "mention",  // 群里需要 @机器人
    },
    "webchat": {
      "enabled": true,
      "port": 3001,
    },
  },
  // 模型接入：三种模式
  "providers": {
    // 模式 1: AgentTerm 云端托管（推荐，复用现有订阅体系）
    "agentterm": {
      "enabled": true,
      "apiKey": "${AGENTTERM_API_KEY}",       // bba-v1p-xxx
      "baseUrl": "https://lite.beebywork.com/api/v1/anthropic-proxy",
    },
    // 模式 2: 自有 API Key
    "anthropic": {
      "enabled": false,
      "apiKey": "${ANTHROPIC_API_KEY}",
    },
    "openai": {
      "enabled": false,
      "apiKey": "${OPENAI_API_KEY}",
    },
    // 模式 3: 本地模型
    "ollama": {
      "enabled": false,
      "baseUrl": "http://localhost:11434",
      "model": "qwen3-coder",
    },
  },
  "skills": {
    "directory": "~/.agenthub/skills",
    "enabled": [],
  },
  "memory": {
    "backend": "sqlite",
    "sqlitePath": "~/.agenthub/memory.db",
    "fileDirectory": "~/.agenthub/memory",
  },
  "logging": {
    "level": "info",
    "file": "~/.agenthub/logs/agenthub.log",
  },
}
```

### Gateway ↔ 外部通信

```
本地模式（Ollama / 自有 API Key）:
  Gateway 独立运行，不需要任何后端
  消息进来 → Gateway → Agent (直连 Ollama 或 Anthropic API) → 响应

云端模式（AgentTerm 代理）:
  Gateway 通过 API Key 连接 AgentTerm 后端
  消息进来 → Gateway → Agent (经 AgentTerm 代理) → 用量记录 → 响应
```

**云端模式下 AgentTerm FastAPI 需要新增的端点（Phase 3）：**
- `POST /api/v1/api-keys/verify` — 验证 AgentHub 用户的 API Key
- `POST /api/v1/agenthub/usage` — 记录 AgentHub 用量
- `GET/POST /api/v1/skills/*` — 技能市场 API

### 技能 = SKILL.md 文件（遵循 Agent Skills 开放标准）

```
Claude Agent SDK 自动发现和加载 SKILL.md 文件的流程：

1. AgentHub 把用户安装的技能放到 ~/.agenthub/skills/ 目录
2. 为每个用户创建软链接或复制到 .claude/skills/ 目录
3. Agent Runner 调用 query() 时设置 settingSources: ['user', 'project']
4. SDK 自动扫描 .claude/skills/*/SKILL.md
5. Claude 根据 description 自动判断何时使用哪个技能
6. 无需手动编码，纯 Markdown + YAML 驱动

技能目录结构 (标准)：
  skills/code-review/
    ├── SKILL.md          # 主文件：YAML frontmatter + Markdown 指令
    ├── examples/          # 可选：示例输出
    ├── scripts/           # 可选：辅助脚本 (Claude 可执行)
    └── reference.md       # 可选：详细参考文档

技能市场的"商品"本质：
  一个包含 SKILL.md 及辅助文件的压缩包
  → 用户购买后下载到 ~/.agenthub/skills/
  → Claude Agent SDK 自动发现
  → 开箱即用
```

### 技能市场与安装体验

**分发模式：官方市场 + Git 安装（双轨制）**

```
安装来源 1: 官方市场（付费/免费，有审核）
  $ agenthub skill search "代码审查"

  📦 搜索结果:
  1. code-review v1.2.0  ⭐4.8 (236评价)  免费     @official
  2. deep-review v2.0.1  ⭐4.5 (89评价)   ¥9.9/月  @zhangsan
  3. security-scan v1.0  ⭐4.2 (45评价)   ¥19.9    @lisi

  $ agenthub skill install code-review
  ✅ 已安装 code-review v1.2.0 到 ~/.agenthub/skills/code-review/

  $ agenthub skill install deep-review
  💰 deep-review 是付费技能 (¥9.9/月)
  ? 确认购买并安装？(Y/n) Y
  ✅ 已购买并安装 deep-review v2.0.1

安装来源 2: Git URL（社区/自研，无审核）
  $ agenthub skill install https://github.com/someone/my-skill.git
  ⚠️  这是未经审核的社区技能，请确认来源可信
  ? 继续安装？(Y/n) Y
  ✅ 已安装 my-skill 到 ~/.agenthub/skills/my-skill/

安装来源 3: 本地目录
  $ agenthub skill install ./my-custom-skill/
  ✅ 已安装 my-custom-skill（本地开发模式）
```

**开发者发布流程：**
```
1. 创建技能
   $ agenthub skill create my-skill
   ✅ 已创建脚手架: ~/.agenthub/skills/my-skill/SKILL.md

2. 本地开发测试
   编辑 SKILL.md → agenthub start → 在钉钉/WebChat 中测试

3. 发布到官方市场
   $ agenthub skill publish my-skill
   ? 定价模式: 免费 / 一次性付费 / 订阅制
   ? 价格 (¥): 9.9
   ? 分类: coding / writing / data / automation / other
   ✅ 已提交审核，预计 1-3 个工作日上架

4. 查看收入
   $ agenthub skill earnings
   📊 本月收入:
   my-skill: 23 次安装, ¥158.31 (扣除平台 30% 后)
```

**技能安装后文件结构：**
```
~/.agenthub/skills/
├── code-review/           # 从官方市场安装
│   ├── SKILL.md
│   ├── .source.json       # 来源信息 {"type": "marketplace", "version": "1.2.0"}
│   └── examples/
├── my-skill/              # 从 Git 安装
│   ├── SKILL.md
│   ├── .source.json       # {"type": "git", "url": "https://github.com/..."}
│   └── scripts/
└── custom-local/          # 本地自建
    ├── SKILL.md
    └── .source.json       # {"type": "local"}
```

**同时，SDK 自动从 .claude/skills/ 发现技能（Claude Code 原生目录也兼容）。**

### CLI 命令设计

```
agenthub start [--daemon]       启动 Gateway
agenthub stop                   停止 Gateway
agenthub status                 查看运行状态

agenthub init                   交互式初始化配置
agenthub config show            显示当前配置（密钥脱敏）

agenthub skill search <keyword> 搜索官方市场
agenthub skill list             列出已安装技能
agenthub skill install <name|url|path>  安装技能（市场/Git/本地）
agenthub skill update <name>    更新技能到最新版
agenthub skill remove <name>    卸载技能
agenthub skill create <name>    脚手架创建新技能
agenthub skill publish <name>   发布到官方市场
agenthub skill earnings         查看开发者收入

agenthub channel list           列出已配置的平台
agenthub channel test <name>    发送测试消息

agenthub logs [--level error]   查看日志
```

---

## 后端架构：不需要单独后端

**核心理念：AgentHub 本身不需要后端服务。**

```
本地/免费模式（用户自己配模型）:
  AgentHub Gateway (TS)
    ├── 本地 Ollama → 完全离线，零依赖
    ├── 自有 API Key → 直接调 Anthropic/OpenAI/DeepSeek API
    ├── 技能管理 → 纯本地文件操作 (~/.agenthub/skills/)
    ├── 记忆 → 本地 SQLite
    └── 不需要任何后端服务

云端/付费模式（省心，用我们的模型代理）:
  AgentHub Gateway (TS)
    ├── 模型调用 → AgentTerm 后端代理 (/anthropic-proxy)
    ├── 技能市场 → AgentTerm 后端 (浏览/购买/下载)
    ├── 计费/用量 → AgentTerm 后端
    └── 用户只需配一个 AgentTerm API Key (bba-v1p-xxx)
```

**AgentHub 项目本身不包含后端代码**，它是一个纯客户端/Gateway。
需要后端功能时，对接 AgentTerm 的现有 FastAPI 后端即可。

### AgentTerm 后端扩展（Phase 3，仅技能市场需要）

**新增文件：**
- `/home/tony/beelive-lite-saas/backend/app/models/skill.py` — 技能市场模型
- `/home/tony/beelive-lite-saas/backend/app/api/v1/skills.py` — 技能市场 API 路由

**新增表（lite_ 前缀，复用 rental_earnings 模式）：**

| 表名 | 用途 |
|------|------|
| `lite_skills` | 技能定义（名称、作者、描述、价格、SKILL.md 内容、状态） |
| `lite_skill_versions` | 版本管理（语义版本、changelog、包 URL、hash） |
| `lite_skill_installs` | 用户安装记录（付款关联） |
| `lite_skill_reviews` | 评分评论（1-5 分） |
| `lite_skill_earnings` | 开发者收入（30% 平台抽成） |

**复用现有模式：**
- `rental.py` 的分成结算逻辑
- 现有用户认证、微信支付、余额/提现系统

---

## 用户端安装与使用体验

### 安装方式（三选一）

**方式 1：npm 全局安装（开发者推荐）**
```bash
npm install -g agenthub
agenthub init           # 交互式引导：选平台、填 API Key、配钉钉
agenthub start          # 启动 Gateway，钉钉 Bot 上线
```

**方式 2：一键安装脚本（小白友好）**
```bash
curl -fsSL https://get.agenthub.dev | sh
# 自动安装 Node.js（如果没有）+ 安装 agenthub + 运行 init 向导
```

**方式 3：Docker（服务器部署）**
```bash
docker run -d --name agenthub \
  -v ~/.agenthub:/root/.agenthub \
  -e ANTHROPIC_API_KEY=sk-xxx \
  -e DINGTALK_CLIENT_ID=xxx \
  -e DINGTALK_CLIENT_SECRET=xxx \
  agenthub/agenthub:latest
```

### 用户完整使用流程

```
第一步：安装
  npm install -g agenthub

第二步：初始化（交互式向导）
  $ agenthub init

  👋 欢迎使用 AgentHub！

  ? 选择 AI 模型来源:
    > AgentTerm 云端托管 (推荐，无需翻墙，按量计费)
      自有 API Key (Anthropic/OpenAI/DeepSeek 等)
      本地模型 (Ollama，完全离线)

  [如果选云端托管]
  ? 输入你的 AgentTerm 账号或 API Key: bba-v1p-xxxxx
    ✅ 验证通过，当前套餐：专业版 (500万 tokens/月)

  [如果选自有 API Key]
  ? 选择模型提供商: Anthropic
  ? 输入 API Key: sk-ant-xxxxx

  [如果选本地模型]
  ? Ollama 地址: http://localhost:11434 (默认)
  ? 选择模型: qwen3-coder (推荐) / glm-4.7-flash / deepseek-v3
    ✅ 已连接到 Ollama，模型可用

  ? 要接入哪些聊天平台？
    > [x] 钉钉
      [ ] 企业微信
      [ ] Telegram
      [x] Web Chat (本地测试)

  ? 钉钉 Bot 配置:
    Client ID: xxxxx
    Client Secret: xxxxx

  ✅ 配置已保存到 ~/.agenthub/agenthub.json

  ? 要安装一些推荐技能吗？
    > [x] code-review (代码审查)
      [x] doc-writer (文档生成)
      [ ] data-analyst (数据分析)

  ✅ 2 个技能已安装到 ~/.agenthub/skills/

第三步：启动
  $ agenthub start

  🚀 AgentHub v0.1.0 已启动
  📡 Gateway: ws://127.0.0.1:18800
  💬 钉钉 Bot: 已连接 (Stream 模式)
  🌐 Web Chat: http://localhost:3001
  📝 日志: ~/.agenthub/logs/agenthub.log

第四步：使用
  在钉钉里 @你的机器人:
  用户: @AgentBot 帮我审查一下这段代码 [粘贴代码]
  Bot:  🔴 安全问题：第 15 行存在 SQL 注入风险...
        🟡 建议改进：第 23 行的循环可以用 map 替代...

第五步：安装更多技能
  $ agenthub skill install weekly-report    # 从市场安装
  $ agenthub skill list                     # 查看已安装技能
```

### 与 OpenClaw 安装体验的对比

| 步骤 | OpenClaw | AgentHub |
|------|----------|----------|
| 安装运行时 | 手动装 Node 22+ | 自动安装或内置 |
| 配置 | 手动编辑 openclaw.json + 多个环境变量 | 交互式向导 `agenthub init` |
| 模型接入 | 用户必须自行获取 API Key | 三种模式：云端托管(无需翻墙) / 自有 Key / 本地 Ollama |
| 接入平台 | 手动安装 npm 包 + 配置 | init 向导选择，自动配置 |
| 首次启动 | `openclaw gateway --port 18789 --verbose` | `agenthub start` |
| 常见问题 | onboard 跳过 API Key 导致无法使用 | 向导强制验证 Key 有效性 |

---

## 依赖清单

| 包名 | 用途 |
|------|------|
| `@anthropic-ai/claude-agent-sdk` | Agent 运行时核心 |
| `dingtalk-stream-sdk-nodejs` | 钉钉 Stream 模式连接 |
| `zod` | 技能/配置 schema 校验 |
| `@sinclair/typebox` | 配置 schema（OpenClaw 模式） |
| `json5` | 配置文件解析 |
| `better-sqlite3` | 本地记忆存储 |
| `ws` | WebSocket (Gateway + WebChat) |
| `commander` | CLI 框架 |
| `pino` | 结构化日志 |
| `uuid` | ID 生成 |

---

## 验证方案

1. **单元测试**：配置加载、权限校验、会话管理 — `vitest`
2. **集成测试**：钉钉适配器（mock SDK）、Agent Runner（mock Claude SDK）、FastAPI 认证
3. **端到端测试**：WebChat 消息 → Gateway → Agent → WebChat 回复
4. **钉钉实测**：创建钉钉测试应用，完整消息流转验证

---

## 实施顺序（Phase 1）

1. 项目脚手架：package.json, tsconfig, eslint, README, CLAUDE.md, LICENSE, .gitignore
2. 配置系统：config/schema.ts + config/loader.ts
3. 工具层：utils/logger.ts + utils/crypto.ts
4. 插件系统：plugins/types.ts + plugins/registry.ts + plugins/loader.ts
5. 接口定义：channels/interface.ts + memory/interface.ts
6. Gateway 核心：session.ts → router.ts → server.ts → auth.ts
7. Agent 运行时：permissions.ts → runner.ts → skill-manager.ts
8. 钉钉适配器：channels/dingtalk/index.ts
9. WebChat 适配器：channels/webchat/index.ts
10. 入口整合：index.ts（串联所有组件）
11. CLI 工具：cli/index.ts
12. 记忆系统：memory/sqlite-store.ts + memory/file-store.ts
13. FastAPI 扩展：新增 API Key 验证端点 + 用量记录端点
14. 测试 + 文档

---

## 开源准备清单

- [ ] README.md（中文）+ README.en.md（英文）
- [ ] CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md
- [ ] LICENSE (Apache 2.0)
- [ ] .env.example（列出所有必需环境变量）
- [ ] GitHub Actions: lint + type-check + test
- [ ] Issue 模板 / PR 模板
- [ ] docs/architecture.md（架构图）
- [ ] docs/plugin-development.md（插件开发指南）
- [ ] docs/dingtalk-setup.md（钉钉配置教程）
