# CLI 命令

HiveAgent 提供命令行工具 `hiveagent` 管理服务、配置、技能和渠道。

## 全局选项

大多数子命令支持 `-c, --config <path>` 指定配置文件路径。

## hiveagent start

启动 HiveAgent Gateway 服务。

```bash
hiveagent start [options]
```

| 选项 | 说明 |
|------|------|
| `-c, --config <path>` | 配置文件路径 |
| `-d, --daemon` | 后台运行 |

启动后会显示 Gateway 地址和已启用的渠道信息。使用 `Ctrl+C` 或 `hiveagent stop` 停止。

## hiveagent stop

停止运行中的 HiveAgent。

```bash
hiveagent stop
```

发送 SIGTERM 信号给运行中的进程，等待最多 5 秒。

## hiveagent init

交互式初始化配置文件。

```bash
hiveagent init
```

引导完成以下步骤：
1. 选择模型来源（AgentTerm / Anthropic / Ollama）
2. 配置聊天平台（钉钉 / WebChat）
3. 安装内置技能
4. 生成配置文件到 `~/.hiveagent/hiveagent.json`

## hiveagent status

查看运行状态。

```bash
hiveagent status [-c, --config <path>]
```

通过 Gateway HTTP API 获取当前状态，包括活跃会话数和运行时间。

## hiveagent login

登录到 HiveAgent 市场（用于发布和购买付费技能）。

```bash
hiveagent login
```

登录成功后 Token 保存在 `~/.hiveagent/auth.json`。

## hiveagent logs

查看日志。

```bash
hiveagent logs [options]
```

| 选项 | 说明 |
|------|------|
| `-l, --level <level>` | 过滤日志级别（info / warn / error / debug） |
| `-n, --lines <n>` | 显示最近 N 行（默认 50） |
| `-f, --follow` | 持续跟踪日志输出 |

## hiveagent config show

显示当前配置（敏感字段自动脱敏）。

```bash
hiveagent config show [-c, --config <path>]
```

## hiveagent skill

技能管理命令组。

### skill list

列出已安装技能。

```bash
hiveagent skill list [-c, --config <path>]
```

### skill install

安装技能。支持三种来源：

```bash
# 从市场安装
hiveagent skill install <name>

# 从 Git 仓库安装
hiveagent skill install https://github.com/user/skill-name.git

# 从本地目录安装
hiveagent skill install ./my-skill
```

### skill remove

卸载技能。

```bash
hiveagent skill remove <name>
```

### skill create

创建新技能脚手架。

```bash
hiveagent skill create <name>
```

在技能目录下创建包含 `SKILL.md` 模板的新目录。

### skill update

更新技能（仅支持 Git 来源）。

```bash
hiveagent skill update <name>
```

### skill search

搜索官方技能市场。

```bash
hiveagent skill search <keyword> [options]
```

| 选项 | 说明 |
|------|------|
| `--category <category>` | 按分类过滤：coding / writing / data / automation / other |
| `--sort <sort>` | 排序方式：downloads / rating / newest（默认） |

### skill publish

发布技能到官方市场。

```bash
hiveagent skill publish <name> [-c, --config <path>]
```

需要先通过 `hiveagent login` 登录。发布后需审核通过才会在市场中可见。

### skill earnings

查看开发者技能收入。

```bash
hiveagent skill earnings [options]
```

| 选项 | 说明 |
|------|------|
| `--month <month>` | 指定月份（如 2026-02） |

## hiveagent channel

渠道管理命令组。

### channel list

列出已配置的聊天平台。

```bash
hiveagent channel list [-c, --config <path>]
```

### channel test

发送测试消息到指定平台。

```bash
hiveagent channel test <name>
```

支持的平台名称：`webchat`、`dingtalk`。
