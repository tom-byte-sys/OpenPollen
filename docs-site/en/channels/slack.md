# Slack Integration

OpenPollen supports Slack Bot via plugin, using Socket Mode to connect to Slack servers without requiring a public IP. Simple deployment.

## Prerequisites

1. Admin access to a Slack workspace
2. An App created on [Slack API](https://api.slack.com/apps)
3. Two tokens obtained:
   - **Bot Token** (`xoxb-`): for calling Slack APIs
   - **App-Level Token** (`xapp-`): for Socket Mode connection

## Create a Slack App

### 1. Create the App

1. Log in to [Slack API](https://api.slack.com/apps)
2. Click **Create New App** > **From scratch**
3. Enter the App name and select a workspace

### 2. Enable Socket Mode

1. Select **Socket Mode** from the left menu
2. Enable **Enable Socket Mode**
3. Create an App-Level Token:
   - Enter a token name (e.g., `openpollen-socket`)
   - Add scope: `connections:write`
   - Click **Generate**
4. Save the generated `xapp-` prefixed token (this is the **App Token**)

### 3. Configure Event Subscriptions

1. Select **Event Subscriptions** from the left menu
2. Enable **Enable Events**
3. Under **Subscribe to bot events**, add:
   - `message.channels` — Listen to public channel messages
   - `message.groups` — Listen to private channel messages
   - `message.im` — Listen to direct messages
4. Click **Save Changes**

### 4. Configure Bot Permissions

1. Select **OAuth & Permissions** from the left menu
2. Under **Bot Token Scopes**, add:
   - `chat:write` — Send messages
   - `users:read` — Read user info
   - `channels:history` — Read public channel history
   - `groups:history` — Read private channel history
   - `im:history` — Read DM history

### 5. Install App to Workspace

1. Select **Install App** from the left menu
2. Click **Install to Workspace**
3. After authorization, save the **Bot User OAuth Token** (`xoxb-` prefix, this is the **Bot Token**)

## Configuration

Configure Slack in `openpollen.json`:

```json5
{
  "channels": {
    "slack": {
      "enabled": true,
      "botToken": "${SLACK_BOT_TOKEN}",
      "appToken": "${SLACK_APP_TOKEN}",
      "groupPolicy": "mention"
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable Slack |
| `botToken` | string | — | Bot User OAuth Token (`xoxb-` prefix) |
| `appToken` | string | — | App-Level Token (`xapp-` prefix) |
| `groupPolicy` | string | `mention` | Group message policy |

### Two Types of Tokens

| Token | Prefix | Purpose | Where to Get |
|-------|--------|---------|--------------|
| Bot Token | `xoxb-` | Slack Web API calls (send messages, get user info, etc.) | OAuth & Permissions |
| App Token | `xapp-` | Socket Mode WebSocket connection | Basic Information > App-Level Tokens |

### Group Message Policy

| Value | Behavior |
|-------|----------|
| `mention` | Only respond when @mentioned (recommended) |
| `all` | Respond to all messages in channel |

## Usage

After starting OpenPollen, the Slack Bot connects automatically via Socket Mode:

```bash
openpollen start
```

```
  OpenPollen v0.1.0 started
  Gateway: http://127.0.0.1:18800
  Slack Bot: @openpollen (Socket Mode)
```

### Direct Messages

Send messages directly to the Bot in Slack.

### Channel Messages

@mention the Bot + your message (when `groupPolicy` is `mention`). Channel messages use threaded replies.

To invite the Bot to a channel: type `/invite @your-bot-name` in the channel.

## Message Format

- **Receiving**: Text messages supported
- **Replying**: Plain text replies; channel messages use threaded replies
- **Length limit**: Slack has no strict message length limit, but very long messages may affect readability

## How It Works

The Slack plugin uses [Socket Mode](https://api.slack.com/apis/socket-mode) connection:

1. Establishes a WebSocket connection to Slack using the App Token
2. Listens for `message` events to receive new messages
3. Calls `ack()` to acknowledge event receipt
4. Filters bot messages and subtype messages
5. Builds `InboundMessage` and passes to the Agent
6. Replies via Web API `chat.postMessage`

Socket Mode initiates an outbound WebSocket connection from the client, requiring no public IP or Request URL configuration.

## FAQ

### Bot not responding to messages

1. Verify correct events are added in Event Subscriptions
2. Check the `groupPolicy` setting. If set to `mention`, you need to @mention the Bot
3. Confirm the Bot has been invited to the channel
4. Verify both Bot Token and App Token are correctly configured

### Token prefix guide

- `xoxb-` prefix: Bot Token, for API calls
- `xapp-` prefix: App Token, for Socket Mode connection
- Both are required; make sure they are not mixed up

### Socket Mode connection failure

1. Verify the App Token has the `connections:write` scope
2. Confirm Socket Mode is enabled in App settings
3. Check network connectivity

### Network issues

If your server is in mainland China, you may need a proxy to access Slack. Set the environment variable:

```bash
export HTTPS_PROXY=http://your-proxy:port
```

### Bot not replying to thread messages

The current version only listens for new messages in channels and DMs. It does not automatically follow up on subsequent conversations within a thread. Each @mention message creates an independent threaded reply.
