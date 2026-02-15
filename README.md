# HiveAgent

> 安全、易用、国产化的 AI Agent 平台

HiveAgent 是一个开源的多平台 AI Agent 框架，基于 Claude Agent SDK 构建。支持钉钉、企业微信、Telegram 等聊天平台接入，通过 SKILL.md（Agent Skills 开放标准）实现技能的安装、发现和执行。

## 特性

- **多平台接入** — 钉钉、企业微信、Telegram、Web Chat
- **技能系统** — 基于 SKILL.md 的声明式技能，一个文件即一个技能
- **插件架构** — 四槽位插件系统（channel / skill / provider / memory）
- **多模型支持** — Anthropic Claude、OpenAI、本地 Ollama，灵活切换
- **记忆系统** — SQLite + Markdown 文件双模式持久化记忆
- **安全可控** — 工具白名单、操作审计、会话隔离

## 快速开始

### 安装

```bash
npm install -g hiveagent
```

### 初始化

```bash
hiveagent init
```

交互式向导将引导你完成：
1. 选择 AI 模型来源（云端托管 / 自有 API Key / 本地 Ollama）
2. 选择聊天平台（钉钉 / Web Chat）
3. 安装推荐技能

### 启动

```bash
hiveagent start
```

## 技能系统

技能的本质是一个 `SKILL.md` 文件，遵循 [Agent Skills 开放标准](https://agentskills.io)。

```yaml
---
name: code-review
description: 自动审查代码，给出改进建议
allowed-tools: Read, Grep, Glob
---

# 代码审查

审查用户提供的代码...
```

### 技能管理

```bash
hiveagent skill list                    # 列出已安装技能
hiveagent skill install code-review     # 从市场安装
hiveagent skill install ./my-skill/     # 从本地安装
hiveagent skill remove code-review      # 卸载技能
hiveagent skill create my-skill         # 创建新技能
```

## 配置

配置文件 `hiveagent.json`（JSON5 格式），支持 `${ENV_VAR}` 环境变量替换。

参见 [hiveagent.json.example](./hiveagent.json.example) 了解完整配置项。

## 开发

```bash
git clone https://github.com/anthropics/hiveagent.git
cd hiveagent
npm install
npm run dev
```

## 许可证

[Apache License 2.0](./LICENSE)
