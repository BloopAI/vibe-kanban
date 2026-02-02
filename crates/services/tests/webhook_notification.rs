use services::services::config::{WebhookConfig, WebhookProvider};

#[test]
fn test_webhook_config_serialization() {
    let config = WebhookConfig {
        enabled: true,
        provider: WebhookProvider::Slack,
        webhook_url: "https://hooks.slack.com/services/xxx".to_string(),
        pushover_user_key: None,
        telegram_chat_id: None,
    };

    let json = serde_json::to_string(&config).unwrap();
    assert!(json.contains("SLACK"));
    assert!(json.contains("https://hooks.slack.com"));

    let deserialized: WebhookConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.provider, WebhookProvider::Slack);
    assert!(deserialized.enabled);
}

#[test]
fn test_webhook_provider_variants() {
    // Test all provider variants serialize correctly
    let providers = vec![
        (WebhookProvider::Slack, "SLACK"),
        (WebhookProvider::Discord, "DISCORD"),
        (WebhookProvider::Pushover, "PUSHOVER"),
        (WebhookProvider::Telegram, "TELEGRAM"),
        (WebhookProvider::Generic, "GENERIC"),
    ];

    for (provider, expected_str) in providers {
        let json = serde_json::to_string(&provider).unwrap();
        assert!(
            json.contains(expected_str),
            "Expected {} to contain {}",
            json,
            expected_str
        );

        let deserialized: WebhookProvider = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, provider);
    }
}

#[test]
fn test_webhook_config_with_optional_fields() {
    // Test Pushover config with user key
    let pushover_config = WebhookConfig {
        enabled: true,
        provider: WebhookProvider::Pushover,
        webhook_url: "https://api.pushover.net/1/messages.json?token=abc123".to_string(),
        pushover_user_key: Some("user_key_123".to_string()),
        telegram_chat_id: None,
    };

    let json = serde_json::to_string(&pushover_config).unwrap();
    assert!(json.contains("user_key_123"));
    assert!(!json.contains("telegram_chat_id")); // Should be skipped when None

    // Test Telegram config with chat ID
    let telegram_config = WebhookConfig {
        enabled: true,
        provider: WebhookProvider::Telegram,
        webhook_url: "https://api.telegram.org/bot123/sendMessage".to_string(),
        pushover_user_key: None,
        telegram_chat_id: Some("-123456789".to_string()),
    };

    let json = serde_json::to_string(&telegram_config).unwrap();
    assert!(json.contains("-123456789"));
    assert!(!json.contains("pushover_user_key")); // Should be skipped when None
}

#[test]
fn test_notification_config_defaults() {
    use services::services::config::NotificationConfig;

    let config = NotificationConfig::default();
    assert!(!config.webhook_notifications_enabled);
    assert!(config.webhooks.is_empty());
    assert!(config.sound_enabled);
    assert!(config.push_enabled);
}

#[test]
fn test_config_v8_webhook_defaults() {
    use services::services::config::Config;

    // Test that a fresh v8 config has correct webhook defaults
    let config = Config::default();

    assert_eq!(config.config_version, "v8");
    assert!(!config.notifications.webhook_notifications_enabled);
    assert!(config.notifications.webhooks.is_empty());
}

#[test]
fn test_notification_config_defaults_have_webhook_fields() {
    use services::services::config::NotificationConfig;

    // Test that default NotificationConfig has webhook fields
    let config = NotificationConfig::default();

    // Verify existing defaults
    assert!(config.sound_enabled);
    assert!(config.push_enabled);

    // Verify new webhook fields have defaults
    assert!(!config.webhook_notifications_enabled);
    assert!(config.webhooks.is_empty());
}
