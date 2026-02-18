# OpenPollen 安装与部署指南

## 环境要求

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **操作系统**: Linux / macOS / Windows (WSL)

---

## 方式一：npm 全局安装（推荐）

```bash
npm install -g openpollen
```

安装完成后验证：

```bash
openpollen --version
# 输出: 0.1.0
```

## 方式二：从源码安装

适合需要修改代码或参与开发的用户。

```bash
# 1. 克隆项目
git clone https://github.com/gyp3085000/OpenPollen.git
cd OpenPollen

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 注册全局命令
npm link
```

验证：

```bash
openpollen --version
# 输出: 0.1.0
```

---

## 初始化配置

```bash
openpollen init
```

交互式向导会依次引导你完成以下配置：

### 1. 选择 AI 模型来源

```
选择 AI 模型来源:
  1. Beelive 云端托管 (推荐，无需翻墙，按量计费)
  2. 自有 API Key (Anthropic)
  3. 本地模型 (Ollama)
```

| 选项 | 说明 | 需要准备 |
|------|------|---------|
| Beelive 云端 | 通过代理访问 Claude，国内可用 | Beelive API Key |
| Anthropic | 直连 Anthropic API | Anthropic API Key (`sk-ant-...`) |
| Ollama | 完全本地离线运行 | 安装 [Ollama](https://ollama.ai) 并拉取模型 |

### 2. 选择聊天平台

- **钉钉 Bot** — 需要钉钉开放平台的 Client ID 和 Client Secret
- **Web Chat** — 内置网页聊天界面，默认端口 3001，开箱即用

### 3. 安装内置技能

向导最后会提示安装内置技能（code-review、data-analyst），建议选择安装。

### 配置文件位置

初始化完成后，配置文件保存在：

```
~/.openpollen/
├── openpollen.json      # 主配置文件
├── skills/             # 已安装的技能
├── memory.db           # SQLite 记忆数据库（运行后生成）
└── logs/
    └── openpollen.log   # 运行日志
```

---

## 启动服务

```bash
openpollen start
```

正常输出：

```
  OpenPollen v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  Web Chat: http://localhost:3001
```

### 访问 Web Chat

打开浏览器访问 http://localhost:3001 即可开始聊天。

### 测试 API

```bash
# 查看运行状态
curl http://127.0.0.1:18800/api/status

# 发送消息
curl -X POST http://127.0.0.1:18800/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"你好","userId":"test"}'
```

### 停止服务

在运行 `openpollen start` 的终端按 **Ctrl+C**。

---

## 常用命令

### 服务管理

```bash
openpollen start              # 启动服务
openpollen start -c <path>    # 指定配置文件启动
openpollen status             # 查看运行状态
```

### 技能管理

```bash
openpollen skill list                          # 列出已安装技能
openpollen skill install ./path/to/skill/      # 从本地路径安装
openpollen skill install https://github.com/user/skill.git  # 从 Git 安装
openpollen skill create my-skill               # 创建技能脚手架
openpollen skill remove <name>                 # 卸载技能
openpollen skill update <name>                 # 更新技能（仅 Git 来源）
```

### 配置与日志

```bash
openpollen config show        # 查看当前配置（密钥脱敏）
openpollen channel list       # 查看已配置的聊天平台
openpollen logs               # 查看最近 50 条日志
openpollen logs -n 100        # 查看最近 100 条日志
openpollen logs -f            # 实时跟踪日志
openpollen logs -l error      # 只看错误日志
```

---

## 配置说明

配置文件为 JSON 格式，支持 `${ENV_VAR}` 环境变量替换。

### 配置文件查找顺序

1. 命令行参数 `-c <path>` 指定的路径
2. 当前目录下的 `openpollen.json`
3. `~/.openpollen/openpollen.json`

### 核心配置项

```json
{
  "agent": {
    "model": "claude-sonnet-4-20250514",
    "maxTurns": 15,
    "maxBudgetUsd": 1.0,
    "systemPrompt": "可选的自定义系统提示"
  },
  "gateway": {
    "host": "127.0.0.1",
    "port": 18800,
    "session": {
      "timeoutMinutes": 30,
      "maxConcurrent": 50
    }
  },
  "channels": {
    "webchat": {
      "enabled": true,
      "port": 3001
    },
    "dingtalk": {
      "enabled": false,
      "clientId": "${DINGTALK_CLIENT_ID}",
      "clientSecret": "${DINGTALK_CLIENT_SECRET}"
    }
  },
  "providers": {
    "beelive": {
      "enabled": true,
      "apiKey": "${BEELIVE_API_KEY}"
    },
    "anthropic": {
      "enabled": false,
      "apiKey": "${ANTHROPIC_API_KEY}"
    },
    "ollama": {
      "enabled": false,
      "baseUrl": "http://localhost:11434",
      "model": "qwen3-coder"
    }
  },
  "skills": {
    "directory": "~/.openpollen/skills"
  },
  "memory": {
    "backend": "sqlite",
    "sqlitePath": "~/.openpollen/memory.db"
  },
  "logging": {
    "level": "info",
    "file": "~/.openpollen/logs/openpollen.log"
  }
}
```

完整配置示例参见项目中的 [openpollen.json.example](../openpollen.json.example)。

---

## Ollama 本地模型配置

如果选择本地模型运行（完全离线，零成本）：

```bash
# 1. 安装 Ollama (https://ollama.ai)
curl -fsSL https://ollama.ai/install.sh | sh

# 2. 拉取推荐模型
ollama pull qwen3-coder

# 3. 初始化 OpenPollen 时选择 "本地模型 (Ollama)"
openpollen init
```

---

## 开发模式

适合开发者调试使用，代码修改后自动重启：

```bash
cd OpenPollen
npm run dev
```

### 运行测试

```bash
npm test            # 运行全部测试
npm run typecheck   # 类型检查
```

---

## 发布新版本

面向项目维护者，发布新版到 npm：

```bash
# 1. 确保代码和测试通过
npm test
npm run build

# 2. 更新版本号
npm version patch   # 0.1.0 → 0.1.1 (bug 修复)
npm version minor   # 0.1.0 → 0.2.0 (新功能)
npm version major   # 0.1.0 → 1.0.0 (重大变更)

# 3. 发布（需要 npm 2FA 恢复码）
npm config set registry https://registry.npmjs.org/
npm publish --otp=<恢复码>

# 4. 还原镜像源
npm config set registry https://registry.npmmirror.com
```

---

## 故障排查

### 端口被占用

```
启动失败: listen EADDRINUSE: address already in use 127.0.0.1:18800
```

解决：

```bash
# 查看并杀掉占用端口的进程
lsof -ti:18800 | xargs -r kill
lsof -ti:3001 | xargs -r kill
```

### 配置文件未找到

确认配置文件在以下位置之一：
- 当前目录: `./openpollen.json`
- 用户目录: `~/.openpollen/openpollen.json`

或运行 `openpollen init` 重新生成。

### API 调用失败

检查 provider 配置是否正确：

```bash
openpollen config show
```

确认对应的 API Key 有效且 provider 的 `enabled` 为 `true`。

### 查看详细日志

```bash
openpollen logs -l debug -n 100
```
