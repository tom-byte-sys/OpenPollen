# Email 接入

OpenPollen 通过插件支持 Email 渠道，使用 IMAP 收取邮件、SMTP 发送回复。采用客户端拉取模式，无需公网 IP 或内网穿透，部署在任何能上网的机器上即可工作。

## 前置条件

1. 一个支持 IMAP/SMTP 的邮箱账号
2. 邮箱已开启 IMAP 服务
3. 获取 IMAP/SMTP 服务器地址和凭据

## 邮箱准备

### 常见邮箱配置

| 邮箱 | IMAP 服务器 | SMTP 服务器 | 备注 |
|------|-------------|-------------|------|
| Gmail | `imap.gmail.com:993` | `smtp.gmail.com:465` | 需生成[应用专用密码](https://myaccount.google.com/apppasswords) |
| QQ 邮箱 | `imap.qq.com:993` | `smtp.qq.com:465` | 需在设置中开启 IMAP 并获取授权码 |
| 163 邮箱 | `imap.163.com:993` | `smtp.163.com:465` | 需开启 IMAP 并获取授权码 |
| 阿里企业邮 | `imap.qiye.aliyun.com:993` | `smtp.qiye.aliyun.com:465` | 需在邮箱后台开启 IMAP |
| Outlook | `outlook.office365.com:993` | `smtp.office365.com:587` | SMTP 使用端口 587 + STARTTLS |

::: warning
大多数邮箱不能直接使用登录密码，需要生成**应用专用密码**或**授权码**。具体操作请查阅邮箱提供商的帮助文档。
:::

### Gmail 示例

1. 登录 [Google 账号安全设置](https://myaccount.google.com/security)
2. 确保已启用两步验证
3. 进入「应用专用密码」，生成一个新密码
4. 在 Gmail 设置中确认 IMAP 已启用

## 配置

在 `openpollen.json` 中配置 Email：

```json5
{
  "channels": {
    "email": {
      "enabled": true,
      "imapHost": "imap.gmail.com",
      "imapPort": 993,
      "imapUser": "${EMAIL_USER}",
      "imapPassword": "${EMAIL_PASSWORD}",
      "imapTls": true,
      "smtpHost": "smtp.gmail.com",
      "smtpPort": 465,
      "smtpUser": "${EMAIL_USER}",
      "smtpPassword": "${EMAIL_PASSWORD}",
      "smtpTls": true,
      "fromName": "OpenPollen Agent",
      "fromAddress": "${EMAIL_USER}",
      "pollIntervalSeconds": 30,
      "useIdle": true,
      "mailbox": "INBOX"
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `imapHost` | string | — | IMAP 服务器地址 |
| `imapPort` | number | `993` | IMAP 端口 |
| `imapUser` | string | — | IMAP 登录用户名 |
| `imapPassword` | string | — | IMAP 密码或授权码 |
| `imapTls` | boolean | `true` | 是否启用 TLS/SSL |
| `smtpHost` | string | — | SMTP 服务器地址 |
| `smtpPort` | number | `465` | SMTP 端口 |
| `smtpUser` | string | — | SMTP 登录用户名 |
| `smtpPassword` | string | — | SMTP 密码或授权码 |
| `smtpTls` | boolean | `true` | 是否启用 TLS/SSL |
| `fromName` | string | `OpenPollen Agent` | 发件人显示名称 |
| `fromAddress` | string | — | 发件人邮箱地址 |
| `pollIntervalSeconds` | number | `30` | 轮询间隔（秒），仅 `useIdle: false` 时生效 |
| `useIdle` | boolean | `true` | 是否使用 IMAP IDLE 实时推送 |
| `mailbox` | string | `INBOX` | 监听的邮箱文件夹 |
| `allowedSenders` | string[] | — | 发件人白名单（设置后只接受列表中的邮箱） |
| `blockedSenders` | string[] | — | 发件人黑名单 |
| `maxEmailBodyLength` | number | `10000` | 邮件正文最大字符数 |

### 发件人过滤

通过 `allowedSenders` 和 `blockedSenders` 控制哪些邮箱可以与 Agent 交互：

```json5
{
  "channels": {
    "email": {
      // ...
      "allowedSenders": ["alice@example.com", "bob@example.com"]
    }
  }
}
```

- 设置 `allowedSenders` 后，仅白名单中的邮箱可以触发 Agent
- 设置 `blockedSenders` 后，黑名单中的邮箱会被忽略
- 两者都不设置则接受所有发件人
- `noreply@` 和来自 `fromAddress` 自身的邮件始终被跳过

### Outlook 特殊配置

Outlook/Office 365 的 SMTP 使用 STARTTLS（端口 587），而非 SSL（端口 465）：

```json5
{
  "smtpHost": "smtp.office365.com",
  "smtpPort": 587,
  "smtpTls": false   // 端口 587 使用 STARTTLS，此处设为 false
}
```

## 使用

启动 OpenPollen 后，Email 渠道会自动连接邮箱服务器：

```bash
openpollen start
```

```
  OpenPollen v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  Email: xiangliang@gsyai.com (IMAP IDLE)
```

用户只需向配置的邮箱地址发送邮件，Agent 会自动回复到发件人邮箱。回复会保持在同一个邮件线程中。

## 消息格式

- **接收**：提取邮件纯文本正文，自动去除引用文本和回复标记
- **回复**：同时包含纯文本和 HTML 格式
- **附件**：不处理附件内容，但会在消息中标注附件列表（如 `[Attachments: report.pdf, image.png]`）
- **长度限制**：超过 `maxEmailBodyLength` 的正文会自动截断

## 工作原理

```
发件人邮箱                    邮件服务器                   OpenPollen
    |                            |                           |
    |--- 发送邮件 ------------->|                           |
    |                            |--- IMAP IDLE 通知 ------>|
    |                            |<-- IMAP 拉取邮件 --------|
    |                            |                           |-- Agent 处理
    |                            |<-- SMTP 发送回复 ---------|
    |<-- 收到回复 --------------|                           |
```

### 收邮件

Email 插件支持两种模式接收新邮件：

1. **IMAP IDLE**（默认）：与邮件服务器保持长连接，服务器有新邮件时实时推送通知，延迟最低
2. **轮询模式**：按 `pollIntervalSeconds` 间隔定期检查新邮件，作为 IDLE 不可用时的降级方案

设置 `useIdle: false` 可强制使用轮询模式。如果 IDLE 连接失败，插件会自动降级为轮询。

### 发邮件

回复通过 SMTP 发送，并设置 `In-Reply-To` 和 `References` 邮件头，确保在用户的邮件客户端中正确归入同一会话线程。

### 断线重连

IMAP 连接断开后，插件会自动重连，使用指数退避策略（1s → 2s → 4s → ... → 60s），避免频繁重连对服务器造成压力。

## 测试

```bash
# 检查 Email 渠道状态
openpollen channel list

# 通过 Gateway API 发送测试消息
openpollen channel test email
```

## 常见问题

### 连接失败：认证错误

- **Gmail**：确认使用的是应用专用密码而非账号密码，且 IMAP 已在 Gmail 设置中启用
- **QQ/163 邮箱**：使用的是授权码而非登录密码
- **阿里企业邮**：确认已在邮箱后台开启 IMAP 服务

### 收不到新邮件

1. 检查 `mailbox` 是否正确（默认 `INBOX`）
2. 确认邮件没有被邮箱的反垃圾规则拦截
3. 查看日志中是否有 IMAP 连接错误
4. 尝试设置 `"useIdle": false` 切换到轮询模式

### 回复进入垃圾邮件

发件人地址（`fromAddress`）与 SMTP 服务器不匹配，或域名未配置 SPF/DKIM 记录。使用邮箱提供商自带的 SMTP 服务通常不会有此问题。

### 大量 noreply 地址报错

收件箱中可能有来自 `noreply@` 地址的通知邮件，插件会自动跳过这类地址。如果仍有问题，可通过 `blockedSenders` 手动屏蔽。

### 为什么不需要公网 IP？

与 Webhook 模式的渠道（如钉钉、飞书）不同，Email 渠道采用客户端模式：OpenPollen **主动连接**到邮件服务器拉取邮件，而非等待外部推送。因此可以部署在局域网、家庭网络或任何能访问互联网的环境中。
