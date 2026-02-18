# Slack Messaging Skill

You can send messages to Slack using the bot token and the Slack Web API.

## Configuration

Two files provide Slack context:

1. **`slack.json`** — Credentials and default channel:
   - `bot_token`: The Slack bot token (`xoxb-...`)
   - `default_channel`: The default channel ID to post to

2. **`slack_context.json`** (optional) — If this tick was triggered from Slack, this file contains:
   - `channel`: The channel where the mention happened
   - `thread_ts`: The message timestamp to reply in-thread

## Replying to a Slack Trigger

If `slack_context.json` exists, you MUST reply in the thread where you were mentioned. Read both files and use `thread_ts`:

```bash
SLACK_CONFIG=$(cat slack.json)
BOT_TOKEN=$(echo "$SLACK_CONFIG" | jq -r '.bot_token')

SLACK_CTX=$(cat slack_context.json 2>/dev/null)
if [ -n "$SLACK_CTX" ]; then
  CHANNEL=$(echo "$SLACK_CTX" | jq -r '.channel')
  THREAD_TS=$(echo "$SLACK_CTX" | jq -r '.thread_ts')

  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"channel\": \"$CHANNEL\",
      \"thread_ts\": \"$THREAD_TS\",
      \"text\": \"Your reply here\"
    }"
fi
```

## Sending a New Message

To post a new message (not in a thread), use `chat.postMessage` without `thread_ts`:

```bash
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"channel\": \"$CHANNEL_ID\",
    \"text\": \"Your message here\"
  }"
```

Replace `$CHANNEL_ID` with the target channel ID from `slack.json`'s `default_channel`.

## Sending Rich Messages with Blocks

For formatted messages, use Slack's Block Kit. Add `thread_ts` to reply in-thread:

```bash
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"channel\": \"$CHANNEL\",
    \"thread_ts\": \"$THREAD_TS\",
    \"text\": \"Fallback text\",
    \"blocks\": [
      {
        \"type\": \"section\",
        \"text\": {
          \"type\": \"mrkdwn\",
          \"text\": \"*Bold title*\nRegular text with _italic_ and \`code\`\"
        }
      }
    ]
  }"
```
