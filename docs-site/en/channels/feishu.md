# Feishu (Lark) Integration

OpenPollen supports Feishu (Lark) Bot via plugin, using WebSocket long-polling to receive events without requiring a public IP.

## Prerequisites

1. A Feishu Open Platform custom enterprise application
2. Bot capability enabled for the application
3. App ID and App Secret obtained

## Create Feishu Application

1. Log in to [Feishu Open Platform](https://open.feishu.cn/) (or [Lark Developer](https://open.larksuite.com/) for international)
2. Create a custom enterprise application
3. Add **Bot** capability under "Add App Capabilities"
4. Note down `App ID` and `App Secret`
5. Under "Events & Callbacks", add the event `im.message.receive_v1` (receive messages)
6. Set the event receiving method to **Long Connection (WebSocket)**
7. Request the following permissions and publish the app version:
   - `im:message` — Read and send messages
   - `im:message.group_at_msg` — Receive @bot messages in group chats
   - `im:resource` — Access resources (images) in messages

## Configuration

Configure Feishu in `openpollen.json`:

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

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable Feishu |
| `appId` | string | — | App ID |
| `appSecret` | string | — | App Secret |
| `groupPolicy` | string | `mention` | Group message policy |

### Group Message Policy

| Value | Behavior |
|-------|----------|
| `mention` | Only respond when @mentioned (recommended) |
| `all` | Respond to all messages in group |

## Usage

After starting OpenPollen, the Feishu Bot connects automatically via WebSocket:

```bash
openpollen start
```

### Direct Messages

Send messages directly to the bot.

### Group Chat

@mention the bot + your message (when `groupPolicy` is `mention`).

## Message Format

- **Receiving**: Text messages and image messages supported
- **Replying**: Replies in plain text format
- **Length limit**: Replies exceeding 18,000 characters are auto-truncated
- **Image handling**: Feishu images are automatically downloaded locally for Agent analysis

## Session Management

The following commands are available in Feishu conversations:

| Command | Description |
|---------|-------------|
| `/new` | Reset session, start a new conversation |
| `/resume` | List historical sessions |
| `/resume 1` | Resume the 1st historical session |

## Testing

```bash
# Check Feishu channel status
openpollen channel list

# Send test message via Gateway API
openpollen channel test feishu
```

## FAQ

### Bot not responding to group messages

Check the `groupPolicy` setting. If set to `mention`, you need to @mention the bot. Also verify the app has the `im:message.group_at_msg` permission.

### Connection failure

1. Verify `appId` and `appSecret` are correct
2. Confirm event receiving method is set to **Long Connection**
3. Check for HTTP proxy settings (Feishu SDK doesn't support HTTP proxy to HTTPS). If set, unset them:
   ```bash
   unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
   ```

### Replies truncated

Feishu has message length limits. OpenPollen auto-truncates replies exceeding 18,000 characters with a truncation notice.

### No reply after sending image

Verify the app has the `im:resource` permission and the Agent's model provider supports image recognition.
