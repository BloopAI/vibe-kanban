## Feature Request: Webhook Notifications for Remote Server Deployments

### Problem Statement

Currently, Vibe Kanban users running the application on remote servers (VPS, cloud instances, etc.) have no way to be notified when the application is upgraded to a new version. Desktop notifications (sound/push) only work on local machines where the application has direct access to the operating system's notification system.

### Use Cases

1. **Remote Server Deployments**: Users running Vibe Kanban on headless servers cannot receive local notifications
2. **Team Notifications**: Development teams want to know when their shared Vibe Kanban instance is upgraded
3. **Mobile Alerts**: Users want to receive notifications on their mobile devices regardless of location
4. **Integration with Existing Tools**: Users want to integrate upgrade notifications with their existing notification infrastructure

### Proposed Solution

Implement webhook-based notifications that can send upgrade alerts to external services:

- **Slack**: Send notifications to team channels
- **Discord**: Post updates to Discord servers
- **Pushover**: Deliver push notifications to mobile devices
- **Telegram**: Send messages via Telegram bots
- **Generic Webhooks**: Support custom webhook endpoints for integration with other systems

### Expected Behavior

1. User configures webhook endpoints in Settings
2. When Vibe Kanban is upgraded to a new version, notifications are automatically sent to all enabled webhooks
3. Notifications include:
   - Old version number
   - New version number
   - Link to release notes (if available)
4. Users can enable/disable notifications and manage multiple webhook endpoints

### Configuration

Settings UI should include:
- Toggle to enable/disable upgrade notifications
- List of configured webhooks
- Add/remove webhook endpoints
- Provider selection (Slack, Discord, Pushover, Telegram, Generic)
- Provider-specific configuration fields (API keys, chat IDs, etc.)

### Technical Considerations

- Should not introduce new dependencies if possible
- Must be backward compatible with existing configurations
- Webhook URLs and API tokens should be stored securely
- Should handle webhook failures gracefully (log errors, don't block startup)
- Should support multiple webhooks simultaneously

### Alternatives Considered

1. **Email notifications**: Requires SMTP configuration, more complex setup
2. **Built-in notification server**: Requires additional infrastructure
3. **Polling-based checks**: Users would need to manually check for updates

Webhooks provide the most flexible, infrastructure-light solution that integrates with existing notification systems.

### Additional Context

This feature is particularly valuable for:
- Self-hosted deployments
- Enterprise users with existing notification infrastructure
- Teams using Vibe Kanban collaboratively
- Users who want to stay informed without actively monitoring the application

### Implementation Notes

See PR #1109 for complete implementation including:
- Backend webhook service
- Config v8 with migration support
- Frontend UI for webhook management
- Comprehensive documentation
- Support for 5 webhook providers
