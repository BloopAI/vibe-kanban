pub mod client;
pub mod types;

use anyhow::Result;
use client::OmniClient;
pub use types::*;

pub struct OmniService {
    config: OmniConfig,
    pub client: OmniClient,
}

impl OmniService {
    pub fn new(config: OmniConfig) -> Self {
        let client = OmniClient::new(
            config.host.clone().unwrap_or_default(),
            config.api_key.clone(),
        );
        Self { config, client }
    }

    pub async fn send_task_notification(
        &self,
        task_title: &str,
        task_status: &str,
        task_url: Option<&str>,
    ) -> Result<()> {
        if !self.config.enabled {
            return Ok(());
        }

        let instance = self
            .config
            .instance
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No Omni instance configured"))?;
        let recipient = self
            .config
            .recipient
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No recipient configured"))?;

        let message = format!(
            "🎯 Task Complete: {}\n\n\
             Status: {}\n\
             {}",
            task_title,
            task_status,
            task_url.map(|u| format!("URL: {}", u)).unwrap_or_default()
        );

        let request = match self.config.recipient_type {
            Some(RecipientType::PhoneNumber) => SendTextRequest {
                phone_number: Some(recipient.clone()),
                user_id: None,
                text: message,
            },
            Some(RecipientType::UserId) => SendTextRequest {
                phone_number: None,
                user_id: Some(recipient.clone()),
                text: message,
            },
            None => SendTextRequest {
                phone_number: Some(recipient.clone()),
                user_id: None,
                text: message,
            },
        };

        self.client.send_text(instance, request).await?;
        Ok(())
    }
}