//! Broadcast Services for WebSocket Streaming
//!
//! Provides broadcast channels for distributing logs and chat messages
//! to WebSocket subscribers in real-time.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use ts_rs::TS;
use uuid::Uuid;

/// Default channel capacity for broadcast channels
const DEFAULT_CHANNEL_CAPACITY: usize = 1024;

/// Log entry sent via WebSocket
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub struct LogEntry {
    /// Type of message (always "log" for log entries)
    #[serde(rename = "type")]
    pub msg_type: String,
    /// Log content
    pub content: String,
    /// ISO 8601 timestamp
    pub timestamp: String,
    /// Log level (info, warn, error, debug)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<String>,
    /// Source of the log (executor, trigger, sandbox, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

impl LogEntry {
    /// Create a new log entry
    pub fn new(content: impl Into<String>) -> Self {
        Self {
            msg_type: "log".to_string(),
            content: content.into(),
            timestamp: Utc::now().to_rfc3339(),
            level: None,
            source: None,
        }
    }

    /// Set the log level
    pub fn with_level(mut self, level: impl Into<String>) -> Self {
        self.level = Some(level.into());
        self
    }

    /// Set the log source
    pub fn with_source(mut self, source: impl Into<String>) -> Self {
        self.source = Some(source.into());
        self
    }

    /// Create an info log
    pub fn info(content: impl Into<String>) -> Self {
        Self::new(content).with_level("info")
    }

    /// Create a warning log
    pub fn warn(content: impl Into<String>) -> Self {
        Self::new(content).with_level("warn")
    }

    /// Create an error log
    pub fn error(content: impl Into<String>) -> Self {
        Self::new(content).with_level("error")
    }

    /// Create a debug log
    pub fn debug(content: impl Into<String>) -> Self {
        Self::new(content).with_level("debug")
    }
}

/// Log end message sent when task execution completes
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub struct LogEnd {
    /// Type of message (always "log_end")
    #[serde(rename = "type")]
    pub msg_type: String,
    /// Exit code of the task
    pub exit_code: i32,
    /// Final summary message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// ISO 8601 timestamp
    pub timestamp: String,
}

impl LogEnd {
    /// Create a new log end message
    pub fn new(exit_code: i32) -> Self {
        Self {
            msg_type: "log_end".to_string(),
            exit_code,
            summary: None,
            timestamp: Utc::now().to_rfc3339(),
        }
    }

    /// Add a summary message
    pub fn with_summary(mut self, summary: impl Into<String>) -> Self {
        self.summary = Some(summary.into());
        self
    }

    /// Create a success end message
    pub fn success() -> Self {
        Self::new(0)
    }

    /// Create a failure end message
    pub fn failure(exit_code: i32) -> Self {
        Self::new(exit_code)
    }
}

/// Union type for log broadcast messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LogMessage {
    Entry(LogEntry),
    End(LogEnd),
}

impl From<LogEntry> for LogMessage {
    fn from(entry: LogEntry) -> Self {
        LogMessage::Entry(entry)
    }
}

impl From<LogEnd> for LogMessage {
    fn from(end: LogEnd) -> Self {
        LogMessage::End(end)
    }
}

/// Chat message sent via WebSocket
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub struct ChatBroadcastMessage {
    /// Type of message (always "message")
    #[serde(rename = "type")]
    pub msg_type: String,
    /// Message data
    pub data: ChatMessageData,
}

/// Chat message data payload
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ChatMessageData {
    pub id: Uuid,
    pub swarm_id: Uuid,
    pub sender_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_id: Option<String>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl ChatBroadcastMessage {
    /// Create a new chat broadcast message
    pub fn new(data: ChatMessageData) -> Self {
        Self {
            msg_type: "message".to_string(),
            data,
        }
    }
}

/// Broadcaster for task logs
///
/// Manages broadcast channels for each task, allowing multiple WebSocket
/// connections to subscribe to log streams.
#[derive(Debug)]
pub struct LogBroadcaster {
    /// Map of task_id -> broadcast sender
    channels: Arc<RwLock<HashMap<Uuid, broadcast::Sender<LogMessage>>>>,
    /// Channel capacity
    capacity: usize,
}

impl Default for LogBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

impl LogBroadcaster {
    /// Create a new LogBroadcaster
    pub fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
            capacity: DEFAULT_CHANNEL_CAPACITY,
        }
    }

    /// Create with custom capacity
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
            capacity,
        }
    }

    /// Subscribe to logs for a specific task
    ///
    /// Returns a receiver that will receive all log messages for the task.
    /// Creates the channel if it doesn't exist.
    pub async fn subscribe_logs(&self, task_id: Uuid) -> broadcast::Receiver<LogMessage> {
        let mut channels = self.channels.write().await;

        if let Some(sender) = channels.get(&task_id) {
            sender.subscribe()
        } else {
            let (sender, receiver) = broadcast::channel(self.capacity);
            channels.insert(task_id, sender);
            receiver
        }
    }

    /// Publish a log entry to all subscribers
    ///
    /// Returns the number of receivers that received the message.
    /// Returns 0 if no channel exists for the task (no subscribers).
    pub async fn publish_log(&self, task_id: Uuid, entry: LogEntry) -> usize {
        let channels = self.channels.read().await;

        if let Some(sender) = channels.get(&task_id) {
            sender.send(LogMessage::Entry(entry)).unwrap_or(0)
        } else {
            0
        }
    }

    /// Publish a log end message to all subscribers
    ///
    /// This should be called when task execution completes.
    pub async fn publish_log_end(&self, task_id: Uuid, end: LogEnd) -> usize {
        let channels = self.channels.read().await;

        if let Some(sender) = channels.get(&task_id) {
            sender.send(LogMessage::End(end)).unwrap_or(0)
        } else {
            0
        }
    }

    /// Publish a raw log message
    pub async fn publish(&self, task_id: Uuid, message: LogMessage) -> usize {
        let channels = self.channels.read().await;

        if let Some(sender) = channels.get(&task_id) {
            sender.send(message).unwrap_or(0)
        } else {
            0
        }
    }

    /// Check if a task has any active subscribers
    pub async fn has_subscribers(&self, task_id: Uuid) -> bool {
        let channels = self.channels.read().await;

        if let Some(sender) = channels.get(&task_id) {
            sender.receiver_count() > 0
        } else {
            false
        }
    }

    /// Get the number of subscribers for a task
    pub async fn subscriber_count(&self, task_id: Uuid) -> usize {
        let channels = self.channels.read().await;

        channels
            .get(&task_id)
            .map(|sender| sender.receiver_count())
            .unwrap_or(0)
    }

    /// Remove a channel when task is complete and no subscribers remain
    ///
    /// This helps prevent memory leaks from accumulating channels.
    pub async fn cleanup_channel(&self, task_id: Uuid) {
        let mut channels = self.channels.write().await;

        if let Some(sender) = channels.get(&task_id) {
            if sender.receiver_count() == 0 {
                channels.remove(&task_id);
                tracing::debug!(task_id = %task_id, "Cleaned up log channel");
            }
        }
    }

    /// Clean up all channels with no subscribers
    pub async fn cleanup_all(&self) {
        let mut channels = self.channels.write().await;

        let to_remove: Vec<Uuid> = channels
            .iter()
            .filter(|(_, sender)| sender.receiver_count() == 0)
            .map(|(id, _)| *id)
            .collect();

        for task_id in to_remove {
            channels.remove(&task_id);
        }

        tracing::debug!(remaining = channels.len(), "Cleaned up log channels");
    }

    /// Get total number of active channels
    pub async fn channel_count(&self) -> usize {
        self.channels.read().await.len()
    }
}

/// Broadcaster for swarm chat messages
///
/// Manages broadcast channels for each swarm, allowing multiple WebSocket
/// connections to subscribe to chat streams.
#[derive(Debug)]
pub struct ChatBroadcaster {
    /// Map of swarm_id -> broadcast sender
    channels: Arc<RwLock<HashMap<Uuid, broadcast::Sender<ChatBroadcastMessage>>>>,
    /// Channel capacity
    capacity: usize,
}

impl Default for ChatBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

impl ChatBroadcaster {
    /// Create a new ChatBroadcaster
    pub fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
            capacity: DEFAULT_CHANNEL_CAPACITY,
        }
    }

    /// Create with custom capacity
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
            capacity,
        }
    }

    /// Subscribe to chat messages for a specific swarm
    ///
    /// Returns a receiver that will receive all chat messages for the swarm.
    /// Creates the channel if it doesn't exist.
    pub async fn subscribe_chat(&self, swarm_id: Uuid) -> broadcast::Receiver<ChatBroadcastMessage> {
        let mut channels = self.channels.write().await;

        if let Some(sender) = channels.get(&swarm_id) {
            sender.subscribe()
        } else {
            let (sender, receiver) = broadcast::channel(self.capacity);
            channels.insert(swarm_id, sender);
            receiver
        }
    }

    /// Publish a chat message to all subscribers
    ///
    /// Returns the number of receivers that received the message.
    pub async fn publish_message(&self, swarm_id: Uuid, message: ChatBroadcastMessage) -> usize {
        let channels = self.channels.read().await;

        if let Some(sender) = channels.get(&swarm_id) {
            sender.send(message).unwrap_or(0)
        } else {
            0
        }
    }

    /// Publish chat message data directly
    pub async fn publish(&self, swarm_id: Uuid, data: ChatMessageData) -> usize {
        self.publish_message(swarm_id, ChatBroadcastMessage::new(data))
            .await
    }

    /// Check if a swarm has any active subscribers
    pub async fn has_subscribers(&self, swarm_id: Uuid) -> bool {
        let channels = self.channels.read().await;

        if let Some(sender) = channels.get(&swarm_id) {
            sender.receiver_count() > 0
        } else {
            false
        }
    }

    /// Get the number of subscribers for a swarm
    pub async fn subscriber_count(&self, swarm_id: Uuid) -> usize {
        let channels = self.channels.read().await;

        channels
            .get(&swarm_id)
            .map(|sender| sender.receiver_count())
            .unwrap_or(0)
    }

    /// Remove a channel when no subscribers remain
    pub async fn cleanup_channel(&self, swarm_id: Uuid) {
        let mut channels = self.channels.write().await;

        if let Some(sender) = channels.get(&swarm_id) {
            if sender.receiver_count() == 0 {
                channels.remove(&swarm_id);
                tracing::debug!(swarm_id = %swarm_id, "Cleaned up chat channel");
            }
        }
    }

    /// Clean up all channels with no subscribers
    pub async fn cleanup_all(&self) {
        let mut channels = self.channels.write().await;

        let to_remove: Vec<Uuid> = channels
            .iter()
            .filter(|(_, sender)| sender.receiver_count() == 0)
            .map(|(id, _)| *id)
            .collect();

        for swarm_id in to_remove {
            channels.remove(&swarm_id);
        }

        tracing::debug!(remaining = channels.len(), "Cleaned up chat channels");
    }

    /// Get total number of active channels
    pub async fn channel_count(&self) -> usize {
        self.channels.read().await.len()
    }
}

/// Pool status update sent via WebSocket
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub struct PoolStatusUpdate {
    /// Type of message (always "pool_update")
    #[serde(rename = "type")]
    pub msg_type: String,
    /// Sandbox ID
    pub sandbox_id: String,
    /// New status
    pub status: String,
    /// Associated task ID (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    /// ISO 8601 timestamp
    pub timestamp: String,
}

impl PoolStatusUpdate {
    /// Create a new pool status update
    pub fn new(sandbox_id: impl Into<String>, status: impl Into<String>) -> Self {
        Self {
            msg_type: "pool_update".to_string(),
            sandbox_id: sandbox_id.into(),
            status: status.into(),
            task_id: None,
            timestamp: Utc::now().to_rfc3339(),
        }
    }

    /// Add associated task ID
    pub fn with_task(mut self, task_id: impl Into<String>) -> Self {
        self.task_id = Some(task_id.into());
        self
    }
}

/// Broadcaster for pool status updates
#[derive(Debug)]
pub struct PoolBroadcaster {
    /// Single broadcast channel for all pool updates
    sender: broadcast::Sender<PoolStatusUpdate>,
}

impl Default for PoolBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

impl PoolBroadcaster {
    /// Create a new PoolBroadcaster
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(DEFAULT_CHANNEL_CAPACITY);
        Self { sender }
    }

    /// Create with custom capacity
    pub fn with_capacity(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// Subscribe to pool status updates
    pub fn subscribe(&self) -> broadcast::Receiver<PoolStatusUpdate> {
        self.sender.subscribe()
    }

    /// Publish a pool status update
    pub fn publish(&self, update: PoolStatusUpdate) -> usize {
        self.sender.send(update).unwrap_or(0)
    }

    /// Get the number of subscribers
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }
}

/// Combined broadcaster manager for all WebSocket streams
#[derive(Debug, Clone)]
pub struct BroadcastManager {
    /// Log broadcaster
    pub logs: Arc<LogBroadcaster>,
    /// Chat broadcaster
    pub chat: Arc<ChatBroadcaster>,
    /// Pool broadcaster
    pub pool: Arc<PoolBroadcaster>,
}

impl Default for BroadcastManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BroadcastManager {
    /// Create a new BroadcastManager with default settings
    pub fn new() -> Self {
        Self {
            logs: Arc::new(LogBroadcaster::new()),
            chat: Arc::new(ChatBroadcaster::new()),
            pool: Arc::new(PoolBroadcaster::new()),
        }
    }

    /// Create with custom capacity for all channels
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            logs: Arc::new(LogBroadcaster::with_capacity(capacity)),
            chat: Arc::new(ChatBroadcaster::with_capacity(capacity)),
            pool: Arc::new(PoolBroadcaster::with_capacity(capacity)),
        }
    }

    /// Clean up all channels with no subscribers
    pub async fn cleanup_all(&self) {
        self.logs.cleanup_all().await;
        self.chat.cleanup_all().await;
    }

    /// Get stats about active channels
    pub async fn stats(&self) -> BroadcastStats {
        BroadcastStats {
            log_channels: self.logs.channel_count().await,
            chat_channels: self.chat.channel_count().await,
            pool_subscribers: self.pool.subscriber_count(),
        }
    }
}

/// Statistics about broadcast channels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastStats {
    pub log_channels: usize,
    pub chat_channels: usize,
    pub pool_subscribers: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_log_broadcaster_subscribe_publish() {
        let broadcaster = LogBroadcaster::new();
        let task_id = Uuid::new_v4();

        let mut receiver = broadcaster.subscribe_logs(task_id).await;

        // Publish a log
        let entry = LogEntry::info("Test log message");
        let count = broadcaster.publish_log(task_id, entry.clone()).await;
        assert_eq!(count, 1);

        // Receive the log
        let received = receiver.recv().await.unwrap();
        match received {
            LogMessage::Entry(e) => {
                assert_eq!(e.content, "Test log message");
                assert_eq!(e.level, Some("info".to_string()));
            }
            _ => panic!("Expected LogEntry"),
        }
    }

    #[tokio::test]
    async fn test_chat_broadcaster_subscribe_publish() {
        let broadcaster = ChatBroadcaster::new();
        let swarm_id = Uuid::new_v4();

        let mut receiver = broadcaster.subscribe_chat(swarm_id).await;

        // Publish a message
        let data = ChatMessageData {
            id: Uuid::new_v4(),
            swarm_id,
            sender_type: "user".to_string(),
            sender_id: None,
            message: "Hello!".to_string(),
            metadata: None,
            created_at: Utc::now(),
        };
        let count = broadcaster.publish(swarm_id, data.clone()).await;
        assert_eq!(count, 1);

        // Receive the message
        let received = receiver.recv().await.unwrap();
        assert_eq!(received.data.message, "Hello!");
    }

    #[tokio::test]
    async fn test_log_broadcaster_cleanup() {
        let broadcaster = LogBroadcaster::new();
        let task_id = Uuid::new_v4();

        // Create a channel by subscribing
        let _receiver = broadcaster.subscribe_logs(task_id).await;
        assert_eq!(broadcaster.channel_count().await, 1);

        // Drop the receiver
        drop(_receiver);

        // Cleanup should remove the channel
        broadcaster.cleanup_channel(task_id).await;
        assert_eq!(broadcaster.channel_count().await, 0);
    }

    #[tokio::test]
    async fn test_pool_broadcaster() {
        let broadcaster = PoolBroadcaster::new();

        let mut receiver = broadcaster.subscribe();

        let update = PoolStatusUpdate::new("sandbox-1", "running")
            .with_task("task-1");
        let count = broadcaster.publish(update);
        assert_eq!(count, 1);

        let received = receiver.recv().await.unwrap();
        assert_eq!(received.sandbox_id, "sandbox-1");
        assert_eq!(received.status, "running");
        assert_eq!(received.task_id, Some("task-1".to_string()));
    }
}
