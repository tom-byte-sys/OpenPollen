# Telegram 接入

OpenPollen 通过插件支持 Telegram Bot，使用 Long Polling 模式连接 Telegram 服务器，无需公网 IP，零额外依赖。

## 前置条件

1. 一个 Telegram 账号
2. 通过 [@BotFather](https://t.me/BotFather) 创建一个 Bot
3. 获取 Bot Token

## 创建 Telegram Bot

1. 在 Telegram 中搜索 [@BotFather](https://t.me/BotFather) 并发送 `/newbot`
2. 按提示输入 Bot 名称和用户名
3. BotFather 会返回 Bot Token，格式类似 `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
4. 妥善保存 Token

### 可选设置

通过 BotFather 还可以配置：

- `/setdescription` — 设置 Bot 描述
- `/setabouttext` — 设置 Bot 简介
- `/setuserpic` — 设置 Bot 头像
- `/setcommands` — 设置命令菜单

## 配置

在 `openpollen.json` 中配置 Telegram：

```json5
{
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "${TELEGRAM_BOT_TOKEN}",
      "pollingTimeout": 30,
      "groupPolicy": "mention",
      "proxy": "http://127.0.0.1:10809"  // 可选，在中国大陆需要代理
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `token` | string | — | BotFather 生成的 Bot Token |
| `pollingTimeout` | number | `30` | Long Polling 超时秒数 (1-60) |
| `groupPolicy` | string | `mention` | 群消息策略 |
| `proxy` | string | — | HTTP 代理地址（可选，优先于环境变量） |

### 群消息策略

| 值 | 行为 |
|----|------|
| `mention` | 仅当群成员 @Bot 时才响应（推荐） |
| `all` | 响应群内所有消息 |

::: tip
使用 `mention` 策略时，需要在 BotFather 中关闭 [Privacy Mode](https://core.telegram.org/bots/features#privacy-mode)，否则 Bot 在群里只能收到 `/command` 和 @mention 消息。
:::

## 使用

启动 OpenPollen 后，Telegram Bot 会自动通过 Long Polling 连接：

```bash
openpollen start
```

```
  OpenPollen v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  Telegram Bot: @your_bot (Long Polling)
```

### 私聊

直接向 Bot 发送消息即可。

### 群聊

在群中 @Bot + 消息内容（当 `groupPolicy` 为 `mention` 时）。

将 Bot 添加到群组：在群设置中邀请 Bot 加入即可。

## 消息格式

- **接收**：支持文本消息和图片消息
- **回复**：纯文本回复
- **长度限制**：超过 4096 字符的回复会自动截断

### 图片支持

Telegram 插件支持接收用户发送的图片。收到图片后，插件会自动：

1. 选取最高分辨率的图片版本
2. 通过 Telegram File API 下载到本地 (`~/.openpollen/sdk-workspace/uploads/`)
3. 将图片路径传递给 Agent，Agent 使用 Read 工具识别并分析图片内容

用户可以发送单独的图片，或附带文字说明的图片。

## 工作原理

Telegram 插件使用 [Long Polling](https://core.telegram.org/bots/api#getupdates) 模式：

1. 调用 `getUpdates` 并等待新消息（默认超时 30 秒）
2. 收到消息后解析 `Update` 对象
3. 构建 `InboundMessage` 并交给 Agent 处理
4. 通过 `sendMessage` API 回复结果
5. 循环回到步骤 1

这种模式不需要公网 IP 或 HTTPS 证书，适合开发和内网部署。

## 测试

```bash
# 检查 Telegram 渠道状态
openpollen channel list

# 通过 Gateway API 发送测试消息
openpollen channel test telegram
```

## 常见问题

### Bot 不响应群消息

1. 检查 `groupPolicy` 设置。如果为 `mention`，需要在群里 @Bot
2. 确认 Bot 已加入群组
3. 如果需要响应所有消息，考虑在 BotFather 中关闭 Privacy Mode

### 连接失败

确认 `token` 正确。可手动验证：

```bash
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe
```

### 网络问题

如果服务器在中国大陆，需要配置代理访问 `api.telegram.org`。推荐在配置文件中设置 `proxy` 字段：

```json5
"telegram": {
  "proxy": "http://127.0.0.1:10809"
}
```

这种方式优于环境变量，因为代理仅对 Telegram 生效，不会影响钉钉、飞书等国内渠道的连接。

如果未配置 `proxy` 字段，插件会自动检测 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量作为备选。

### 回复被截断

Telegram 消息长度限制为 4096 字符，超长回复会自动截断并添加提示。
