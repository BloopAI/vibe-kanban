//! Swarm Services Module
//!
//! Provides services for managing swarms, sandbox pools, and chat functionality.
//! Migrated from the Node.js claude-swarm-plugin backend.

mod broadcast;
mod chat;
mod daytona;
mod executor;
mod pool;
mod swarm;
mod trigger;

pub use broadcast::{
    BroadcastManager, BroadcastStats, ChatBroadcastMessage, ChatBroadcaster, ChatMessageData,
    LogBroadcaster, LogEnd, LogEntry, LogMessage, PoolBroadcaster, PoolStatusUpdate,
};
pub use chat::{ChatService, GetMessagesOptions, MessageMetadata};
pub use daytona::{CommandResult, DaytonaClient, DaytonaConfig, DaytonaError};
pub use executor::{ExecutionResult, RetryConfig, TaskExecutor};
pub use pool::{AgentRole, PoolConfig, PoolManager, PoolStats, PoolStatus, SandboxInfo};
pub use swarm::{SwarmService, SwarmServiceError, SwarmStats};
pub use trigger::{TriggerConfig, TriggerEngine, TriggerStats};
