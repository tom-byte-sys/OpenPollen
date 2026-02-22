# Email Integration

OpenPollen supports Email as a channel via plugin, using IMAP to receive emails and SMTP to send replies. It works in client-pull mode — no public IP or port forwarding required. Deploy on any machine with internet access.

## Prerequisites

1. An email account with IMAP/SMTP support
2. IMAP service enabled on the account
3. IMAP/SMTP server addresses and credentials

## Email Account Setup

### Common Email Providers

| Provider | IMAP Server | SMTP Server | Notes |
|----------|-------------|-------------|-------|
| Gmail | `imap.gmail.com:993` | `smtp.gmail.com:465` | Requires [App Password](https://myaccount.google.com/apppasswords) |
| Outlook | `outlook.office365.com:993` | `smtp.office365.com:587` | SMTP uses port 587 + STARTTLS |
| Yahoo | `imap.mail.yahoo.com:993` | `smtp.mail.yahoo.com:465` | Requires App Password |
| QQ Mail | `imap.qq.com:993` | `smtp.qq.com:465` | Requires authorization code |
| 163 Mail | `imap.163.com:993` | `smtp.163.com:465` | Requires authorization code |

::: warning
Most email providers do not allow direct login passwords for IMAP/SMTP. You typically need to generate an **App Password** or **authorization code**. Check your provider's documentation.
:::

### Gmail Example

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Ensure 2-Step Verification is enabled
3. Navigate to "App passwords" and generate a new one
4. Confirm IMAP is enabled in Gmail settings

## Configuration

Configure Email in `openpollen.json`:

```json5
{
  "channels": {
    "email": {
      "enabled": true,
      "imapHost": "imap.gmail.com",
      "imapPort": 993,
      "imapUser": "${EMAIL_USER}",
      "imapPassword": "${EMAIL_PASSWORD}",
      "imapTls": true,
      "smtpHost": "smtp.gmail.com",
      "smtpPort": 465,
      "smtpUser": "${EMAIL_USER}",
      "smtpPassword": "${EMAIL_PASSWORD}",
      "smtpTls": true,
      "fromName": "OpenPollen Agent",
      "fromAddress": "${EMAIL_USER}",
      "pollIntervalSeconds": 30,
      "useIdle": true,
      "mailbox": "INBOX"
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable Email channel |
| `imapHost` | string | — | IMAP server address |
| `imapPort` | number | `993` | IMAP port |
| `imapUser` | string | — | IMAP login username |
| `imapPassword` | string | — | IMAP password or app password |
| `imapTls` | boolean | `true` | Enable TLS/SSL for IMAP |
| `smtpHost` | string | — | SMTP server address |
| `smtpPort` | number | `465` | SMTP port |
| `smtpUser` | string | — | SMTP login username |
| `smtpPassword` | string | — | SMTP password or app password |
| `smtpTls` | boolean | `true` | Enable TLS/SSL for SMTP |
| `fromName` | string | `OpenPollen Agent` | Sender display name |
| `fromAddress` | string | — | Sender email address |
| `pollIntervalSeconds` | number | `30` | Polling interval in seconds (only when `useIdle: false`) |
| `useIdle` | boolean | `true` | Use IMAP IDLE for real-time notifications |
| `mailbox` | string | `INBOX` | Mailbox folder to monitor |
| `allowedSenders` | string[] | — | Sender whitelist (only listed addresses can interact) |
| `blockedSenders` | string[] | — | Sender blacklist |
| `maxEmailBodyLength` | number | `10000` | Maximum email body length in characters |

### Sender Filtering

Control which email addresses can interact with the Agent using `allowedSenders` and `blockedSenders`:

```json5
{
  "channels": {
    "email": {
      // ...
      "allowedSenders": ["alice@example.com", "bob@example.com"]
    }
  }
}
```

- When `allowedSenders` is set, only whitelisted addresses can trigger the Agent
- When `blockedSenders` is set, blacklisted addresses are ignored
- If neither is set, all senders are accepted
- `noreply@` addresses and emails from `fromAddress` itself are always skipped

### Outlook Configuration

Outlook/Office 365 uses STARTTLS on port 587 instead of SSL on port 465:

```json5
{
  "smtpHost": "smtp.office365.com",
  "smtpPort": 587,
  "smtpTls": false   // Port 587 uses STARTTLS, set to false here
}
```

## Usage

After starting OpenPollen, the Email channel connects to the mail server automatically:

```bash
openpollen start
```

```
  OpenPollen v0.1.0 started
  Gateway: http://127.0.0.1:18800
  Email: agent@example.com (IMAP IDLE)
```

Users simply send an email to the configured address, and the Agent replies to the sender's inbox. Replies are threaded in the same email conversation.

## Message Format

- **Receiving**: Extracts plain text body, automatically strips quoted text and reply markers
- **Replying**: Sends both plain text and HTML formats
- **Attachments**: Attachment contents are not processed, but a list is appended to the message (e.g., `[Attachments: report.pdf, image.png]`)
- **Length limit**: Bodies exceeding `maxEmailBodyLength` are auto-truncated

## How It Works

```
Sender                       Mail Server                  OpenPollen
  |                              |                           |
  |--- Send email ------------->|                           |
  |                              |--- IMAP IDLE notify ----->|
  |                              |<-- IMAP fetch email ------|
  |                              |                           |-- Agent processes
  |                              |<-- SMTP send reply -------|
  |<-- Receive reply ------------|                           |
```

### Receiving Emails

The Email plugin supports two modes for receiving new emails:

1. **IMAP IDLE** (default): Maintains a persistent connection to the mail server. The server pushes notifications when new mail arrives, providing the lowest latency.
2. **Polling mode**: Checks for new mail at regular intervals (`pollIntervalSeconds`). Used as a fallback when IDLE is unavailable.

Set `useIdle: false` to force polling mode. If the IDLE connection fails, the plugin automatically falls back to polling.

### Sending Replies

Replies are sent via SMTP with `In-Reply-To` and `References` headers set, ensuring proper threading in the recipient's email client.

### Auto-Reconnect

When the IMAP connection drops, the plugin automatically reconnects using exponential backoff (1s → 2s → 4s → ... → 60s), avoiding excessive reconnection attempts.

## Testing

```bash
# Check Email channel status
openpollen channel list

# Send test message via Gateway API
openpollen channel test email
```

## FAQ

### Authentication failed

- **Gmail**: Make sure you're using an App Password, not your account password. Confirm IMAP is enabled in Gmail settings.
- **Outlook**: Some organizations require OAuth2 authentication. Check with your IT admin.
- **QQ/163 Mail**: Use the authorization code, not your login password.

### Not receiving new emails

1. Check that `mailbox` is correct (default: `INBOX`)
2. Verify the email isn't being caught by spam filters
3. Check logs for IMAP connection errors
4. Try setting `"useIdle": false` to switch to polling mode

### Replies going to spam

The sender address (`fromAddress`) may not match the SMTP server, or the domain lacks SPF/DKIM records. Using your email provider's own SMTP service usually avoids this.

### Errors with noreply addresses

The inbox may contain notification emails from `noreply@` addresses. The plugin automatically skips these. If issues persist, manually block them via `blockedSenders`.

### Why no public IP needed?

Unlike webhook-based channels (e.g., DingTalk, Feishu), the Email channel uses a client-pull model: OpenPollen **actively connects** to the mail server to fetch emails, rather than waiting for external pushes. This means it works from behind NAT, in home networks, or any environment with internet access.
