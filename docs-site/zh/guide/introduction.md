# 介绍

OpenPollen 是一个安全、易用、可扩展的开源 AI Agent 框架，基于 [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents) 构建。

## 为什么选择 OpenPollen？

- **即插即用**：一条命令完成初始化，自动配置 WebChat 网页聊天界面
- **多渠道统一**：同一个 Agent 可同时接入 WebChat、钉钉、企业微信等多个聊天平台
- **技能可扩展**：基于 SKILL.md 开放标准定义 Agent 技能，支持社区生态
- **云端代理**：通过 OpenPollen 平台代理服务，简化 API 接入流程
- **企业级安全**：API Key / JWT 认证、工具白名单、并发控制、预算限制

## 核心概念

### Gateway

Gateway 是 OpenPollen 的核心服务，提供 HTTP API 和消息路由。所有消息（无论来自哪个渠道）都通过 Gateway 路由到 Agent 处理。

### Channel（渠道）

渠道是连接用户和 Agent 的桥梁。OpenPollen 内置 WebChat 渠道，通过插件支持钉钉、企业微信等平台。

### Skill（技能）

技能定义 Agent 的能力边界。每个技能是一个包含 `SKILL.md` 文件的目录，使用 YAML frontmatter 声明元数据，Markdown 正文定义指令。

### Plugin（插件）

插件是 OpenPollen 的扩展机制，支持 4 种槽位：
- **channel**：聊天平台适配器（如钉钉）
- **skill**：Agent 技能包
- **provider**：模型提供商
- **memory**：记忆存储后端

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js 20+ / TypeScript |
| Agent 核心 | Claude Agent SDK (TS) |
| 聊天平台 | WebChat (WebSocket)、钉钉 (Stream SDK) |
| 配置 | JSON5 + TypeBox schema |
| 记忆 | SQLite (better-sqlite3) + Markdown |
| 日志 | pino |
| CLI | commander |
| 测试 | vitest |
