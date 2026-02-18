# OpenPollen

安全、易用、国产化的 AI Agent 平台。基于 Claude Agent SDK 构建，支持多平台聊天接入。

## 技术栈

- **运行时**: Node.js 20+ / TypeScript
- **Agent 核心**: Claude Agent SDK (TS)
- **聊天平台**: 钉钉 (Stream SDK)、WebChat (WebSocket)
- **配置**: JSON5 + TypeBox schema
- **记忆**: SQLite (better-sqlite3) + Markdown 文件
- **日志**: pino
- **CLI**: commander
- **测试**: vitest

## 目录结构

```
OpenPollen/
├── src/
│   ├── index.ts          # 入口
│   ├── config/           # 配置系统
│   ├── gateway/          # WebSocket + HTTP 服务
│   ├── agent/            # Agent 运行时
│   ├── channels/         # 聊天平台适配器
│   ├── plugins/          # 插件系统
│   ├── memory/           # 记忆存储
│   └── utils/            # 工具函数
├── cli/                  # CLI 工具
├── skills/               # 内置技能
└── tests/                # 测试
```

## 本地开发

```bash
npm install
npm run dev          # 开发模式 (tsx watch)
npm run build        # 编译
npm run test         # 运行测试
npm run typecheck    # 类型检查
```

## 配置

复制 `openpollen.json.example` 到 `openpollen.json`，根据需要修改配置。
环境变量使用 `${VAR_NAME}` 语法在配置文件中引用。

## 注意事项

- 技能使用 SKILL.md 格式（Agent Skills 开放标准）
- 数据库文件存储在 `~/.openpollen/` 目录
- 插件系统支持 4 种槽位：channel / skill / provider / memory
