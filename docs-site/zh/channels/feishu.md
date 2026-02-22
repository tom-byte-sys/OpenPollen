# 飞书接入

OpenPollen 通过插件支持飞书 Bot，使用 WebSocket 长连接模式接收事件，无需公网 IP。

## 前置条件

1. 拥有飞书开放平台企业自建应用
2. 应用已启用机器人能力
3. 获取 App ID 和 App Secret

## 创建飞书应用

1. 登录[飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 在「添加应用能力」中添加**机器人**
4. 记录 `App ID` 和 `App Secret`
5. 在「事件与回调」中添加事件 `im.message.receive_v1`（接收消息）
6. 在「事件与回调」页面选择 **长连接** 作为接收方式
7. 申请以下权限并发布应用版本：
   - `im:message` — 获取与发送消息
   - `im:message.group_at_msg` — 接收群聊中@机器人的消息
   - `im:resource` — 获取消息中的资源文件（图片等）

## 配置

在 `openpollen.json` 中配置飞书：

```json5
{
  "channels": {
    "feishu": {
      "enabled": true,
      "appId": "${FEISHU_APP_ID}",
      "appSecret": "${FEISHU_APP_SECRET}",
      "groupPolicy": "mention"
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用 |
| `appId` | string | — | 应用 App ID |
| `appSecret` | string | — | 应用 App Secret |
| `groupPolicy` | string | `mention` | 群消息策略 |

### 群消息策略

| 值 | 行为 |
|----|------|
| `mention` | 仅当群成员 @机器人 时才响应（推荐） |
| `all` | 响应群内所有消息 |

## 使用

启动 OpenPollen 后，飞书 Bot 会自动通过 WebSocket 长连接接入：

```bash
openpollen start
```

```
  OpenPollen v0.1.0 已启动
  Gateway: http://127.0.0.1:18800
  飞书 Bot: 已连接 (WebSocket 模式)
```

### 单聊

直接向机器人发送消息即可。

### 群聊

在群中 @机器人 + 消息内容（当 `groupPolicy` 为 `mention` 时）。

## 消息格式

- **接收**：支持文本消息和图片消息
- **回复**：以纯文本格式回复
- **长度限制**：超过 18000 字符的回复会自动截断
- **图片处理**：飞书图片会自动下载到本地，由 Agent 分析内容

## 会话管理

在飞书对话中可以使用以下命令：

| 命令 | 说明 |
|------|------|
| `/new` | 重置会话，开始新对话 |
| `/resume` | 列出历史会话 |
| `/resume 1` | 恢复第 1 个历史会话 |

## 测试

```bash
# 检查飞书渠道状态
openpollen channel list

# 通过 Gateway API 发送测试消息
openpollen channel test feishu
```

## 常见问题

### 机器人不响应群消息

检查 `groupPolicy` 设置。如果为 `mention`，需要在群里 @机器人。同时确认应用已申请 `im:message.group_at_msg` 权限。

### 连接失败

1. 确认 `appId` 和 `appSecret` 正确
2. 确认事件接收方式已设置为**长连接**
3. 检查是否设置了 HTTP 代理（飞书 SDK 不兼容 HTTP 代理到 HTTPS 的转发），如有需取消：
   ```bash
   unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
   ```

### 回复被截断

飞书消息有长度限制，OpenPollen 会自动截断超过 18000 字符的回复，并添加截断提示。

### 图片发送后无回复

确认应用已申请 `im:resource` 权限，且 Agent 的模型提供商支持图片识别。
