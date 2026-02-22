# Discord Integration

OpenPollen supports Discord Bot via plugin, using WebSocket Gateway mode to connect to Discord servers without requiring a public IP. Simple deployment.

## Prerequisites

1. A Discord account
2. An Application created on [Discord Developer Portal](https://discord.com/developers/applications)
3. Bot Token obtained
4. **Message Content Intent** enabled

## Create a Discord Bot

### 1. Create an Application

1. Log in to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, enter a name and create

### 2. Create Bot and Get Token

1. Select **Bot** from the left menu
2. Click **Reset Token** to get the Bot Token
3. Save the Token securely

### 3. Enable Message Content Intent

::: warning Important
This is a **Privileged Intent** that must be manually enabled, otherwise the Bot cannot read message content.
:::

1. On the Bot page, find the **Privileged Gateway Intents** section
2. Enable **Message Content Intent**
3. Click **Save Changes**

### 4. Invite Bot to Server

1. Select **OAuth2** from the left menu
2. In **OAuth2 URL Generator**, check the `bot` scope
3. In **Bot Permissions**, check:
   - Send Messages
   - Read Message History
4. Copy the generated URL, open it in a browser and select a server

## Configuration

Configure Discord in `openpollen.json`:

```json5
{
  "channels": {
    "discord": {
      "enabled": true,
      "token": "${DISCORD_BOT_TOKEN}",
      "groupPolicy": "mention"
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable Discord |
| `token` | string | — | Discord Bot Token |
| `groupPolicy` | string | `mention` | Group message policy |

### Group Message Policy

| Value | Behavior |
|-------|----------|
| `mention` | Only respond when @mentioned (recommended) |
| `all` | Respond to all messages in channel |

## Usage

After starting OpenPollen, the Discord Bot connects automatically via WebSocket Gateway:

```bash
openpollen start
```

```
  OpenPollen v0.1.0 started
  Gateway: http://127.0.0.1:18800
  Discord Bot: YourBot#1234 (WebSocket)
```

### Direct Messages

Send messages directly to the Bot.

### Channel Messages

@mention the Bot + your message (when `groupPolicy` is `mention`).

## Message Format

- **Receiving**: Text messages supported
- **Replying**: Plain text replies
- **Length limit**: Replies exceeding 2,000 characters are auto-truncated

## How It Works

The Discord plugin uses [Gateway WebSocket](https://discord.com/developers/docs/events/gateway) mode:

1. Establishes a WebSocket connection to Discord Gateway using discord.js
2. Listens for `MessageCreate` events to receive new messages
3. Filters bot messages, checks mentions and group policy
4. Builds `InboundMessage` and passes to the Agent
5. Replies via Channel API

This mode initiates outbound connections from the client, requiring no public IP or HTTPS certificate.

## FAQ

### Bot not responding to messages

1. Verify **Message Content Intent** is enabled in the Developer Portal
2. Check the `groupPolicy` setting. If set to `mention`, you need to @mention the Bot
3. Confirm the Bot has been invited to the server with correct permissions

### Connection failure

Verify the `token` is correct. Check logs for authentication errors.

### Network issues

If your server is in mainland China, you may need a proxy to access Discord. Set the environment variable:

```bash
export HTTPS_PROXY=http://your-proxy:port
```

### Replies truncated

Discord has a 2,000 character message limit. Long replies are auto-truncated with a notice.

### Message Content Intent denied

When a Bot joins more than 100 servers, Message Content Intent requires Discord review. Small bots (<100 servers) can enable it directly in the Developer Portal.
