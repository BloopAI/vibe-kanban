use std::sync::Arc;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::services::config::{Config, WebhookConfig, WebhookProvider};

/// Metadata about the task/execution for webhook payloads
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WebhookMetadata {
    pub task_id: Option<Uuid>,
    pub task_title: Option<String>,
    pub project_id: Option<Uuid>,
    pub project_name: Option<String>,
    pub workspace_id: Option<Uuid>,
    pub execution_id: Option<Uuid>,
    pub exit_code: Option<i64>,
}

impl WebhookMetadata {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_task(mut self, id: Uuid, title: &str) -> Self {
        self.task_id = Some(id);
        self.task_title = Some(title.to_string());
        self
    }

    pub fn with_project(mut self, id: Uuid, name: &str) -> Self {
        self.project_id = Some(id);
        self.project_name = Some(name.to_string());
        self
    }

    pub fn with_workspace(mut self, id: Uuid) -> Self {
        self.workspace_id = Some(id);
        self
    }

    pub fn with_execution(mut self, id: Uuid) -> Self {
        self.execution_id = Some(id);
        self
    }

    pub fn with_exit_code(mut self, code: i64) -> Self {
        self.exit_code = Some(code);
        self
    }
}

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
    pub async fn send_notification(&self, title: &str, message: &str, metadata: &WebhookMetadata) {
        let config = self.config.read().await;

        if !config.notifications.webhook_notifications_enabled {
            return;
        }

        for webhook in &config.notifications.webhooks {
            if !webhook.enabled {
                continue;
            }

            let result = match webhook.provider {
                WebhookProvider::Slack => {
                    self.send_slack_notification(webhook, title, message, metadata)
                        .await
                }
                WebhookProvider::Discord => {
                    self.send_discord_notification(webhook, title, message, metadata)
                        .await
                }
                WebhookProvider::Pushover => {
                    self.send_pushover_notification(webhook, title, message, metadata)
                        .await
                }
                WebhookProvider::Telegram => {
                    self.send_telegram_notification(webhook, title, message, metadata)
                        .await
                }
                WebhookProvider::Generic => {
                    self.send_generic_notification(webhook, title, message, metadata)
                        .await
                }
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
        metadata: &WebhookMetadata,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut context_elements = vec![];

        if let Some(project_name) = &metadata.project_name {
            context_elements.push(json!({
                "type": "mrkdwn",
                "text": format!("*Project:* {}", project_name)
            }));
        }
        if let Some(task_id) = metadata.task_id {
            context_elements.push(json!({
                "type": "mrkdwn",
                "text": format!("*Task ID:* {}", task_id)
            }));
        }
        if let Some(exit_code) = metadata.exit_code {
            context_elements.push(json!({
                "type": "mrkdwn",
                "text": format!("*Exit Code:* {}", exit_code)
            }));
        }

        let mut blocks = vec![
            json!({
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": title,
                }
            }),
            json!({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": message,
                }
            }),
        ];

        if !context_elements.is_empty() {
            blocks.push(json!({
                "type": "context",
                "elements": context_elements
            }));
        }

        let payload = json!({ "blocks": blocks });

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
        metadata: &WebhookMetadata,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let timestamp = chrono::Utc::now().to_rfc3339();

        let mut fields = vec![];

        if let Some(project_name) = &metadata.project_name {
            fields.push(json!({
                "name": "Project",
                "value": project_name,
                "inline": true
            }));
        }
        if let Some(task_id) = metadata.task_id {
            fields.push(json!({
                "name": "Task ID",
                "value": task_id.to_string(),
                "inline": true
            }));
        }
        if let Some(project_id) = metadata.project_id {
            fields.push(json!({
                "name": "Project ID",
                "value": project_id.to_string(),
                "inline": true
            }));
        }
        if let Some(exit_code) = metadata.exit_code {
            fields.push(json!({
                "name": "Exit Code",
                "value": exit_code.to_string(),
                "inline": true
            }));
        }

        let mut embed = json!({
            "title": title,
            "description": message,
            "timestamp": timestamp,
            "color": 5814783, // Blue color
        });

        if !fields.is_empty() {
            embed["fields"] = json!(fields);
        }

        let payload = json!({ "embeds": [embed] });

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
        metadata: &WebhookMetadata,
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

        // Build message with metadata
        let mut full_message = message.to_string();
        let mut details = vec![];

        if let Some(project_name) = &metadata.project_name {
            details.push(format!("Project: {}", project_name));
        }
        if let Some(task_id) = metadata.task_id {
            details.push(format!("Task ID: {}", task_id));
        }
        if let Some(exit_code) = metadata.exit_code {
            details.push(format!("Exit Code: {}", exit_code));
        }

        if !details.is_empty() {
            full_message.push_str("\n\n");
            full_message.push_str(&details.join("\n"));
        }

        let payload = json!({
            "token": token,
            "user": user_key,
            "title": title,
            "message": full_message,
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
        metadata: &WebhookMetadata,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let chat_id = webhook
            .telegram_chat_id
            .as_ref()
            .ok_or("Telegram chat ID not configured")?;

        let mut full_message = format!("<b>{}</b>\n\n{}", title, message);

        let mut details = vec![];
        if let Some(project_name) = &metadata.project_name {
            details.push(format!("<b>Project:</b> {}", project_name));
        }
        if let Some(task_id) = metadata.task_id {
            details.push(format!("<b>Task ID:</b> {}", task_id));
        }
        if let Some(exit_code) = metadata.exit_code {
            details.push(format!("<b>Exit Code:</b> {}", exit_code));
        }

        if !details.is_empty() {
            full_message.push_str("\n\n");
            full_message.push_str(&details.join("\n"));
        }

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
        metadata: &WebhookMetadata,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let timestamp = chrono::Utc::now().to_rfc3339();

        let payload = json!({
            "title": title,
            "message": message,
            "timestamp": timestamp,
            "task_id": metadata.task_id,
            "task_title": metadata.task_title,
            "project_id": metadata.project_id,
            "project_name": metadata.project_name,
            "workspace_id": metadata.workspace_id,
            "execution_id": metadata.execution_id,
            "exit_code": metadata.exit_code,
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
