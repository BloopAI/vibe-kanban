# Add Webhook Notifications for Upgrade Alerts

## Summary

Implements webhook-based upgrade notifications for Vibe Kanban, enabling users running the application on remote servers to receive alerts when a new version is available. This feature supports Slack, Discord, Pushover, Telegram, and custom webhook endpoints.

## Motivation

Users running Vibe Kanban on remote servers (VPS, cloud instances, etc.) currently have no way to be notified when the application is upgraded. Desktop notifications (sound/push) only work locally. This PR adds webhook support to send notifications to external services, making it ideal for:

- Remote server deployments
- Team notifications via Slack/Discord
- Mobile alerts via Pushover/Telegram
- Integration with custom notification systems

## Changes

### Backend

#### Config System (v8)
- Created new config version v8 with backward-compatible migration from v7
- Added `upgrade_notifications_enabled` boolean flag
- Added `webhooks` array to `NotificationConfig`
- New `WebhookConfig` struct with provider-specific fields
- New `WebhookProvider` enum (Slack, Discord, Pushover, Telegram, Generic)

**Files:**
- `crates/services/src/services/config/versions/v8.rs` (new)
- `crates/services/src/services/config/mod.rs`
- `crates/services/src/services/config/versions/mod.rs`

#### Webhook Service
- Created `WebhookNotificationService` for sending HTTP webhook requests
- Provider-specific payload formatting:
  - **Slack**: Rich blocks with structured content
  - **Discord**: Embed messages with color coding
  - **Pushover**: Push notification API integration
  - **Telegram**: Bot API with markdown formatting
  - **Generic**: Standard JSON payload for custom endpoints
- Async notification sending using `reqwest` (already in dependencies)
- Comprehensive error handling and logging

**Files:**
- `crates/services/src/services/webhook_notification.rs` (new)
- `crates/services/src/services/mod.rs`

#### Notification Integration
- Enhanced `NotificationService` with `notify_upgrade()` method
- Integrated webhook notifications alongside existing OS-level notifications
- Modified startup flow in `LocalDeployment` to detect version changes
- Non-blocking async notification dispatch on upgrade

**Files:**
- `crates/services/src/services/notification.rs`
- `crates/local-deployment/src/lib.rs`

### Frontend

#### Webhook Configuration UI
- New `WebhookConfigurationSection` component for managing webhooks
- Features:
  - Add/remove/configure multiple webhooks
  - Provider selection dropdown
  - Provider-specific input fields (Pushover user key, Telegram chat ID)
  - Enable/disable controls per webhook
  - Expandable configuration panels
  - Input validation and provider-specific placeholders
  - Helper text for each provider
- Integrated into Settings page after notifications section

**Files:**
- `frontend/src/components/settings/WebhookConfigurationSection.tsx` (new)
- `frontend/src/pages/settings/GeneralSettings.tsx`

### Documentation

#### User Documentation
- Created comprehensive webhook notifications guide
- Added webhook section to global settings documentation
- Updated main README with feature list
- Updated docs navigation structure

**Files:**
- `docs/configuration-customisation/webhook-notifications.mdx` (new)
- `docs/configuration-customisation/global-settings.mdx`
- `docs/docs.json`
- `README.md`

#### Technical Documentation
- Created detailed implementation guide for developers
- Includes architecture overview, payload formats, testing instructions

**Files:**
- `UPGRADE_NOTIFICATIONS.md` (new)

## Screenshots

### Webhook Configuration UI
![Webhook Settings](./docs/images/webhook-notifications-settings.png)
*Note: Screenshot to be added - shows the webhook configuration section in Settings*

### Example Notifications
- Slack: Rich formatted message with blocks
- Discord: Embedded message with color
- Pushover: Mobile push notification
- Telegram: Markdown formatted bot message

## Testing

### Manual Testing
1. Configure a webhook in Settings (e.g., Slack or Discord test channel)
2. Enable upgrade notifications
3. Save settings
4. Modify `Cargo.toml` version to simulate an upgrade
5. Restart application
6. Verify notification is received in configured channel

### Automated Testing
```bash
# Generate TypeScript types
npm run generate-types

# Check backend compiles
npm run backend:check

# Check frontend compiles
npm run frontend:check

# Run full dev environment
npm run dev
```

## Backward Compatibility

- ✅ Full backward compatibility with v7 configs
- ✅ Automatic migration to v8 on first startup
- ✅ Default values for new fields prevent breaking changes
- ✅ Existing notification functionality unchanged
- ✅ No new external dependencies added

## Dependencies

**No new dependencies required.** Uses existing dependencies:
- `reqwest` - Already in use for HTTP requests
- `serde_json` - Already in use for JSON serialization
- `chrono` - Already in use for timestamps

## Security Considerations

- Webhook URLs and API tokens stored securely in config file
- All webhook requests use HTTPS
- Credentials not logged
- User must explicitly enable and configure webhooks
- Input validation on webhook URLs

## Future Enhancements

Potential follow-up features (not in scope for this PR):
- [ ] Test notification button in UI
- [ ] Webhook history/logging
- [ ] Rate limiting
- [ ] Retry logic with exponential backoff
- [ ] Additional providers (Microsoft Teams, Mattermost)
- [ ] Customizable notification templates
- [ ] Notification filtering by update type (major/minor/patch)

## Checklist

- [x] Backend implementation complete
- [x] Frontend UI implementation complete
- [x] Config migration tested (v7 → v8)
- [x] User documentation written
- [x] Technical documentation written
- [x] Backward compatibility maintained
- [x] No new dependencies required
- [x] Error handling implemented
- [x] Security considerations addressed
- [ ] Screenshots added to docs
- [ ] Tested with real webhook endpoints

## Related Issues

Closes #[ISSUE_NUMBER] (if applicable)

## Breaking Changes

None. This is a fully backward-compatible feature addition.

## Migration Guide

No migration required. Users can opt-in to webhook notifications through the Settings UI.

---

**Documentation Preview:**
- User Guide: `/docs/configuration-customisation/webhook-notifications`
- Settings: Navigate to Settings → Webhook Notifications
- Technical Details: `UPGRADE_NOTIFICATIONS.md`
