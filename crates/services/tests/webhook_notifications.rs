use services::services::{
    config::{WebhookConfig, WebhookProvider},
    webhook_notification::WebhookNotificationService,
};

/// Test Slack webhook integration
/// Skips if SLACK_WEBHOOK_URL environment variable is not set
#[tokio::test]
async fn test_slack_webhook_with_credentials() {
    let webhook_url = match std::env::var("SLACK_WEBHOOK_URL") {
        Ok(url) if !url.is_empty() => url,
        _ => {
            eprintln!("⏭️  Skipping Slack webhook test: SLACK_WEBHOOK_URL not set");
            return;
        }
    };

    eprintln!("🧪 Testing Slack webhook integration...");

    let service = WebhookNotificationService::new();
    let config = WebhookConfig {
        enabled: true,
        provider: WebhookProvider::Slack,
        webhook_url,
        pushover_user_key: None,
        telegram_chat_id: None,
    };

    // Send test notification
    service
        .send_notification(
            &config,
            "Vibe Kanban Test",
            "✅ Slack webhook integration test successful!\n\nThis is an automated test from the webhook notification system.",
        )
        .await;

    eprintln!("✅ Slack webhook test completed - check your Slack channel for the message");
}

/// Test Pushover webhook integration
/// Skips if PUSHOVER_API_TOKEN or PUSHOVER_USER_KEY environment variables are not set
#[tokio::test]
async fn test_pushover_webhook_with_credentials() {
    let api_token = match std::env::var("PUSHOVER_API_TOKEN") {
        Ok(token) if !token.is_empty() => token,
        _ => {
            eprintln!("⏭️  Skipping Pushover webhook test: PUSHOVER_API_TOKEN not set");
            return;
        }
    };

    let user_key = match std::env::var("PUSHOVER_USER_KEY") {
        Ok(key) if !key.is_empty() => key,
        _ => {
            eprintln!("⏭️  Skipping Pushover webhook test: PUSHOVER_USER_KEY not set");
            return;
        }
    };

    eprintln!("🧪 Testing Pushover webhook integration...");

    let service = WebhookNotificationService::new();
    let config = WebhookConfig {
        enabled: true,
        provider: WebhookProvider::Pushover,
        webhook_url: api_token,
        pushover_user_key: Some(user_key),
        telegram_chat_id: None,
    };

    // Send test notification
    service
        .send_notification(
            &config,
            "Vibe Kanban Test",
            "✅ Pushover integration test successful! This is an automated test from the webhook notification system.",
        )
        .await;

    eprintln!("✅ Pushover webhook test completed - check your mobile device for the notification");
}

/// Test Discord webhook integration
/// Skips if DISCORD_WEBHOOK_URL environment variable is not set
#[tokio::test]
async fn test_discord_webhook_with_credentials() {
    let webhook_url = match std::env::var("DISCORD_WEBHOOK_URL") {
        Ok(url) if !url.is_empty() => url,
        _ => {
            eprintln!("⏭️  Skipping Discord webhook test: DISCORD_WEBHOOK_URL not set");
            return;
        }
    };

    eprintln!("🧪 Testing Discord webhook integration...");

    let service = WebhookNotificationService::new();
    let config = WebhookConfig {
        enabled: true,
        provider: WebhookProvider::Discord,
        webhook_url,
        pushover_user_key: None,
        telegram_chat_id: None,
    };

    // Send test notification
    service
        .send_notification(
            &config,
            "Vibe Kanban Test",
            "✅ Discord webhook integration test successful!\n\nThis is an automated test from the webhook notification system.",
        )
        .await;

    eprintln!("✅ Discord webhook test completed - check your Discord channel for the message");
}

/// Test webhook configuration validation (always runs, no credentials needed)
#[test]
fn test_webhook_config_validation() {
    // Test Slack config
    let slack_config = WebhookConfig {
        enabled: true,
        provider: WebhookProvider::Slack,
        webhook_url: "https://hooks.slack.com/services/TEST".to_string(),
        pushover_user_key: None,
        telegram_chat_id: None,
    };
    assert_eq!(slack_config.provider, WebhookProvider::Slack);
    assert!(slack_config.enabled);

    // Test Pushover config
    let pushover_config = WebhookConfig {
        enabled: true,
        provider: WebhookProvider::Pushover,
        webhook_url: "test_token".to_string(),
        pushover_user_key: Some("test_user_key".to_string()),
        telegram_chat_id: None,
    };
    assert_eq!(pushover_config.provider, WebhookProvider::Pushover);
    assert!(pushover_config.pushover_user_key.is_some());

    // Test Discord config
    let discord_config = WebhookConfig {
        enabled: false,
        provider: WebhookProvider::Discord,
        webhook_url: "https://discord.com/api/webhooks/TEST".to_string(),
        pushover_user_key: None,
        telegram_chat_id: None,
    };
    assert_eq!(discord_config.provider, WebhookProvider::Discord);
    assert!(!discord_config.enabled);

    eprintln!("✅ Webhook config validation tests passed");
}

/// Test that WebhookNotificationService can be instantiated
#[test]
fn test_webhook_service_creation() {
    let service = WebhookNotificationService::new();
    // Just verify we can create the service
    drop(service);
    eprintln!("✅ WebhookNotificationService creation test passed");
}
