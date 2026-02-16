# Gateway API

HiveAgent Gateway 提供 HTTP REST API，用于健康检查、状态查询和消息发送。

默认监听 `http://127.0.0.1:18800`。

## 认证

根据 `gateway.auth.mode` 配置：

| 模式 | 请求头 | 说明 |
|------|--------|------|
| `none` | 无 | 不需要认证（开发环境） |
| `api-key` | `X-API-Key: <key>` | API Key 认证 |
| `jwt` | `Authorization: Bearer <token>` | JWT 认证 |

## 端点

### GET /health

健康检查。

**响应**

```json
{
  "status": "ok",
  "timestamp": 1708000000000
}
```

### GET /api/status

查询运行状态。

**响应**

```json
{
  "status": "running",
  "activeSessions": 3,
  "processingCount": 1,
  "uptime": 3600.5
}
```

| 字段 | 说明 |
|------|------|
| `status` | 服务状态 |
| `activeSessions` | 活跃会话数 |
| `processingCount` | 正在处理的请求数 |
| `uptime` | 运行时间（秒） |

### POST /api/chat

发送消息给 Agent。

**请求**

```json
{
  "message": "你好，请帮我写一个排序算法",
  "userId": "user-123"
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 消息内容 |
| `userId` | string | 否 | 用户标识（未认证时使用） |

**响应**

```json
{
  "response": "好的，以下是一个快速排序的实现..."
}
```

**错误响应**

```json
{
  "error": "缺少 message 字段"
}
```

| HTTP 状态码 | 说明 |
|-------------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败 |
| 500 | 服务器内部错误 |

## CORS

Gateway 默认允许所有来源的跨域请求：

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

## WebSocket API

WebChat 渠道使用 WebSocket 协议进行实时通信。详见 [WebChat 文档](/zh/channels/webchat)。

## 使用示例

### cURL

```bash
# 健康检查
curl http://127.0.0.1:18800/health

# 查看状态
curl http://127.0.0.1:18800/api/status

# 发送消息
curl -X POST http://127.0.0.1:18800/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "userId": "test"}'

# 使用 API Key 认证
curl -X POST http://127.0.0.1:18800/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"message": "你好"}'
```

### JavaScript

```javascript
const response = await fetch('http://127.0.0.1:18800/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '帮我分析这段代码',
    userId: 'web-user',
  }),
});

const data = await response.json();
console.log(data.response);
```
