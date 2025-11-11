use reqwest::Client;
use serde_json::json;
use tracing;

use crate::services::config::{WebhookConfig, WebhookProvider};

/// Service for sending webhook notifications to various platforms
#[derive(Debug, Clone)]
pub struct WebhookNotificationService {
    client: Client,
}

impl WebhookNotificationService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Send notifications to all enabled webhooks
    pub async fn notify_all(webhooks: &[WebhookConfig], title: &str, message: &str) {
        let service = Self::new();
        for webhook in webhooks {
            if webhook.enabled && !webhook.webhook_url.is_empty() {
                service.send_notification(webhook, title, message).await;
            }
        }
    }

    /// Send a notification to a specific webhook
    pub async fn send_notification(&self, config: &WebhookConfig, title: &str, message: &str) {
        let result = match config.provider {
            WebhookProvider::Slack => self.send_slack(config, title, message).await,
            WebhookProvider::Discord => self.send_discord(config, title, message).await,
            WebhookProvider::Pushover => self.send_pushover(config, title, message).await,
            WebhookProvider::Telegram => self.send_telegram(config, title, message).await,
            WebhookProvider::Generic => self.send_generic(config, title, message).await,
        };

        if let Err(e) = result {
            tracing::error!(
                "Failed to send {:?} webhook notification: {}",
                config.provider,
                e
            );
        } else {
            tracing::info!(
                "Successfully sent {:?} webhook notification: {}",
                config.provider,
                title
            );
        }
    }

    /// Send notification to Slack
    async fn send_slack(
        &self,
        config: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let payload = json!({
            "text": title,
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": title
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": message
                    }
                }
            ]
        });

        let response = self
            .client
            .post(&config.webhook_url)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Slack API error: {}", response.status()).into());
        }

        Ok(())
    }

    /// Send notification to Discord
    async fn send_discord(
        &self,
        config: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let payload = json!({
            "embeds": [{
                "title": title,
                "description": message,
                "color": 5814783, // Blue color
                "footer": {
                    "text": "Vibe Kanban"
                }
            }]
        });

        let response = self
            .client
            .post(&config.webhook_url)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Discord API error: {}", response.status()).into());
        }

        Ok(())
    }

    /// Send notification to Pushover
    async fn send_pushover(
        &self,
        config: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let user_key = config
            .pushover_user_key
            .as_ref()
            .ok_or("Pushover user key not configured")?;

        // Extract API token from webhook URL (expected format: token from the app)
        // Pushover requires posting to https://api.pushover.net/1/messages.json
        let payload = json!({
            "token": &config.webhook_url, // webhook_url should contain the API token
            "user": user_key,
            "title": title,
            "message": message,
            "priority": 0
        });

        let response = self
            .client
            .post("https://api.pushover.net/1/messages.json")
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Pushover API error: {}", response.status()).into());
        }

        Ok(())
    }

    /// Send notification to Telegram
    async fn send_telegram(
        &self,
        config: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let chat_id = config
            .telegram_chat_id
            .as_ref()
            .ok_or("Telegram chat ID not configured")?;

        let full_message = format!("*{title}*\n\n{message}");

        let payload = json!({
            "chat_id": chat_id,
            "text": full_message,
            "parse_mode": "Markdown"
        });

        // webhook_url should be in format: https://api.telegram.org/bot<TOKEN>/sendMessage
        let response = self
            .client
            .post(&config.webhook_url)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Telegram API error: {}", response.status()).into());
        }

        Ok(())
    }

    /// Send notification to a generic webhook (POST with JSON)
    async fn send_generic(
        &self,
        config: &WebhookConfig,
        title: &str,
        message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let payload = json!({
            "title": title,
            "message": message,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });

        let response = self
            .client
            .post(&config.webhook_url)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Generic webhook error: {}", response.status()).into());
        }

        Ok(())
    }
}

impl Default for WebhookNotificationService {
    fn default() -> Self {
        Self::new()
    }
}
