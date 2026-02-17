# HiveAgent 项目进度报告

> 更新日期: 2026-02-16
> 计划文件: [project-plan.md](./project-plan.md)

---

## 总体概况

项目已从原名 "AgentHub" 更名为 **HiveAgent**，核心架构与计划基本一致。
当前已完成 Phase 1 的大部分工作，SDK 集成（含技能系统）已跑通端到端流程。

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 1 — MVP | 进行中 | ~90% |
| Phase 2 — 技能系统 | 部分完成 | ~40% |
| Phase 3 — 技能市场 | **已完成** | **~90%** |

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
| dingtalk/index.ts | 已完成 | 基于 dingtalk-stream SDK，含 token 缓存、消息截断、异步回复 |

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
| `hiveagent stop` | 已完成 | PID 文件机制，支持优雅停止 |
| `hiveagent status` | 已完成 | 通过 Gateway API 查询状态 |
| `hiveagent config show` | 已完成 | 密钥脱敏显示 |
| `hiveagent login` | 已完成 | 登录市场，JWT token 保存到 ~/.hiveagent/auth.json |
| `hiveagent skill search` | 已完成 | 调用市场 API 搜索，支持 --category / --sort |
| `hiveagent skill publish` | 已完成 | 交互式发布：选定价/分类/版本号 → 打包上传 → 提交审核 |
| `hiveagent skill earnings` | 已完成 | 按月汇总显示净收入，支持 --month 指定月份 |
| `hiveagent channel list/test` | 已完成 | 列出平台状态 / 发送测试消息 |
| `hiveagent logs` | 已完成 | 支持级别过滤、行数限制、持续跟踪 |

### 11. 记忆系统 (`src/memory/`)

| 计划项 | 状态 | 说明 |
|--------|------|------|
| sqlite-store.ts | 已完成 | sql.js 实现（非 better-sqlite3），含 TTL 过期 |
| file-store.ts | 已完成 | Markdown 文件存储，含 TTL 支持，已通过 13 项测试 |

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

> 全部 58 个测试用例通过（含 26 个新增记忆系统测试）。

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
| 技能市场 CLI | 已完成 | search / publish / earnings + login + install 市场支持 |
| 技能市场 API | 已完成 | AgentTerm 后端 skill_marketplace 模块 |
| MarketplaceClient | 已完成 | src/agent/marketplace-client.ts，封装所有市场 API |
| installFromMarketplace | 已完成 | skill-manager.ts 新增方法，下载 tar.gz 解压安装 |
| marketplace 配置 | 已完成 | schema.ts + hiveagent.json.example 新增 marketplace 段 |

---

## Phase 3 — 技能市场

> 实施日期: 2026-02-16

### 后端（AgentTerm FastAPI）

| 计划项 | 状态 | 说明 |
|--------|------|------|
| 数据库迁移 SQL | 已完成 | `008_create_skill_marketplace_tables.sql`，5 张表 |
| SQLAlchemy 模型 | 已完成 | `app/models/skill_marketplace.py`，5 模型 + 4 枚举 |
| 公开 API (搜索/详情/版本/评论/下载) | 已完成 | `app/api/v1/skill_marketplace.py` GET 端点 |
| 发布/管理 API (CRUD + 审核) | 已完成 | POST/PUT/DELETE 端点 + admin 审核端点 |
| 购买/收入 API | 已完成 | 购买创建订单、评论、收入汇总、购买历史 |
| 业务服务层 | 已完成 | `app/services/skill_marketplace_service.py` |
| 微信支付集成 | 已完成 | `payments.py` 回调/轮询增加 `skill_*` plan_code 分支 |
| 路由注册 | 已完成 | `api/v1/__init__.py` 注册 prefix="/skills-market" |
| 配置项 | 已完成 | `settings.py` 新增 SKILL_MARKETPLACE |

**5 张数据库表：**
- `lite_skills` — 技能定义（名称、分类、定价、状态、评分）
- `lite_skill_versions` — 版本管理（semver、SKILL.md 内容、包文件）
- `lite_skill_installs` — 安装/购买记录
- `lite_skill_reviews` — 评分评论
- `lite_skill_earnings` — 开发者收入（70/30 分成）

**API 端点：**
- `GET /skills` — 搜索/浏览（q, category, pricing_model, sort_by, 分页）
- `GET /skills/{id}` — 详情
- `GET /skills/{id}/versions` — 版本列表
- `GET /skills/{id}/reviews` — 评论列表
- `GET /skills/{id}/download` — 下载包
- `POST /skills` — 发布新技能
- `PUT /skills/{id}` — 更新技能
- `POST /skills/{id}/versions` — 上传新版本
- `DELETE /skills/{id}` — 下架
- `POST /skills/{id}/purchase` — 购买
- `GET /skills/{id}/purchase/status` — 购买状态
- `POST /skills/{id}/reviews` — 提交评论
- `GET /my/skills` — 我的技能
- `GET /my/purchases` — 我的购买
- `GET /my/earnings` — 收入概览
- `GET /my/earnings/{month}` — 月度详情
- `GET /admin/skills/pending` — 待审核
- `POST /admin/skills/{id}/approve` — 审核通过
- `POST /admin/skills/{id}/reject` — 拒绝

### HiveAgent 前端

| 计划项 | 状态 | 说明 |
|--------|------|------|
| MarketplaceClient | 已完成 | `src/agent/marketplace-client.ts` |
| skill-manager 扩展 | 已完成 | `installFromMarketplace()` + `SkillSource.skillId` |
| 配置扩展 | 已完成 | `MarketplaceConfigSchema` + `marketplace` 配置段 |
| CLI login 命令 | 已完成 | 邮箱+密码登录，JWT 保存到 auth.json |
| CLI skill search | 已完成 | 搜索市场，格式化输出 |
| CLI skill publish | 已完成 | 交互式发布流程 |
| CLI skill earnings | 已完成 | 收入概览 |
| CLI skill install (市场) | 已完成 | 免费直接下载安装，付费创建支付订单 |
| marketplace.html | 已完成 | 深色主题市场页面，搜索+分类+排序+卡片+详情弹窗 |
| index.html 导航 | 已完成 | 添加"市场"链接 |
| /market WebChat 命令 | 已完成 | router.ts 返回市场页面链接 |

### 未完成项

| 计划项 | 状态 | 说明 |
|--------|------|------|
| 开源准备 | 未开始 | README.en.md, CONTRIBUTING.md, SECURITY.md, GitHub Actions |
| Docker 支持 | 未完成 | Dockerfile + docker-compose.yml |
| 数据库迁移执行 | 待执行 | 需在 MySQL 上执行 008 SQL |
| 端到端测试 | 待验证 | 发布→审核→搜索→购买→安装 完整流程 |

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

1. **执行数据库迁移** — 在 MySQL 上执行 `008_create_skill_marketplace_tables.sql`
2. **端到端测试** — 完整验证 发布→审核→搜索→购买→安装 流程
3. **Docker 支持** — 编写 Dockerfile + docker-compose.yml，便于服务器部署
4. **GitHub Actions CI** — 自动化 typecheck + test 流水线

### 中期目标

5. **更多聊天平台** — 企业微信、Telegram 适配器
6. **记忆与 Agent 集成** — Agent 会话中自动读写记忆
7. **插件系统实例** — 编写至少一个完整插件验证插件生命周期

### 开源准备

8. **文档** — 英文 README、贡献指南、SECURITY.md
9. **市场种子数据** — 发布几个官方技能到市场，验证展示效果
10. **marketplace.html 部署** — 上线到 agent.beebywork.com
