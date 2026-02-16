# 快速开始

本指南帮助你在本地快速启动 HiveAgent 并通过 WebChat 进行对话。

## 前置条件

- Node.js 20 或更高版本
- npm 或 pnpm
- Claude API Key（或 AgentTerm API Key）

## 安装

```bash
# 克隆仓库
git clone https://github.com/anthropics/claude-code.git
cd HiveAgent

# 安装依赖
npm install

# 编译
npm run build
```

## 初始化配置

运行交互式初始化命令：

```bash
npx hiveagent init
```

初始化向导会引导你完成以下配置：

1. **选择模型来源**
   - AgentTerm 云端托管（推荐，无需翻墙）
   - Anthropic 自有 API Key
   - 本地模型 (Ollama)

2. **选择聊天平台**
   - 钉钉 Bot（需要 Client ID 和 Secret）
   - WebChat 网页聊天（默认启用，端口 3001）

3. **安装内置技能**
   - code-review（代码审查）
   - data-analyst（数据分析）

配置文件保存在 `~/.hiveagent/hiveagent.json`。

## 启动服务

```bash
npx hiveagent start
```

启动成功后你会看到：

```
  HiveAgent v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  Web Chat: http://localhost:3001
```

## 开始对话

打开浏览器访问 `http://localhost:3001`，即可通过 WebChat 与 Agent 对话。

### 会话命令

在对话中可以使用以下命令：

| 命令 | 说明 |
|------|------|
| `/new` | 重置当前会话，开始新对话 |
| `/resume` | 列出历史会话 |
| `/resume N` | 恢复第 N 个历史会话 |
| `/market` | 查看技能市场 |

## 查看状态

```bash
npx hiveagent status
```

## 停止服务

```bash
npx hiveagent stop
```

## 下一步

- [架构概览](/zh/guide/architecture) — 了解 HiveAgent 内部工作原理
- [配置参考](/zh/reference/config) — 完整配置字段说明
- [技能概览](/zh/skills/overview) — 安装和管理 Agent 技能
