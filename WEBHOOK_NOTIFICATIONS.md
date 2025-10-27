# Webhook Notifications for Task Completions - Implementation

## Overview

This implementation adds webhook-based notifications for task completions in Vibe Kanban, enabling users running the application on remote servers to receive alerts via Slack, Discord, Pushover, Telegram, or custom webhooks when tasks finish execution.

**User Documentation:** See [docs/configuration-customisation/webhook-notifications.mdx](./docs/configuration-customisation/webhook-notifications.mdx) for complete user-facing documentation.

## Features Implemented

###1. Multi-Platform Webhook Support
- **Slack**: Rich message formatting with blocks
- **Discord**: Embed messages with color coding
- **Pushover**: Push notifications with priority levels
- **Telegram**: Markdown-formatted messages
- **Generic**: Custom webhook endpoints with JSON payloads

### 2. Configuration System (v8)
- Backward-compatible config migration from v7 to v8
- New `webhook_notifications_enabled` flag to enable/disable webhook notifications
- Support for multiple webhook configurations
- Per-webhook enable/disable controls

### 3. Task Completion Notifications
- Integrates with existing notification system (`notify_execution_halted`)
- Sends webhooks when tasks:
  - Complete successfully ✅
  - Fail with errors ❌
  - Are cancelled by user 🛑
- Webhooks only sent if `webhook_notifications_enabled` is true

### 4. User Interface
- Dedicated webhook configuration section in Settings
- Provider-specific input fields (Pushover user key, Telegram chat ID)
- Enable/disable toggle for webhook notifications
- Add/remove/configure multiple webhooks
- Provider-specific placeholders and helper text

## Architecture

### Backend Components

#### 1. Config Version 8 (`crates/services/src/services/config/versions/v8.rs`)
```rust
pub struct NotificationConfig {
    pub sound_enabled: bool,
    pub push_enabled: bool,
    pub sound_file: SoundFile,
    pub webhook_notifications_enabled: bool,  // New field
    pub webhooks: Vec<WebhookConfig>,         // New field
}

pub struct WebhookConfig {
    pub enabled: bool,
    pub provider: WebhookProvider,
    pub webhook_url: String,
    pub pushover_user_key: Option<String>,
    pub telegram_chat_id: Option<String>,
}

pub enum WebhookProvider {
    Slack,
    Discord,
    Pushover,
    Telegram,
    Generic,
}
```

#### 2. Webhook Notification Service (`crates/services/src/services/webhook_notification.rs`)
- Async HTTP client using `reqwest` (already in dependencies)
- Provider-specific payload formatting
- Error handling and logging
- Concurrent notification sending

Key methods:
- `notify_all()`: Sends to all enabled webhooks
- `send_slack()`: Slack-specific formatting
- `send_discord()`: Discord embed formatting
- `send_pushover()`: Pushover API integration
- `send_telegram()`: Telegram bot API
- `send_generic()`: Generic JSON POST

#### 3. Notification Service Integration (`crates/services/src/services/notification.rs`)
- Modified `notify()` method to check `webhook_notifications_enabled` flag
- Calls `WebhookNotificationService::notify_all()` when conditions are met
- Respects existing notification flow (sound, push, then webhooks)

### Frontend Components

#### 1. Webhook Configuration Section (`frontend/src/components/settings/WebhookConfigurationSection.tsx`)
Reusable component featuring:
- Webhook notifications toggle
- Add/remove webhook endpoints
- Provider selection dropdown
- URL input with provider-specific placeholders
- Conditional fields (Pushover user key, Telegram chat ID)
- Expandable configuration panels
- Input validation and helper text

#### 2. Settings Integration (`frontend/src/pages/settings/GeneralSettings.tsx`)
- Integrated WebhookConfigurationSection component
- Draft state management for webhooks array
- Atomic save with config validation
- Unsaved changes detection

## Webhook Payload Formats

### Task Completion (Slack)
```json
{
  "text": "Task Complete: Implement user authentication",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "Task Complete: Implement user authentication"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "✅ 'Implement user authentication' completed successfully\nBranch: \"feature/auth\"\nExecutor: Claude Code"
      }
    }
  ]
}
```

### Task Completion (Discord)
```json
{
  "embeds": [{
    "title": "Task Complete: Implement user authentication",
    "description": "✅ 'Implement user authentication' completed successfully...",
    "color": 5814783,
    "footer": {
      "text": "Vibe Kanban"
    }
  }]
}
```

### Task Completion (Generic)
```json
{
  "title": "Task Complete: Implement user authentication",
  "message": "✅ 'Implement user authentication' completed successfully\nBranch: \"feature/auth\"\nExecutor: Claude Code",
  "timestamp": "2025-01-27T12:00:00Z"
}
```

## Configuration Migration

The system automatically migrates from v7 to v8:

```rust
impl From<v7::NotificationConfig> for NotificationConfig {
    fn from(old: v7::NotificationConfig) -> Self {
        Self {
            sound_enabled: old.sound_enabled,
            push_enabled: old.push_enabled,
            sound_file: old.sound_file,
            webhook_notifications_enabled: true, // Enabled by default
            webhooks: vec![], // Start with no webhooks
        }
    }
}
```

## Usage Instructions

### Setting up Slack Webhook
1. Go to Settings → Webhook Notifications
2. Toggle "Enable Webhook Notifications"
3. Click "Add Webhook"
4. Select "Slack" as the provider
5. Create an Incoming Webhook in your Slack workspace: https://api.slack.com/messaging/webhooks
6. Paste the webhook URL
7. Enable the webhook and save settings

### Setting up Discord Webhook
1. In your Discord server, go to Server Settings → Integrations → Webhooks
2. Create a webhook and copy the URL
3. In Vibe Kanban Settings, add a webhook with provider "Discord"
4. Paste the webhook URL and enable

### Setting up Pushover
1. Create a Pushover application at https://pushover.net/apps/build
2. Get your API token and user key
3. In Vibe Kanban Settings, add a webhook with provider "Pushover"
4. Enter API token in the webhook URL field
5. Enter user key in the "Pushover User Key" field

### Setting up Telegram
1. Create a bot with @BotFather on Telegram
2. Get the bot token
3. Get your chat ID (send a message to the bot and use the Telegram API)
4. In Vibe Kanban Settings, add a webhook with provider "Telegram"
5. Enter the full URL: `https://api.telegram.org/bot<TOKEN>/sendMessage`
6. Enter your chat ID in the "Telegram Chat ID" field

## Testing

To test the implementation:

1. **Backend Check**:
   ```bash
   npm run backend:check
   ```

2. **Frontend Check**:
   ```bash
   npm run frontend:check
   ```

3. **Manual Testing**:
   - Configure a webhook in Settings
   - Run a task with a coding agent
   - Verify notification is received when task completes/fails

## Files Changed

### Backend
- `crates/services/src/services/config/versions/v8.rs` (new)
- `crates/services/src/services/config/versions/mod.rs`
- `crates/services/src/services/config/mod.rs`
- `crates/services/src/services/webhook_notification.rs` (new)
- `crates/services/src/services/notification.rs`
- `crates/services/src/services/mod.rs`
- `crates/local-deployment/src/lib.rs`

### Frontend
- `frontend/src/components/settings/WebhookConfigurationSection.tsx` (new)
- `frontend/src/pages/settings/GeneralSettings.tsx`

### Documentation
- `docs/configuration-customisation/webhook-notifications.mdx` (new) - Complete webhook setup guide
- `docs/configuration-customisation/global-settings.mdx` - Updated with webhook notifications section
- `docs/docs.json` - Added webhook-notifications page to navigation
- `README.md` - Added webhook notifications to feature list

## Future Enhancements

Potential improvements for future iterations:

1. **Notification Testing**: Add a "Test Notification" button in the UI
2. **Webhook History**: Log sent notifications for debugging
3. **Rate Limiting**: Add rate limiting to prevent notification spam
4. **Retry Logic**: Implement exponential backoff for failed notifications
5. **More Providers**: Support for Microsoft Teams, Mattermost, etc.
6. **Notification Templates**: Customizable message templates
7. **Conditional Notifications**: Filter by task status or executor type

## Security Considerations

1. **Credential Storage**: Webhook URLs and API tokens are stored in the config file
2. **HTTPS Only**: All webhook providers require HTTPS endpoints
3. **No Logging**: Sensitive credentials are not logged
4. **User Control**: Users must explicitly enable and configure webhooks
5. **Validation**: Input validation on webhook URLs

## Dependencies

No new external dependencies were added. The implementation uses:
- `reqwest` (already in dependencies) - HTTP client
- `serde_json` (already in dependencies) - JSON serialization
- `chrono` (already in dependencies) - Timestamps

## Backward Compatibility

- Full backward compatibility with v7 configs
- Automatic migration to v8 on first startup
- Default values for new fields prevent breaking changes
- Existing notification functionality unchanged
