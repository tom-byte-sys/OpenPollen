# 本地开发

本指南介绍如何搭建 HiveAgent 本地开发环境。

## 环境要求

| 工具 | 版本要求 |
|------|---------|
| Node.js | 20 或更高 |
| npm | 10 或更高 |
| Git | 2.x |

## 获取源码

```bash
git clone https://github.com/anthropics/claude-code.git
cd HiveAgent
```

## 安装依赖

```bash
npm install
```

## 配置

复制示例配置文件：

```bash
cp hiveagent.json.example hiveagent.json
```

编辑 `hiveagent.json`，至少配置一个模型提供商：

```json5
{
  "providers": {
    "anthropic": {
      "enabled": true,
      "apiKey": "sk-ant-..."  // 你的 API Key
    }
  }
}
```

或使用环境变量：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## 开发模式

```bash
npm run dev
```

使用 `tsx watch` 监听文件变化，自动重启。

## 编译

```bash
npm run build
```

编译输出到 `dist/` 目录。

## 运行测试

```bash
npm run test
```

使用 vitest 运行测试套件。

## 类型检查

```bash
npm run typecheck
```

## 目录结构

```
HiveAgent/
├── src/
│   ├── index.ts          # 入口，创建并组装所有模块
│   ├── config/           # 配置加载和 schema 验证
│   ├── gateway/          # HTTP 服务器和消息路由
│   │   ├── server.ts     # HTTP 端点
│   │   ├── router.ts     # 消息路由
│   │   ├── session.ts    # 会话管理
│   │   └── auth.ts       # 认证服务
│   ├── agent/            # Agent 运行时
│   │   ├── runner.ts     # Agent 执行引擎
│   │   ├── skill-manager.ts  # 技能管理
│   │   └── marketplace-client.ts  # 市场 API 客户端
│   ├── channels/         # 渠道适配器
│   │   ├── interface.ts  # 渠道接口定义
│   │   └── webchat/      # WebChat 实现
│   ├── plugins/          # 插件系统
│   │   ├── types.ts      # 插件类型定义
│   │   ├── registry.ts   # 插件注册中心
│   │   └── loader.ts     # 插件加载器
│   ├── memory/           # 记忆存储
│   └── utils/            # 工具函数
├── cli/                  # CLI 入口
│   └── index.ts          # 所有 CLI 命令定义
├── plugins/              # 外部插件
│   ├── dingtalk/         # 钉钉插件
│   └── wechat/           # 企业微信插件
├── skills/               # 内置技能
│   ├── code-review/      # 代码审查
│   └── data-analyst/     # 数据分析
└── tests/                # 测试文件
```

## 数据目录

运行时数据存储在 `~/.hiveagent/`：

```
~/.hiveagent/
├── hiveagent.json        # 配置文件
├── auth.json             # 登录凭证
├── hiveagent.pid         # 进程 PID 文件
├── memory.db             # SQLite 记忆数据库
├── memory/               # Markdown 记忆文件
├── skills/               # 已安装技能
└── logs/
    └── hiveagent.log     # 日志文件
```

## 常见问题

### 端口被占用

默认端口：Gateway 18800，WebChat 3001。修改配置文件中的 `gateway.port` 和 `channels.webchat.port`。

### 模型 API 连接超时

如果在国内无法直接访问 Anthropic API，可以配置 Beelive 平台代理：

```json5
{
  "providers": {
    "beelive": {
      "enabled": true,
      "apiKey": "your-beelive-key",
      "baseUrl": "https://your-beelive-server.com/api/v1/anthropic-proxy"
    }
  }
}
```

### 日志查看

```bash
# 查看最近 50 行日志
npx hiveagent logs

# 持续跟踪
npx hiveagent logs -f

# 只看错误
npx hiveagent logs -l error
```
