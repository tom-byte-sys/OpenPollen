# Slack 接入

OpenPollen 通过插件支持 Slack Bot，使用 Socket Mode 连接 Slack 服务器，无需公网 IP，部署简单。

## 前置条件

1. 一个 Slack 工作区 (Workspace) 的管理员权限
2. 在 [Slack API](https://api.slack.com/apps) 创建一个 App
3. 获取两个 Token：
   - **Bot Token** (`xoxb-`)：用于调用 Slack API
   - **App-Level Token** (`xapp-`)：用于 Socket Mode 连接

## 创建 Slack App

### 1. 创建 App

1. 登录 [Slack API](https://api.slack.com/apps)
2. 点击 **Create New App** > **From scratch**
3. 输入 App 名称，选择工作区

### 2. 启用 Socket Mode

1. 在左侧菜单选择 **Socket Mode**
2. 开启 **Enable Socket Mode**
3. 创建一个 App-Level Token：
   - 输入 Token 名称（如 `openpollen-socket`）
   - 添加 scope：`connections:write`
   - 点击 **Generate**
4. 保存生成的 `xapp-` 开头的 Token（这是 **App Token**）

### 3. 配置 Event Subscriptions

1. 在左侧菜单选择 **Event Subscriptions**
2. 开启 **Enable Events**
3. 在 **Subscribe to bot events** 中添加：
   - `message.channels` — 监听公共频道消息
   - `message.groups` — 监听私有频道消息
   - `message.im` — 监听私信
4. 点击 **Save Changes**

### 4. 配置 Bot 权限

1. 在左侧菜单选择 **OAuth & Permissions**
2. 在 **Bot Token Scopes** 中添加：
   - `chat:write` — 发送消息
   - `users:read` — 读取用户信息
   - `channels:history` — 读取公共频道历史
   - `groups:history` — 读取私有频道历史
   - `im:history` — 读取私信历史

### 5. 安装 App 到工作区

1. 在左侧菜单选择 **Install App**
2. 点击 **Install to Workspace**
3. 授权后保存 **Bot User OAuth Token**（`xoxb-` 开头，这是 **Bot Token**）

## 配置

在 `openpollen.json` 中配置 Slack：

```json5
{
  "channels": {
    "slack": {
      "enabled": true,
      "botToken": "${SLACK_BOT_TOKEN}",
      "appToken": "${SLACK_APP_TOKEN}",
      "groupPolicy": "mention"
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `botToken` | string | — | Bot User OAuth Token (`xoxb-` 开头) |
| `appToken` | string | — | App-Level Token (`xapp-` 开头) |
| `groupPolicy` | string | `mention` | 群消息策略 |

### 两种 Token 的区别

| Token | 前缀 | 用途 | 获取位置 |
|-------|------|------|----------|
| Bot Token | `xoxb-` | 调用 Slack Web API（发消息、获取用户信息等） | OAuth & Permissions |
| App Token | `xapp-` | 建立 Socket Mode WebSocket 连接 | Basic Information > App-Level Tokens |

### 群消息策略

| 值 | 行为 |
|----|------|
| `mention` | 仅当频道成员 @Bot 时才响应（推荐） |
| `all` | 响应频道内所有消息 |

## 使用

启动 OpenPollen 后，Slack Bot 会自动通过 Socket Mode 连接：

```bash
openpollen start
```

```
  OpenPollen v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  Slack Bot: @openpollen (Socket Mode)
```

### 私信 (DM)

在 Slack 中直接向 Bot 发送私信即可。

### 频道消息

在频道中 @Bot + 消息内容（当 `groupPolicy` 为 `mention` 时）。频道消息会使用线程回复。

邀请 Bot 到频道：在频道中输入 `/invite @your-bot-name`。

## 消息格式

- **接收**：支持文本消息
- **回复**：纯文本回复，频道消息使用线程回复
- **长度限制**：Slack 消息无严格长度限制，但过长消息可能影响阅读体验

## 工作原理

Slack 插件使用 [Socket Mode](https://api.slack.com/apis/socket-mode) 连接：

1. 使用 App Token 建立 WebSocket 连接到 Slack
2. 监听 `message` 事件接收新消息
3. 调用 `ack()` 确认事件接收
4. 过滤 Bot 消息和子类型消息
5. 构建 `InboundMessage` 并交给 Agent 处理
6. 通过 Web API `chat.postMessage` 回复结果

Socket Mode 由客户端发起出站 WebSocket 连接，不需要公网 IP 或配置 Request URL。

## 常见问题

### Bot 不响应消息

1. 确认已在 Event Subscriptions 中添加正确的事件
2. 检查 `groupPolicy` 设置。如果为 `mention`，需要在频道中 @Bot
3. 确认 Bot 已被邀请到频道
4. 检查 Bot Token 和 App Token 是否填写正确

### Token 前缀说明

- `xoxb-` 开头：Bot Token，用于 API 调用
- `xapp-` 开头：App Token，用于 Socket Mode 连接
- 两者缺一不可，请确保没有混淆

### Socket Mode 连接失败

1. 确认 App Token 具有 `connections:write` scope
2. 确认 Socket Mode 已在 App 设置中启用
3. 检查网络连接

### 网络问题

如果服务器在中国大陆，可能需要配置代理访问 Slack。设置环境变量：

```bash
export HTTPS_PROXY=http://your-proxy:port
```

### Bot 不回复线程消息

当前版本仅监听频道和私信的新消息，不自动跟踪线程内的后续对话。每条 @mention 消息会创建独立的线程回复。
