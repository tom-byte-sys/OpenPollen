# HiveAgent 项目进度报告

> 更新日期: 2026-02-15
> 计划文件: [project-plan.md](./project-plan.md)

---

## 总体概况

项目已从原名 "AgentHub" 更名为 **HiveAgent**，核心架构与计划基本一致。
当前已完成 Phase 1 的大部分工作，SDK 集成（含技能系统）已跑通端到端流程。

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 1 — MVP | 进行中 | ~75% |
| Phase 2 — 技能系统 | 部分完成 | ~40% |
| Phase 3 — 技能市场 + 开源 | 未开始 | 0% |

---

## Phase 1 详细对照

### 1. 项目脚手架

| 计划项 | 状态 | 说明 |
|--------|------|------|
| package.json | 已完成 | hiveagent v0.1.0, Apache-2.0 |
| tsconfig.json | 已完成 | |
| .gitignore | 已完成 | |
| CLAUDE.md | 已完成 | 项目上下文文件 |
| README.md | 已完成 | 中文 README |
| LICENSE | 已完成 | Apache 2.0 |
| hiveagent.json.example | 已完成 | 配置示例文件 |
| .eslintrc.json | 待确认 | 计划中有，需检查是否配置 |
| .env.example | 未完成 | |

### 2. 配置系统 (`src/config/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| schema.ts | 已完成 | TypeBox schema 定义，含 agent/gateway/channels/providers/skills/memory/logging |
| loader.ts | 已完成 | JSON5 解析 + 环境变量 `${VAR}` 替换 + schema 校验 |

### 3. 工具层 (`src/utils/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| logger.ts | 已完成 | pino 结构化日志 |
| crypto.ts | 已完成 | UUID / SHA256 工具 |

### 4. 插件系统 (`src/plugins/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| types.ts | 已完成 | PluginSlot 4 种类型定义 |
| registry.ts | 已完成 | 插件注册中心 |
| loader.ts | 已完成 | 插件扫描与动态加载 |

> 注：插件系统基础框架已搭建，但缺少实际插件实例和完整的生命周期测试。

### 5. 接口定义 (`src/channels/`, `src/memory/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| channels/interface.ts | 已完成 | ChannelAdapter / InboundMessage / OutboundMessage |
| memory/interface.ts | 已完成 | MemoryStore 接口 |

### 6. Gateway 核心 (`src/gateway/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| session.ts | 已完成 | 会话管理 + 超时 + GC |
| router.ts | 已完成 | 消息路由 Channel → Session → Agent |
| server.ts | 已完成 | WebSocket + HTTP 服务 (端口 18800) |
| auth.ts | 已完成 | 文件存在，基础实现 |

### 7. Agent 运行时 (`src/agent/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| runner.ts | 已完成 | **核心文件**，Claude Agent SDK `query()` 封装 |
| skill-manager.ts | 已完成 | SKILL.md 发现/安装(本地+Git)/卸载/更新/脚手架创建 |
| permissions.ts | 已完成 | 工具白名单权限控制 |

**runner.ts 关键实现细节：**
- 使用 `@anthropic-ai/claude-agent-sdk` v0.2.42（非 `@anthropic-ai/claude-code`）
- SDK 工作空间隔离：`~/.hiveagent/sdk-workspace/` + `.claude/skills/` 符号链接
- systemPrompt 使用 `{ type: 'preset', preset: 'claude_code', append: '...' }` 模式解决 cache_control 4 块限制
- 支持 SDK 会话恢复 (`session.sdkSessionId`)
- SDK 不可用时回退到直接 API 调用（Anthropic API / Ollama）
- `permissionMode: 'bypassPermissions'` + `allowDangerouslySkipPermissions: true`

### 8. 聊天平台适配器 (`src/channels/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| webchat/index.ts | 已完成 | WebSocket 网页聊天，含静态 HTML 前端 |
| dingtalk/index.ts | 已创建 | 文件存在，基于 dingtalk-stream SDK，需实际测试 |

### 9. 入口整合

| 计划项 | 状态 | 说明 |
|--------|------|------|
| src/index.ts | 已完成 | 加载配置 → 初始化各组件 → 启动 Gateway → 注册 Channel |

### 10. CLI 工具 (`cli/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| cli/index.ts | 已完成 | 基础 commander CLI |
| `hiveagent start` | 已完成 | 启动 Gateway |
| `hiveagent init` | 已完成 | 交互式初始化 |
| `hiveagent skill list` | 已完成 | 列出已安装技能 |
| `hiveagent skill install` | 已完成 | 安装技能（本地/Git） |
| `hiveagent skill create` | 已完成 | 脚手架创建 |
| `hiveagent skill remove` | 已完成 | 卸载技能 |
| `hiveagent skill update` | 已完成 | 更新技能 (仅 Git) |
| `hiveagent stop` | 未完成 | |
| `hiveagent status` | 未完成 | |
| `hiveagent config show` | 未完成 | |
| `hiveagent skill search` | 未完成 | 需要市场 API (Phase 3) |
| `hiveagent skill publish` | 未完成 | 需要市场 API (Phase 3) |
| `hiveagent skill earnings` | 未完成 | 需要市场 API (Phase 3) |
| `hiveagent channel list/test` | 未完成 | |
| `hiveagent logs` | 未完成 | |

### 11. 记忆系统 (`src/memory/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| sqlite-store.ts | 已完成 | sql.js 实现（非 better-sqlite3），含 TTL 过期 |
| file-store.ts | 已创建 | 文件存在，需完善测试 |

> 注：实际使用 `sql.js`（纯 JS）替代了计划中的 `better-sqlite3`（需编译），降低了安装门槛。

### 12. 测试

| 计划项 | 状态 | 说明 |
|--------|------|------|
| unit/config.test.ts | 已完成 | 配置加载测试 |
| unit/permissions.test.ts | 已完成 | 权限校验测试 |
| unit/session.test.ts | 已完成 | 会话管理测试 |
| integration/agent-runner.test.ts | 已完成 | Agent Runner mock 测试 |
| integration/dingtalk-adapter.test.ts | 已完成 | 钉钉适配器 mock 测试 |
| integration/webchat-e2e.test.ts | 已完成 | WebChat 端到端测试 |

> 全部 32 个测试用例通过。

### 13. 其他 Phase 1 计划项

| 计划项 | 状态 | 说明 |
|--------|------|------|
| FastAPI 后端扩展 (auth 端点) | 未开始 | 属于 AgentTerm 后端，Phase 3 优先级 |
| Docker 支持 | 未完成 | |
| GitHub Actions CI | 未完成 | |

---

## Phase 2 — 技能系统对照

| 计划项 | 状态 | 说明 |
|--------|------|------|
| SKILL.md 标准格式 | 已完成 | YAML frontmatter + Markdown 指令 |
| 技能发现（SDK 自动扫描） | 已完成 | 通过 `.claude/skills/` 目录符号链接实现 |
| Skill 工具调用 | 已完成 | SDK 自动加载并提供 Skill 工具 |
| 技能安装（本地 / Git） | 已完成 | skill-manager.ts 实现 |
| 技能脚手架 (`skill create`) | 已完成 | |
| .source.json 来源追踪 | 已完成 | marketplace / git / local |
| 内置技能 code-review | 已完成 | skills/code-review/SKILL.md |
| 内置技能 data-analyst | 已完成 | skills/data-analyst/SKILL.md |
| 技能市场 CLI | 未开始 | search / publish / earnings (Phase 3) |
| 技能市场 API | 未开始 | AgentTerm 后端扩展 (Phase 3) |

---

## Phase 3 — 技能市场 + 开源发布

全部未开始。包括：
- AgentTerm 后端技能市场 API
- 数据库表 (`lite_skills`, `lite_skill_versions` 等)
- 付费/订阅/分成体系
- 开源准备清单（README.en.md, CONTRIBUTING.md, SECURITY.md, GitHub Actions 等）

---

## 关键技术决策记录

### 1. SDK 选择：claude-agent-sdk vs claude-code

**决策：使用 `@anthropic-ai/claude-agent-sdk`**

- `@anthropic-ai/claude-code` v2.x 只是 CLI 工具（cli.js），无编程 API
- `@anthropic-ai/claude-agent-sdk` v0.2.42 提供 `query()` 函数，是真正的编程接口
- agent-sdk 内部会启动 claude-code CLI 作为子进程

### 2. cache_control 块数限制

**问题：Anthropic API 限制最多 4 个 cache_control 块，加载 2 个技能 + 自定义 systemPrompt 会超出限制**

**解决：systemPrompt 使用 preset+append 模式**
```typescript
options['systemPrompt'] = {
  type: 'preset',
  preset: 'claude_code',
  append: config.agent.systemPrompt,
};
```
这样系统提示会追加到 SDK 默认提示的同一个 cache_control 块中，节省 1 个块位。

相关 GitHub Issues：
- anthropics/claude-code #8419, #8901
- claude-agent-sdk-typescript #89

### 3. SDK 工作空间隔离

**问题：如果 cwd 设为项目根目录，SDK 会加载 CLAUDE.md 产生额外 cache_control 块**

**解决：创建独立工作空间 `~/.hiveagent/sdk-workspace/`**
- 该目录下建 `.claude/skills/` 符号链接指向实际技能目录
- SDK 在此目录下运行，不会加载项目的 CLAUDE.md

### 4. 数据库选择：sql.js 替代 better-sqlite3

**原因：** sql.js 是纯 JavaScript 实现，无需编译原生模块，降低安装失败风险。

---

## 已验证的端到端流程

### 测试时间: 2026-02-15 16:05-16:08

1. **启动**: `npm run dev` → Gateway 在 127.0.0.1:18800 启动，WebChat 在 3001 端口
2. **技能发现**: 扫描到 2 个技能 (code-review, data-analyst)
3. **客户端连接**: WebChat 客户端通过 WebSocket 连接
4. **消息处理**: 发送代码审查请求 → SDK 加载成功 (v2.1.42)
5. **SDK 初始化**: 加载 18 个工具 + 3 个技能 (debug, code-review, data-analyst)
6. **工具调用**: SDK 自动调用 Skill → Read → Glob → Bash → Read（共 10 轮）
7. **结果返回**: 2985 字符的审查结果，费用 $0.133，isError: false
8. **会话恢复**: SDK session_id 已保存，支持后续对话恢复

---

## 当前依赖版本

| 包名 | 版本 | 状态 |
|------|------|------|
| @anthropic-ai/claude-agent-sdk | ^0.2.42 | 生产依赖 |
| @sinclair/typebox | ^0.34.0 | 生产依赖 |
| commander | ^13.0.0 | 生产依赖 |
| dingtalk-stream | ^2.1.4 | 生产依赖 |
| json5 | ^2.2.3 | 生产依赖 |
| pino | ^9.0.0 | 生产依赖 |
| pino-pretty | ^13.0.0 | 生产依赖 |
| sql.js | ^1.11.0 | 生产依赖 (替代 better-sqlite3) |
| uuid | ^11.0.0 | 生产依赖 |
| ws | ^8.18.0 | 生产依赖 |
| vitest | ^3.0.0 | 开发依赖 |
| typescript | ^5.7.0 | 开发依赖 |
| tsx | ^4.0.0 | 开发依赖 |

---

## 下一步工作建议

### 近期优先

1. **钉钉适配器实测** — 文件已创建，需要配置钉钉测试应用进行实际消息流转验证
2. **Git 提交** — 将 SDK 迁移相关改动提交到版本库
3. **CLI 完善** — 实现 `stop`, `status`, `config show` 等命令
4. **Docker 支持** — 编写 Dockerfile，便于服务器部署

### 中期目标

5. **更多聊天平台** — 企业微信、Telegram 适配器
6. **记忆系统完善** — file-store 完善 + 记忆与 Agent 会话的集成
7. **插件系统实例** — 编写至少一个完整插件验证插件生命周期

### 远期目标 (Phase 3)

8. **技能市场 API** — AgentTerm FastAPI 后端扩展
9. **开源准备** — 英文 README、贡献指南、CI/CD 配置
10. **技能市场 CLI** — search / publish / earnings 命令
