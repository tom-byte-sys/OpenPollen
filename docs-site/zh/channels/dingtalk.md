# 钉钉接入

OpenPollen 通过插件支持钉钉 Bot，使用 Stream 模式连接钉钉服务器，无需公网 IP。

## 前置条件

1. 拥有钉钉开放平台企业内部应用
2. 应用已启用机器人能力
3. 获取 Client ID 和 Client Secret

## 创建钉钉应用

1. 登录[钉钉开放平台](https://open.dingtalk.com/)
2. 创建企业内部应用
3. 在应用的「机器人」页面启用机器人功能
4. 记录 `ClientID` 和 `ClientSecret`
5. 在「消息接收模式」选择 **Stream 模式**

## 配置

在 `openpollen.json` 中配置钉钉：

```json5
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "clientId": "${DINGTALK_CLIENT_ID}",
      "clientSecret": "${DINGTALK_CLIENT_SECRET}",
      "robotCode": "${DINGTALK_ROBOT_CODE}",  // 可选
      "groupPolicy": "mention"
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `clientId` | string | — | 应用 Client ID |
| `clientSecret` | string | — | 应用 Client Secret |
| `robotCode` | string | — | 机器人编码（可选，默认用 clientId） |
| `groupPolicy` | string | `mention` | 群消息策略 |

### 群消息策略

| 值 | 行为 |
|----|------|
| `mention` | 仅当群成员 @机器人 时才响应（推荐） |
| `all` | 响应群内所有消息 |

## 使用

启动 OpenPollen 后，钉钉 Bot 会自动通过 Stream 模式连接：

```bash
openpollen start
```

```
  OpenPollen v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  钉钉 Bot: 已连接 (Stream 模式)
```

### 单聊

直接向机器人发送消息即可。

### 群聊

在群中 @机器人 + 消息内容（当 `groupPolicy` 为 `mention` 时）。

## 消息格式

- **接收**：支持文本消息
- **回复**：以 Markdown 格式回复（`sampleMarkdown` 消息类型）
- **长度限制**：超过 18000 字符的回复会自动截断

## 回复机制

钉钉插件使用两种回复方式：

1. **Session Webhook**：收到消息时钉钉提供的临时回调 URL，用于异步回复
2. **Open API**：通过钉钉 Open API 主动发送消息（需要 Access Token）

Access Token 会自动缓存，过期前 5 分钟自动刷新。

## 测试

```bash
# 检查钉钉渠道状态
openpollen channel list

# 通过 Gateway API 发送测试消息
openpollen channel test dingtalk
```

## 常见问题

### 机器人不响应群消息

检查 `groupPolicy` 设置。如果为 `mention`，需要在群里 @机器人。

### 连接失败

确认 `clientId` 和 `clientSecret` 正确，且应用的「消息接收模式」已设置为 Stream 模式。

### 回复被截断

钉钉消息有长度限制，OpenPollen 会自动截断超过 18000 字符的回复，并添加截断提示。
