# Slack Messaging Skill

You can send messages to Slack using the bot token and the Slack Web API.

## Configuration

Slack credentials are stored in `slack.json` in the asset directory. Read this file to get:
- `bot_token`: The Slack bot token (`xoxb-...`)
- `default_channel`: The default channel ID to post to

## Sending a Message

To send a message to Slack, use `curl` with the `chat.postMessage` API:

```bash
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"channel\": \"$CHANNEL_ID\",
    \"text\": \"Your message here\"
  }"
```

Replace `$BOT_TOKEN` with the `bot_token` from `slack.json` and `$CHANNEL_ID` with the target channel ID (or use `default_channel`).

## Sending Rich Messages with Blocks

For formatted messages, use Slack's Block Kit:

```bash
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"channel\": \"$CHANNEL_ID\",
    \"text\": \"Fallback text\",
    \"blocks\": [
      {
        \"type\": \"section\",
        \"text\": {
          \"type\": \"mrkdwn\",
          \"text\": \"*Bold title*\nRegular text with _italic_ and `code`\"
        }
      }
    ]
  }"
```

## Finding the Slack Config

The `slack.json` file is located at the asset directory root. Read it with:

```bash
cat "$(dirname "$(which vibe-kanban)" 2>/dev/null || echo "/dev_assets")/../slack.json" 2>/dev/null || cat slack.json 2>/dev/null
```

Or check common locations:
- `./slack.json`
- `../slack.json`
- `../../dev_assets/slack.json`
