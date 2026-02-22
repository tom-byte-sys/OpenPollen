# DingTalk Integration

OpenPollen supports DingTalk Bot via plugin, using Stream mode to connect to DingTalk servers without requiring a public IP.

## Prerequisites

1. A DingTalk Open Platform enterprise internal application
2. Robot capability enabled for the application
3. Client ID and Client Secret obtained

## Create DingTalk Application

1. Log in to [DingTalk Open Platform](https://open.dingtalk.com/)
2. Create an enterprise internal application
3. Enable robot functionality in the app's Robot page
4. Note down `ClientID` and `ClientSecret`
5. Set message receiving mode to **Stream Mode**

## Configuration

Configure DingTalk in `openpollen.json`:

```json5
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "clientId": "${DINGTALK_CLIENT_ID}",
      "clientSecret": "${DINGTALK_CLIENT_SECRET}",
      "robotCode": "${DINGTALK_ROBOT_CODE}",
      "groupPolicy": "mention"
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable DingTalk |
| `clientId` | string | — | App Client ID |
| `clientSecret` | string | — | App Client Secret |
| `robotCode` | string | — | Robot code (optional, defaults to clientId) |
| `groupPolicy` | string | `mention` | Group message policy |

### Group Message Policy

| Value | Behavior |
|-------|----------|
| `mention` | Only respond when @mentioned (recommended) |
| `all` | Respond to all messages in group |

## Usage

After starting OpenPollen, the DingTalk Bot connects automatically via Stream mode:

```bash
openpollen start
```

### Direct Messages

Send messages directly to the bot.

### Group Chat

@mention the bot + your message (when `groupPolicy` is `mention`).

## Message Format

- **Receiving**: Text messages and image messages supported
- **Replying**: Replies in Markdown format (`sampleMarkdown`)
- **Length limit**: Replies exceeding 18,000 characters are auto-truncated

### Image Support

The DingTalk plugin supports receiving images from users, including:

- **Standalone images** (`picture` message type)
- **Rich text with images** (`richText` message type, containing image and text blocks)

When an image is received, the plugin automatically:

1. Retrieves the image download URL via DingTalk Open API (using `downloadCode`)
2. Downloads the image to local storage (`~/.openpollen/sdk-workspace/uploads/`)
3. Passes the image path to the Agent, which uses the Read tool to analyze the image content

::: tip
Receiving image messages requires enabling the corresponding message type permissions in your DingTalk Open Platform app configuration.
:::

## Reply Mechanism

The DingTalk plugin uses two reply methods:

1. **Session Webhook**: Temporary callback URL provided with each message for async replies
2. **Open API**: Send messages proactively via DingTalk Open API (requires Access Token)

Access Tokens are cached and auto-refreshed 5 minutes before expiry.

## Testing

```bash
# Check DingTalk channel status
openpollen channel list

# Send test message via Gateway API
openpollen channel test dingtalk
```

## FAQ

### Bot not responding to group messages

Check the `groupPolicy` setting. If set to `mention`, you need to @mention the bot.

### Connection failure

Verify `clientId` and `clientSecret` are correct, and the app's message receiving mode is set to Stream Mode.

### Replies truncated

DingTalk has message length limits. OpenPollen auto-truncates replies exceeding 18,000 characters with a truncation notice.
