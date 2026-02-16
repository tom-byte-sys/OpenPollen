# WebChat

WebChat is HiveAgent's built-in web chat channel, providing a real-time conversation interface with streaming responses.

## Configuration

Enable WebChat in `hiveagent.json`:

```json5
{
  "channels": {
    "webchat": {
      "enabled": true,
      "port": 3001,
      "assistantName": "HiveAgent"
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable WebChat |
| `port` | number | `3001` | HTTP + WebSocket service port |
| `assistantName` | string | `HiveAgent` | Assistant name shown in UI |

## Architecture

WebChat uses WebSocket for bidirectional communication:

```
Browser UI  ←→  WebSocket  ←→  WebchatAdapter  ←→  MessageRouter  ←→  Agent
```

### Connection Flow

1. Client accesses the WebChat page via HTTP
2. Page establishes a WebSocket connection
3. Server performs protocol handshake (Protocol v3)
4. On success, returns connId and supported methods
5. Client sends RPC requests, server returns responses or events

### WebSocket Protocol

HiveAgent WebChat uses a custom RPC protocol (v3) with three frame types:

**Request Frame**
```json
{
  "type": "req",
  "id": "unique-id",
  "method": "chat.send",
  "params": { "text": "Hello" }
}
```

**Response Frame**
```json
{
  "type": "res",
  "id": "unique-id",
  "ok": true,
  "payload": {}
}
```

**Event Frame**
```json
{
  "type": "event",
  "event": "chat.delta",
  "payload": {
    "runId": "...",
    "state": "delta",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "Hello!" }]
    }
  }
}
```

### Chat Event States

| State | Description |
|-------|-------------|
| `delta` | Streaming output chunk |
| `final` | Complete response |
| `error` | Error occurred |
| `aborted` | User interrupted |

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_FRAME` | Invalid frame format |
| `METHOD_NOT_FOUND` | Method does not exist |
| `UNAVAILABLE` | Service unavailable |
| `INTERNAL` | Internal error |
| `BAD_PARAMS` | Invalid parameters |
| `ABORT_FAILED` | Abort failed |
| `SESSION_NOT_FOUND` | Session not found |

## Features

- **Streaming responses**: Agent replies pushed to browser in real-time
- **Session management**: Supports `/new`, `/resume` commands
- **Heartbeat**: Tick events sent every 30 seconds
- **Abort support**: Users can cancel Agent execution mid-stream
- **History**: Chat history persisted via Memory system
