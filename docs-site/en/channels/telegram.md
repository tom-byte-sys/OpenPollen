# Telegram Integration

OpenPollen supports Telegram Bot via plugin, using Long Polling mode to connect to Telegram servers without requiring a public IP. Zero extra dependencies.

## Prerequisites

1. A Telegram account
2. A Bot created via [@BotFather](https://t.me/BotFather)
3. Bot Token obtained

## Create a Telegram Bot

1. Search for [@BotFather](https://t.me/BotFather) on Telegram and send `/newbot`
2. Follow the prompts to set a name and username
3. BotFather will return a Bot Token like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
4. Save the Token securely

### Optional Settings

You can also configure via BotFather:

- `/setdescription` — Set Bot description
- `/setabouttext` — Set Bot about text
- `/setuserpic` — Set Bot profile picture
- `/setcommands` — Set command menu

## Configuration

Configure Telegram in `openpollen.json`:

```json5
{
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "${TELEGRAM_BOT_TOKEN}",
      "pollingTimeout": 30,
      "groupPolicy": "mention",
      "proxy": "http://127.0.0.1:10809"  // Optional, needed in China
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable Telegram |
| `token` | string | — | Bot Token from BotFather |
| `pollingTimeout` | number | `30` | Long Polling timeout in seconds (1-60) |
| `groupPolicy` | string | `mention` | Group message policy |
| `proxy` | string | — | HTTP proxy URL (optional, takes priority over env vars) |

### Group Message Policy

| Value | Behavior |
|-------|----------|
| `mention` | Only respond when @mentioned (recommended) |
| `all` | Respond to all messages in group |

::: tip
When using `mention` policy, you may need to disable [Privacy Mode](https://core.telegram.org/bots/features#privacy-mode) in BotFather, otherwise the Bot can only receive `/command` and @mention messages in groups.
:::

## Usage

After starting OpenPollen, the Telegram Bot connects automatically via Long Polling:

```bash
openpollen start
```

```
  OpenPollen v0.1.0 started
  Gateway: http://127.0.0.1:18800
  Telegram Bot: @your_bot (Long Polling)
```

### Direct Messages

Send messages directly to the Bot.

### Group Chat

@mention the Bot + your message (when `groupPolicy` is `mention`).

To add the Bot to a group: invite it from the group settings.

## Message Format

- **Receiving**: Text messages and image messages supported
- **Replying**: Plain text replies
- **Length limit**: Replies exceeding 4,096 characters are auto-truncated

### Image Support

The Telegram plugin supports receiving images from users. When an image is received, the plugin automatically:

1. Selects the highest resolution version of the image
2. Downloads it via the Telegram File API to local storage (`~/.openpollen/sdk-workspace/uploads/`)
3. Passes the image path to the Agent, which uses the Read tool to analyze the image content

Users can send standalone images or images with captions.

## How It Works

The Telegram plugin uses [Long Polling](https://core.telegram.org/bots/api#getupdates) mode:

1. Call `getUpdates` and wait for new messages (default timeout: 30s)
2. Parse received `Update` objects
3. Build `InboundMessage` and pass to the Agent
4. Reply via `sendMessage` API
5. Loop back to step 1

This mode requires no public IP or HTTPS certificate, ideal for development and intranet deployment.

## Testing

```bash
# Check Telegram channel status
openpollen channel list

# Send test message via Gateway API
openpollen channel test telegram
```

## FAQ

### Bot not responding to group messages

1. Check the `groupPolicy` setting. If set to `mention`, you need to @mention the Bot
2. Confirm the Bot has been added to the group
3. Consider disabling Privacy Mode in BotFather if you need to respond to all messages

### Connection failure

Verify the `token` is correct. You can manually test:

```bash
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe
```

### Network issues

If your server is in mainland China, you need a proxy to access `api.telegram.org`. The recommended approach is to set the `proxy` field in the config:

```json5
"telegram": {
  "proxy": "http://127.0.0.1:10809"
}
```

This is preferred over environment variables because the proxy only affects Telegram, without interfering with domestic channels like DingTalk or Feishu.

If `proxy` is not set, the plugin will fall back to `HTTPS_PROXY` / `HTTP_PROXY` environment variables.

### Replies truncated

Telegram has a 4,096 character message limit. Long replies are auto-truncated with a notice.
