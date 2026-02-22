# QQ 频道接入

OpenPollen 通过插件支持 QQ 频道机器人，使用 WebSocket 长连接对接 QQ 官方 Bot API v2，无需第三方 SDK。

## 前置条件

1. 拥有 [QQ 开放平台](https://q.qq.com) 开发者账号（个人或企业）
2. 已创建 QQ 机器人并完成实名认证
3. 获取 AppID 和 AppSecret
4. 已配置沙箱频道（开发阶段）

## 创建 QQ 机器人

1. 登录 [QQ 开放平台](https://q.qq.com)
2. 点击「创建机器人」，填写名称、头像、简介
3. 进入机器人管理页面，点击「开发」→「开发设置」
4. 复制 `AppID`，点击「生成」获取 `AppSecret`
5. 在「开发设置」中将服务器公网 IP 加入 **IP 白名单**

## 配置沙箱环境

开发阶段需要配置沙箱环境才能测试：

1. 在机器人管理页面找到「沙箱配置」
2. 选择一个你是频道主/管理员的 QQ 频道（成员 < 20 人）
3. 在手机 QQ 中打开该频道 →「设置」→「机器人」→ 添加你的测试机器人
4. 在频道的**文字子频道**（不是帖子子频道）中 @机器人发消息测试

::: tip 子频道类型
QQ 频道包含多种类型的子频道：文字、帖子、语音等。机器人只能在**文字子频道**中收发消息。如果频道中没有文字子频道，需要先创建一个。
:::

## 配置

在 `openpollen.json` 中配置 QQ 频道：

```json5
{
  "channels": {
    "qq": {
      "enabled": true,
      "appId": "${QQ_BOT_APP_ID}",
      "appSecret": "${QQ_BOT_APP_SECRET}",
      "sandbox": false,
      "groupPolicy": "mention"
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `appId` | string | — | QQ 开放平台 AppID |
| `appSecret` | string | — | QQ 开放平台 AppSecret |
| `sandbox` | boolean | `false` | 是否使用沙箱环境 API |
| `groupPolicy` | string | `mention` | 频道消息策略 |

### 频道消息策略

| 值 | 行为 |
|----|------|
| `mention` | 仅当 @机器人 时才响应（推荐） |
| `all` | 响应频道内所有消息（仅私域机器人） |

### sandbox 参数说明

| 值 | API 地址 | 适用场景 |
|----|----------|----------|
| `false` | `api.sgroup.qq.com` | 正式环境（推荐） |
| `true` | `sandbox.api.sgroup.qq.com` | 沙箱 API 环境 |

::: info
沙箱主要是在 QQ 开放平台控制谁能访问机器人，一般 `sandbox` 保持 `false` 使用正式 API 即可。
:::

## 使用

启动 OpenPollen 后，QQ 频道机器人会自动通过 WebSocket 连接：

```bash
openpollen start
```

```
  OpenPollen v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  QQ 频道 Bot: 已连接 (WebSocket)
```

### 频道消息

在文字子频道中 @机器人 + 消息内容（当 `groupPolicy` 为 `mention` 时）。

### 频道私信

直接向机器人发送私信。

## 消息格式

- **接收**：支持文本消息
- **回复**：以纯文本格式回复（被动回复，携带 msg_id）
- **长度限制**：超过 18000 字符的回复会自动截断

## 连接机制

QQ 频道插件使用 WebSocket 长连接：

1. **获取 Access Token**：通过 `bots.qq.com/app/getAppAccessToken` 接口获取，自动缓存并提前 5 分钟刷新
2. **获取 Gateway**：通过 `GET /gateway` 获取 WebSocket 地址
3. **WebSocket 鉴权**：连接后发送 Identify 携带 token 和 intents
4. **心跳保活**：根据服务端返回的间隔定时发送心跳
5. **断线重连**：连接断开后 5 秒自动重连，支持 Resume 恢复会话

### 事件订阅

插件自动订阅以下事件：

| Intent | 事件 | 说明 |
|--------|------|------|
| `GUILD_MESSAGES` | `MESSAGE_CREATE` | 私域：频道全量消息 |
| `PUBLIC_GUILD_MESSAGES` | `AT_MESSAGE_CREATE` | 公域：频道 @消息 |
| `DIRECT_MESSAGE` | `DIRECT_MESSAGE_CREATE` | 频道私信 |

## 私域 vs 公域机器人

| 特性 | 私域机器人 | 公域机器人 |
|------|-----------|-----------|
| 使用范围 | 指定频道 | 任意频道可添加 |
| 消息接收 | 频道内全量消息 | 仅 @机器人 的消息 |
| 上线要求 | 无需审核 | 需要审核上线 |
| 个人开发者 | 支持（频道场景） | 需审核 |

## 测试

```bash
# 检查渠道状态
openpollen channel list

# 查看日志确认连接
openpollen logs -f
```

日志中出现以下内容表示连接成功：

```
QQ 频道 access_token 获取成功
获取 Gateway 成功
QQ 频道机器人已就绪
```

## 常见问题

### 机器人不响应消息

1. 确认在**文字子频道**中发送消息（不是帖子子频道）
2. 确认已 @机器人（`groupPolicy` 为 `mention` 时）
3. 检查 IP 白名单是否包含服务器公网 IP
4. 检查沙箱频道是否正确配置

### 连接失败

确认 `appId` 和 `appSecret` 正确。检查网络是否能访问 `api.sgroup.qq.com`。

### WebSocket 断线

插件会自动在 5 秒后重连，并尝试 Resume 恢复会话。如果频繁断线，检查网络稳定性和心跳是否正常。

### @ 列表中看不到机器人

1. 确认机器人已通过「频道设置 → 机器人」添加到频道
2. 确认当前子频道是文字类型
3. 手机 QQ 需要更新到最新版本
