# Discord 接入

OpenPollen 通过插件支持 Discord Bot，使用 WebSocket Gateway 模式连接 Discord 服务器，无需公网 IP，部署简单。

## 前置条件

1. 一个 Discord 账号
2. 在 [Discord Developer Portal](https://discord.com/developers/applications) 创建一个 Application
3. 获取 Bot Token
4. 启用 **Message Content Intent**

## 创建 Discord Bot

### 1. 创建 Application

1. 登录 [Discord Developer Portal](https://discord.com/developers/applications)
2. 点击 **New Application**，输入名称并创建

### 2. 创建 Bot 并获取 Token

1. 在左侧菜单选择 **Bot**
2. 点击 **Reset Token** 获取 Bot Token
3. 妥善保存 Token

### 3. 启用 Message Content Intent

::: warning 重要
这是一个**特权意图 (Privileged Intent)**，必须手动启用，否则 Bot 无法读取消息内容。
:::

1. 在 Bot 页面找到 **Privileged Gateway Intents** 区域
2. 开启 **Message Content Intent**
3. 点击 **Save Changes**

### 4. 邀请 Bot 到服务器

1. 在左侧菜单选择 **OAuth2**
2. 在 **OAuth2 URL Generator** 中勾选 `bot` scope
3. 在 **Bot Permissions** 中勾选：
   - Send Messages
   - Read Message History
4. 复制生成的 URL，在浏览器中打开并选择服务器

## 配置

在 `openpollen.json` 中配置 Discord：

```json5
{
  "channels": {
    "discord": {
      "enabled": true,
      "token": "${DISCORD_BOT_TOKEN}",
      "groupPolicy": "mention"
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `token` | string | — | Discord Bot Token |
| `groupPolicy` | string | `mention` | 群消息策略 |

### 群消息策略

| 值 | 行为 |
|----|------|
| `mention` | 仅当频道成员 @Bot 时才响应（推荐） |
| `all` | 响应频道内所有消息 |

## 使用

启动 OpenPollen 后，Discord Bot 会自动通过 WebSocket Gateway 连接：

```bash
openpollen start
```

```
  OpenPollen v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  Discord Bot: YourBot#1234 (WebSocket)
```

### 私聊 (DM)

直接向 Bot 发送私信即可。

### 频道消息

在频道中 @Bot + 消息内容（当 `groupPolicy` 为 `mention` 时）。

## 消息格式

- **接收**：支持文本消息
- **回复**：纯文本回复
- **长度限制**：超过 2000 字符的回复会自动截断

## 工作原理

Discord 插件使用 [Gateway WebSocket](https://discord.com/developers/docs/events/gateway) 模式：

1. 使用 discord.js 库建立 WebSocket 连接到 Discord Gateway
2. 监听 `MessageCreate` 事件接收新消息
3. 过滤 Bot 消息，检查 mention 和群策略
4. 构建 `InboundMessage` 并交给 Agent 处理
5. 通过 Channel API 回复结果

这种模式由客户端主动发起出站连接，不需要公网 IP 或 HTTPS 证书。

## 常见问题

### Bot 不响应消息

1. 确认已在 Developer Portal 启用 **Message Content Intent**
2. 检查 `groupPolicy` 设置。如果为 `mention`，需要在频道中 @Bot
3. 确认 Bot 已被邀请到服务器并拥有正确权限

### 连接失败

确认 `token` 正确。检查日志中是否有认证错误。

### 网络问题

如果服务器在中国大陆，可能需要配置代理访问 Discord。设置环境变量：

```bash
export HTTPS_PROXY=http://your-proxy:port
```

### 回复被截断

Discord 消息长度限制为 2000 字符，超长回复会自动截断并添加提示。

### Message Content Intent 被拒绝

当 Bot 加入超过 100 个服务器后，Message Content Intent 需要通过 Discord 审核才能使用。小型 Bot（<100 个服务器）可以直接在 Developer Portal 开启。
