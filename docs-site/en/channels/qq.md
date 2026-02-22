# QQ Channel

OpenPollen supports QQ Channel Bot through a plugin, connecting to QQ's official Bot API v2 via WebSocket — no third-party SDK needed.

## Prerequisites

1. A developer account on [QQ Open Platform](https://q.qq.com) (personal or enterprise)
2. A QQ bot created with identity verification completed
3. AppID and AppSecret obtained
4. Sandbox channel configured (for development)

## Create a QQ Bot

1. Log in to [QQ Open Platform](https://q.qq.com)
2. Click "Create Bot", fill in name, avatar, and description
3. Go to the bot management page → "Development" → "Development Settings"
4. Copy `AppID`, click "Generate" to obtain `AppSecret`
5. Add your server's public IP to the **IP Whitelist**

## Sandbox Setup

A sandbox environment is required for development testing:

1. In the bot management page, find "Sandbox Configuration"
2. Select a QQ Channel where you are the owner/admin (< 20 members)
3. On mobile QQ, open the channel → "Settings" → "Bots" → add your test bot
4. Send messages by @mentioning the bot in a **text sub-channel** (not a forum sub-channel)

::: tip Sub-channel Types
QQ Channels contain multiple sub-channel types: text, forum, voice, etc. Bots can only send and receive messages in **text sub-channels**. Create one if your channel doesn't have any.
:::

## Configuration

Configure QQ Channel in `openpollen.json`:

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

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable this channel |
| `appId` | string | — | QQ Open Platform AppID |
| `appSecret` | string | — | QQ Open Platform AppSecret |
| `sandbox` | boolean | `false` | Use sandbox API endpoint |
| `groupPolicy` | string | `mention` | Channel message policy |

### Channel Message Policy

| Value | Behavior |
|-------|----------|
| `mention` | Only respond when @mentioned (recommended) |
| `all` | Respond to all messages (private domain bots only) |

### Sandbox Parameter

| Value | API Endpoint | Use Case |
|-------|-------------|----------|
| `false` | `api.sgroup.qq.com` | Production (recommended) |
| `true` | `sandbox.api.sgroup.qq.com` | Sandbox API |

::: info
Sandbox primarily controls who can access the bot on QQ Open Platform. You can generally keep `sandbox` as `false` and use the production API.
:::

## Usage

After starting OpenPollen, the QQ Channel bot automatically connects via WebSocket:

```bash
openpollen start
```

```
  OpenPollen v0.1.0 started
  Gateway: http://127.0.0.1:18800
  QQ Channel Bot: connected (WebSocket)
```

### Channel Messages

@mention the bot + your message in a text sub-channel (when `groupPolicy` is `mention`).

### Direct Messages

Send a direct message to the bot.

## Message Format

- **Receiving**: Text messages supported
- **Replying**: Plain text replies (passive reply with msg_id)
- **Length limit**: Replies exceeding 18,000 characters are automatically truncated

## Connection Mechanism

The QQ Channel plugin uses a persistent WebSocket connection:

1. **Access Token**: Obtained via `bots.qq.com/app/getAppAccessToken`, cached with auto-refresh 5 minutes before expiry
2. **Gateway**: Retrieved via `GET /gateway` for the WebSocket URL
3. **Authentication**: Sends Identify with token and intents after connecting
4. **Heartbeat**: Periodic heartbeat based on server-specified interval
5. **Auto-reconnect**: Reconnects after 5 seconds on disconnect, supports Resume to restore sessions

### Event Subscriptions

The plugin automatically subscribes to:

| Intent | Event | Description |
|--------|-------|-------------|
| `GUILD_MESSAGES` | `MESSAGE_CREATE` | Private domain: all channel messages |
| `PUBLIC_GUILD_MESSAGES` | `AT_MESSAGE_CREATE` | Public domain: @mention messages |
| `DIRECT_MESSAGE` | `DIRECT_MESSAGE_CREATE` | Direct messages |

## Private vs Public Domain Bots

| Feature | Private Domain | Public Domain |
|---------|---------------|---------------|
| Scope | Specific channels only | Any channel can add |
| Messages | All messages in channel | Only @mention messages |
| Publishing | No review needed | Requires review |
| Personal developers | Supported (channel scene) | Requires review |

## Testing

```bash
# Check channel status
openpollen channel list

# View logs to verify connection
openpollen logs -f
```

The following log entries indicate a successful connection:

```
QQ 频道 access_token 获取成功
获取 Gateway 成功
QQ 频道机器人已就绪
```

## FAQ

### Bot doesn't respond to messages

1. Make sure you're sending in a **text sub-channel** (not a forum sub-channel)
2. Make sure you @mentioned the bot (when `groupPolicy` is `mention`)
3. Check that the IP whitelist includes your server's public IP
4. Verify the sandbox channel is correctly configured

### Connection failure

Verify `appId` and `appSecret` are correct. Check that your server can reach `api.sgroup.qq.com`.

### WebSocket disconnects

The plugin automatically reconnects after 5 seconds and attempts to Resume the session. If disconnects are frequent, check network stability.

### Bot not showing in @ list

1. Confirm the bot has been added to the channel via "Channel Settings → Bots"
2. Confirm you're in a text-type sub-channel
3. Update mobile QQ to the latest version
