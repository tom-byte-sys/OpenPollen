# 架构概览

OpenPollen 采用分层架构，将消息接入、路由处理、Agent 执行和存储解耦。

## 架构图

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   WebChat   │  │    钉钉     │  │  企业微信    │
│  (内置渠道)  │  │  (插件渠道)  │  │  (插件渠道)  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                ┌───────▼───────┐
                │    Gateway    │
                │  HTTP Server  │
                │  /health      │
                │  /api/status  │
                │  /api/chat    │
                └───────┬───────┘
                        │
                ┌───────▼───────┐
                │ MessageRouter │
                │  会话查找/创建  │
                │  并发控制      │
                │  命令解析      │
                └───────┬───────┘
                        │
              ┌─────────▼─────────┐
              │   SessionManager  │
              │  会话生命周期管理   │
              │  超时 GC          │
              └─────────┬─────────┘
                        │
                ┌───────▼───────┐
                │  AgentRunner  │
                │  Claude SDK   │
                │  技能注入      │
                │  工具分配      │
                └───────┬───────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
   ┌──────▼──────┐ ┌───▼────┐ ┌─────▼─────┐
   │ SkillManager│ │ Memory │ │  Plugins  │
   │ 技能发现/加载│ │ SQLite │ │  插件注册  │
   └─────────────┘ │  File  │ │  生命周期  │
                   └────────┘ └───────────┘
```

## 消息流转

1. **消息接入**：用户消息从渠道（WebChat / 钉钉 / HTTP API）进入
2. **路由分发**：MessageRouter 根据渠道类型和用户 ID 查找或创建 Session
3. **并发控制**：同一会话同时只处理一条消息，避免状态冲突
4. **Agent 执行**：AgentRunner 调用 Claude Agent SDK，注入技能指令和可用工具
5. **流式响应**：Agent 的回复以流式 chunk 方式实时推送给用户（WebChat 支持）
6. **记忆存储**：对话摘要自动存储到用户命名空间，支持跨会话上下文

## 核心模块

### Gateway Server

HTTP 服务器，提供 REST API 端点：

- `GET /health` — 健康检查
- `GET /api/status` — 运行状态（活跃会话数、处理中请求数、运行时间）
- `POST /api/chat` — 发送消息（支持 API Key / JWT 认证）

### MessageRouter

消息路由核心，负责：
- 会话的查找和创建
- 请求去重与并发控制
- 内置命令解析（`/new`、`/resume`、`/market`）
- 对话摘要存储

### SessionManager

管理所有活跃会话的生命周期：
- 按 channelType + userId + conversationType 唯一标识会话
- 超时自动回收（默认 30 分钟）
- 最大并发会话限制（默认 50）

### AgentRunner

Agent 执行引擎：
- 集成 Claude Agent SDK
- 将已安装技能的 SKILL.md 内容注入系统提示词
- 根据配置分配可用工具（Read、Grep、Glob、WebSearch 等）
- 支持多模型切换和预算控制

### PluginRegistry

插件注册中心：
- 自动扫描 `plugins/` 目录加载插件
- 管理插件的初始化、启动、停止生命周期
- 支持 4 种槽位：channel / skill / provider / memory
