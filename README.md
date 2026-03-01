# OpenPollen

> 安全、易用、可扩展的开源 AI Agent 框架

[English](./README.en.md) | [文档](https://tom-byte-sys.github.io/OpenPollen/zh/guide/introduction)

<p align="center">
  <img src="docs/demo.gif" alt="OpenPollen Demo" width="800">
</p>

OpenPollen 是一个开源的多平台 AI Agent 框架，基于 Claude Agent SDK 构建。支持钉钉、飞书、企业微信等聊天平台接入，通过 SKILL.md（Agent Skills 开放标准）实现技能的安装、发现和执行。

## 特性

- **多平台接入** — 钉钉、飞书、企业微信、Web Chat，均支持长连接模式
- **技能系统** — 基于 SKILL.md 的声明式技能，一个文件即一个技能
- **插件架构** — 四槽位插件系统（channel / skill / provider / memory）
- **多模型支持** — Anthropic Claude、OpenAI、本地 Ollama，灵活切换
- **记忆系统** — SQLite + Markdown 文件双模式持久化记忆
- **安全可控** — 工具白名单、操作审计、会话隔离

## 快速开始

### 安装

```bash
npm install -g openpollen
```

### 初始化

```bash
openpollen init
```

交互式向导将引导你完成：
1. 选择 AI 模型来源（云端托管 / 自有 API Key / 本地 Ollama）
2. 选择聊天平台（钉钉 / 飞书 / Web Chat）
3. 安装推荐技能

### 启动

```bash
openpollen start
```

## 文档

完整文档请访问 [OpenPollen 文档站](https://tom-byte-sys.github.io/OpenPollen/zh/guide/introduction)。

- [快速开始](https://tom-byte-sys.github.io/OpenPollen/zh/guide/quickstart)
- [架构概览](https://tom-byte-sys.github.io/OpenPollen/zh/guide/architecture)
- [渠道接入](https://tom-byte-sys.github.io/OpenPollen/zh/channels/webchat) — WebChat / 钉钉 / 飞书
- [技能系统](https://tom-byte-sys.github.io/OpenPollen/zh/skills/overview)
- [配置参考](https://tom-byte-sys.github.io/OpenPollen/zh/reference/config)

本地预览文档：

```bash
cd docs-site && npx vitepress dev
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
openpollen skill list                    # 列出已安装技能
openpollen skill install code-review     # 从市场安装
openpollen skill install ./my-skill/     # 从本地安装
openpollen skill remove code-review      # 卸载技能
openpollen skill create my-skill         # 创建新技能
```

## 配置

配置文件 `openpollen.json`（JSON5 格式），支持 `${ENV_VAR}` 环境变量替换。

参见 [openpollen.json.example](./openpollen.json.example) 了解完整配置项。

### 模型来源说明

初始化时选择「云端托管」会默认通过 OpenPollen 官方代理转发 API 请求，方便国内用户开箱即用。你也可以随时切换为其他方式：

- **自有 API Key** — 在 `providers.anthropic` 中填入你的 Anthropic API Key，直连官方 API
- **本地模型** — 启用 `providers.ollama`，使用本地部署的 Ollama 模型，数据完全不出本机

所有网络请求行为均可在配置文件中查看和修改，不存在隐式的数据收集。

## 开发

```bash
git clone https://github.com/tom-byte-sys/OpenPollen.git
cd OpenPollen
npm install
npm run dev
```

## 许可证

[Apache License 2.0](./LICENSE)
