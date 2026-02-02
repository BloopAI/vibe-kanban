use std::sync::Arc;

use reqwest::Client;
use serde_json::json;
use tokio::sync::RwLock;

use crate::services::config::{Config, WebhookConfig, WebhookProvider};

/// Service for sending webhook notifications to various platforms
#[derive(Debug, Clone)]
pub struct WebhookNotificationService {
    config: Arc<RwLock<Config>>,
    client: Client,
}

impl WebhookNotificationService {
    pub fn new(config: Arc<RwLock<Config>>) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    /// Send webhook notifications if enabled
    pub async fn send_notification(&self, title: &str, message: &str) {
        let config = self.config.read().await;

        if !config.notifications.webhook_notifications_enabled {
            return;
        }

        for webhook in &config.notifications.webhooks {
            if !webhook.enabled {
                continue;
            }

            let result = match webhook.provider {
                WebhookProvider::Slack => self.send_slack_notification(webhook, title, message).await,
                WebhookProvider::Discord => self.send_discord_notification(webhook, title, message).await,
                WebhookProvider::Pushover => self.send_pushover_notification(webhook, title, message).await,
                WebhookProvider::Telegram => self.send_telegram_notification(webhook, title, message).await,
                WebhookProvider::Generic => self.send_generic_notification(webhook, title, message).await,
            };

            if let Err(e) = result {
                tracing::warn!(
                    "Failed to send {:?} webhook notification: {}",
                    webhook.provider,
                    e
                );
            }
        }
    }

    /// Send notification to Slack with blocks format
    async fn send_slack_notification(
        &self,
        webhook: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let payload = json!({
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": title,
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": message,
                    }
                }
            ]
        });

        self.client
            .post(&webhook.webhook_url)
            .json(&payload)
            .send()
            .await?
            .error_for_status()?;

        Ok(())
    }

    /// Send notification to Discord with embeds format
    async fn send_discord_notification(
        &self,
        webhook: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let timestamp = chrono::Utc::now().to_rfc3339();

        let payload = json!({
            "embeds": [{
                "title": title,
                "description": message,
                "timestamp": timestamp,
                "color": 5814783, // Blue color
            }]
        });

        self.client
            .post(&webhook.webhook_url)
            .json(&payload)
            .send()
            .await?
            .error_for_status()?;

        Ok(())
    }

    /// Send notification to Pushover
    async fn send_pushover_notification(
        &self,
        webhook: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let user_key = webhook
            .pushover_user_key
            .as_ref()
            .ok_or("Pushover user key not configured")?;

        // Extract token from webhook_url (format: https://api.pushover.net/1/messages.json?token=TOKEN)
        let token = webhook
            .webhook_url
            .split("token=")
            .nth(1)
            .ok_or("Invalid Pushover webhook URL format")?;

        let payload = json!({
            "token": token,
            "user": user_key,
            "title": title,
            "message": message,
        });

        self.client
            .post("https://api.pushover.net/1/messages.json")
            .json(&payload)
            .send()
            .await?
            .error_for_status()?;

        Ok(())
    }

    /// Send notification to Telegram
    async fn send_telegram_notification(
        &self,
        webhook: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let chat_id = webhook
            .telegram_chat_id
            .as_ref()
            .ok_or("Telegram chat ID not configured")?;

        let full_message = format!("<b>{}</b>\n\n{}", title, message);

        let payload = json!({
            "chat_id": chat_id,
            "text": full_message,
            "parse_mode": "HTML",
        });

        self.client
            .post(&webhook.webhook_url)
            .json(&payload)
            .send()
            .await?
            .error_for_status()?;

        Ok(())
    }

    /// Send generic JSON notification
    async fn send_generic_notification(
        &self,
        webhook: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let timestamp = chrono::Utc::now().to_rfc3339();

        let payload = json!({
            "title": title,
            "message": message,
            "timestamp": timestamp,
        });

        self.client
            .post(&webhook.webhook_url)
            .json(&payload)
            .send()
            .await?
            .error_for_status()?;

        Ok(())
    }
}
