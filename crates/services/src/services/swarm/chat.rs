//! ChatService - Chat/Messaging Management
//!
//! Manages chat messages for swarms.
//! Migrated from ChatService.js

use std::sync::Arc;

use db::models::swarm_chat::{CreateSwarmChat, SenderType, SwarmChat};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::broadcast::{ChatBroadcaster, ChatMessageData};

static MENTION_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"@(\w+(?:-\w+)*)").unwrap()
});

#[derive(Debug, Error)]
pub enum ChatError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Message not found: {0}")]
    MessageNotFound(Uuid),
    #[error("Swarm not found: {0}")]
    SwarmNotFound(Uuid),
}

pub type Result<T> = std::result::Result<T, ChatError>;

/// Options for getting messages
#[derive(Debug, Clone, Default, Deserialize)]
pub struct GetMessagesOptions {
    pub limit: Option<i32>,
    pub since: Option<chrono::DateTime<chrono::Utc>>,
}

/// Metadata attached to chat messages
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MessageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub typing: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_response: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential_required: Option<String>,
}

impl MessageMetadata {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_task(mut self, task_id: Uuid) -> Self {
        self.task_id = Some(task_id);
        self
    }

    pub fn with_sandbox(mut self, sandbox_id: Uuid) -> Self {
        self.sandbox_id = Some(sandbox_id);
        self
    }

    pub fn with_error(mut self, error: String) -> Self {
        self.error = Some(error);
        self
    }

    pub fn with_role(mut self, role: String) -> Self {
        self.role = Some(role);
        self
    }

    pub fn as_typing(mut self) -> Self {
        self.typing = Some(true);
        self
    }

    pub fn as_agent_response(mut self) -> Self {
        self.agent_response = Some(true);
        self
    }

    pub fn to_json(&self) -> Option<String> {
        serde_json::to_string(self).ok()
    }
}

/// ChatService handles all chat/messaging operations for swarms
#[derive(Clone, Default)]
pub struct ChatService;

impl ChatService {
    pub fn new() -> Self {
        Self
    }

    /// Get messages for a swarm
    pub async fn get_messages(
        &self,
        pool: &SqlitePool,
        swarm_id: Uuid,
        options: GetMessagesOptions,
    ) -> Result<Vec<SwarmChat>> {
        let mut messages = SwarmChat::find_by_swarm_id(pool, swarm_id, options.limit).await?;

        if let Some(since) = options.since {
            messages.retain(|m| m.created_at > since);
        }

        messages.reverse();

        Ok(messages)
    }

    /// Get recent messages
    pub async fn get_recent(
        &self,
        pool: &SqlitePool,
        swarm_id: Uuid,
        count: i32,
    ) -> Result<Vec<SwarmChat>> {
        self.get_messages(
            pool,
            swarm_id,
            GetMessagesOptions {
                limit: Some(count),
                since: None,
            },
        )
        .await
    }

    /// Post a message to chat
    pub async fn post_message(
        &self,
        pool: &SqlitePool,
        swarm_id: Uuid,
        sender_type: SenderType,
        sender_id: Option<String>,
        message: String,
        metadata: Option<MessageMetadata>,
    ) -> Result<SwarmChat> {
        let message_id = Uuid::new_v4();
        let metadata_json = metadata.and_then(|m| m.to_json());

        let data = CreateSwarmChat {
            swarm_id,
            sender_type: sender_type.clone(),
            sender_id: sender_id.clone(),
            message: message.clone(),
            metadata: metadata_json,
        };

        let chat_message = SwarmChat::create(pool, &data, message_id).await?;

        tracing::debug!(
            swarm_id = %swarm_id,
            message_id = %chat_message.id,
            sender_type = ?sender_type,
            "Message posted"
        );

        Ok(chat_message)
    }

    /// Post a system message
    pub async fn post_system_message(
        &self,
        pool: &SqlitePool,
        swarm_id: Uuid,
        message: String,
        metadata: Option<MessageMetadata>,
    ) -> Result<SwarmChat> {
        self.post_message(pool, swarm_id, SenderType::System, None, message, metadata)
            .await
    }

    /// Post a user message
    pub async fn post_user_message(
        &self,
        pool: &SqlitePool,
        swarm_id: Uuid,
        message: String,
    ) -> Result<SwarmChat> {
        self.post_message(pool, swarm_id, SenderType::User, None, message, None)
            .await
    }

    /// Post a sandbox/agent message
    pub async fn post_sandbox_message(
        &self,
        pool: &SqlitePool,
        swarm_id: Uuid,
        sandbox_id: Uuid,
        message: String,
        role: Option<String>,
    ) -> Result<SwarmChat> {
        let metadata = role.map(|r| MessageMetadata::new().with_role(r).as_agent_response());

        self.post_message(
            pool,
            swarm_id,
            SenderType::Sandbox,
            Some(sandbox_id.to_string()),
            message,
            metadata,
        )
        .await
    }

    /// Post a typing indicator
    pub async fn post_typing(
        &self,
        pool: &SqlitePool,
        swarm_id: Uuid,
        sender_id: String,
    ) -> Result<SwarmChat> {
        let metadata = MessageMetadata::new().as_typing();

        self.post_message(
            pool,
            swarm_id,
            SenderType::Sandbox,
            Some(sender_id),
            "...".to_string(),
            Some(metadata),
        )
        .await
    }

    /// Delete all chat messages for a swarm
    pub async fn delete_chat(&self, pool: &SqlitePool, swarm_id: Uuid) -> Result<u64> {
        let rows = SwarmChat::delete_by_swarm_id(pool, swarm_id).await?;

        tracing::info!(swarm_id = %swarm_id, rows_deleted = rows, "Chat deleted");

        Ok(rows)
    }

    /// Get a single message by ID
    pub async fn get_message(&self, pool: &SqlitePool, message_id: Uuid) -> Result<SwarmChat> {
        SwarmChat::find_by_id(pool, message_id)
            .await?
            .ok_or(ChatError::MessageNotFound(message_id))
    }

    /// Extract @mentions from message text
    pub fn extract_mentions(message: &str) -> Vec<String> {
        MENTION_REGEX
            .captures_iter(message)
            .map(|cap| format!("@{}", &cap[1]))
            .collect()
    }

    /// Check if a message mentions a specific target
    pub fn mentions_target(message: &str, target: &str) -> bool {
        let mentions = Self::extract_mentions(message);
        let target_lower = target.to_lowercase();

        mentions.iter().any(|mention| {
            let m = mention.to_lowercase().replace('@', "");
            m == "all" || m == target_lower || target_lower.contains(&m) || m.contains(&target_lower)
        })
    }

    /// Convert a SwarmChat to ChatMessageData for broadcasting
    pub fn to_broadcast_data(chat: &SwarmChat) -> ChatMessageData {
        ChatMessageData {
            id: chat.id,
            swarm_id: chat.swarm_id,
            sender_type: chat.sender_type.to_string(),
            sender_id: chat.sender_id.clone(),
            message: chat.message.clone(),
            metadata: chat.metadata.clone(),
            created_at: chat.created_at,
        }
    }

    /// Post a message and broadcast to WebSocket subscribers
    ///
    /// This is the preferred method when you have access to a ChatBroadcaster,
    /// as it will automatically notify all connected WebSocket clients.
    pub async fn post_message_with_broadcast(
        &self,
        pool: &SqlitePool,
        broadcaster: &Arc<ChatBroadcaster>,
        swarm_id: Uuid,
        sender_type: SenderType,
        sender_id: Option<String>,
        message: String,
        metadata: Option<MessageMetadata>,
    ) -> Result<SwarmChat> {
        // First, post the message to the database
        let chat_message = self
            .post_message(pool, swarm_id, sender_type, sender_id, message, metadata)
            .await?;

        // Then broadcast to WebSocket subscribers
        let broadcast_data = Self::to_broadcast_data(&chat_message);
        let subscriber_count = broadcaster.publish(swarm_id, broadcast_data).await;

        tracing::debug!(
            swarm_id = %swarm_id,
            message_id = %chat_message.id,
            subscribers = subscriber_count,
            "Message broadcasted"
        );

        Ok(chat_message)
    }

    /// Post a system message and broadcast
    pub async fn post_system_message_with_broadcast(
        &self,
        pool: &SqlitePool,
        broadcaster: &Arc<ChatBroadcaster>,
        swarm_id: Uuid,
        message: String,
        metadata: Option<MessageMetadata>,
    ) -> Result<SwarmChat> {
        self.post_message_with_broadcast(
            pool,
            broadcaster,
            swarm_id,
            SenderType::System,
            None,
            message,
            metadata,
        )
        .await
    }

    /// Post a user message and broadcast
    pub async fn post_user_message_with_broadcast(
        &self,
        pool: &SqlitePool,
        broadcaster: &Arc<ChatBroadcaster>,
        swarm_id: Uuid,
        message: String,
    ) -> Result<SwarmChat> {
        self.post_message_with_broadcast(
            pool,
            broadcaster,
            swarm_id,
            SenderType::User,
            None,
            message,
            None,
        )
        .await
    }

    /// Post a sandbox/agent message and broadcast
    pub async fn post_sandbox_message_with_broadcast(
        &self,
        pool: &SqlitePool,
        broadcaster: &Arc<ChatBroadcaster>,
        swarm_id: Uuid,
        sandbox_id: Uuid,
        message: String,
        role: Option<String>,
    ) -> Result<SwarmChat> {
        let metadata = role.map(|r| MessageMetadata::new().with_role(r).as_agent_response());

        self.post_message_with_broadcast(
            pool,
            broadcaster,
            swarm_id,
            SenderType::Sandbox,
            Some(sandbox_id.to_string()),
            message,
            metadata,
        )
        .await
    }
}
