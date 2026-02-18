# WebChat 网页聊天

WebChat 是 OpenPollen 内置的网页聊天渠道，提供即时对话界面，支持流式响应。

## 配置

在 `openpollen.json` 中启用 WebChat：

```json5
{
  "channels": {
    "webchat": {
      "enabled": true,
      "port": 3001,
      "assistantName": "OpenPollen"
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用 |
| `port` | number | `3001` | HTTP + WebSocket 服务端口 |
| `assistantName` | string | `OpenPollen` | 界面显示的助手名称 |

## 架构

WebChat 基于 WebSocket 实现双向通信：

```
浏览器 UI  ←→  WebSocket  ←→  WebchatAdapter  ←→  MessageRouter  ←→  Agent
```

### 连接流程

1. 客户端通过 HTTP 访问 WebChat 页面
2. 页面加载后建立 WebSocket 连接
3. 服务端进行协议握手（Protocol v3）
4. 握手成功后返回 connId 和支持的方法列表
5. 客户端发送 RPC 请求，服务端返回响应或事件

### WebSocket 协议

OpenPollen WebChat 使用自定义 RPC 协议（v3），包含三种帧类型：

**请求帧（Request）**
```json
{
  "type": "req",
  "id": "unique-id",
  "method": "chat.send",
  "params": { "text": "你好" }
}
```

**响应帧（Response）**
```json
{
  "type": "res",
  "id": "unique-id",
  "ok": true,
  "payload": {}
}
```

**事件帧（Event）**
```json
{
  "type": "event",
  "event": "chat.delta",
  "payload": {
    "runId": "...",
    "state": "delta",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "你好！" }]
    }
  }
}
```

### 聊天事件状态

| 状态 | 说明 |
|------|------|
| `delta` | 流式输出片段 |
| `final` | 完整回复 |
| `error` | 错误 |
| `aborted` | 用户中断 |

### 错误码

| 错误码 | 说明 |
|--------|------|
| `INVALID_FRAME` | 无效帧格式 |
| `METHOD_NOT_FOUND` | 方法不存在 |
| `UNAVAILABLE` | 服务不可用 |
| `INTERNAL` | 内部错误 |
| `BAD_PARAMS` | 参数错误 |
| `ABORT_FAILED` | 中断失败 |
| `SESSION_NOT_FOUND` | 会话不存在 |

## 功能特性

- **流式响应**：Agent 回复实时推送到浏览器
- **会话管理**：支持 `/new`、`/resume` 命令
- **连接心跳**：每 30 秒发送 tick 事件保活
- **中断支持**：用户可中途取消 Agent 执行
- **历史记录**：基于 Memory 系统持久化聊天历史
