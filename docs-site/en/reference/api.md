# Gateway API

HiveAgent Gateway provides HTTP REST API for health checks, status queries, and message sending.

Default listen address: `http://127.0.0.1:18800`.

## Authentication

Based on `gateway.auth.mode` configuration:

| Mode | Header | Description |
|------|--------|-------------|
| `none` | None | No authentication (development) |
| `api-key` | `X-API-Key: <key>` | API Key authentication |
| `jwt` | `Authorization: Bearer <token>` | JWT authentication |

## Endpoints

### GET /health

Health check.

**Response**

```json
{
  "status": "ok",
  "timestamp": 1708000000000
}
```

### GET /api/status

Query runtime status.

**Response**

```json
{
  "status": "running",
  "activeSessions": 3,
  "processingCount": 1,
  "uptime": 3600.5
}
```

| Field | Description |
|-------|-------------|
| `status` | Service status |
| `activeSessions` | Active session count |
| `processingCount` | Requests being processed |
| `uptime` | Uptime in seconds |

### POST /api/chat

Send a message to the Agent.

**Request**

```json
{
  "message": "Hello, please write a sorting algorithm",
  "userId": "user-123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | Message content |
| `userId` | string | No | User identifier (used when unauthenticated) |

**Response**

```json
{
  "response": "Sure, here's a quicksort implementation..."
}
```

**Error Response**

```json
{
  "error": "Missing message field"
}
```

| HTTP Status | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad request |
| 401 | Authentication failed |
| 500 | Internal server error |

## CORS

Gateway allows all origins by default:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

## WebSocket API

WebChat channel uses WebSocket for real-time communication. See [WebChat documentation](/en/channels/webchat).

## Examples

### cURL

```bash
# Health check
curl http://127.0.0.1:18800/health

# Check status
curl http://127.0.0.1:18800/api/status

# Send message
curl -X POST http://127.0.0.1:18800/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "userId": "test"}'

# With API Key auth
curl -X POST http://127.0.0.1:18800/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"message": "Hello"}'
```

### JavaScript

```javascript
const response = await fetch('http://127.0.0.1:18800/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Help me analyze this code',
    userId: 'web-user',
  }),
});

const data = await response.json();
console.log(data.response);
```
