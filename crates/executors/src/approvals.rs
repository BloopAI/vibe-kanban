use std::fmt;

use async_trait::async_trait;
use serde_json::Value;
use thiserror::Error;
use workspace_utils::approvals::ApprovalStatus;

/// Errors emitted by executor approval services.
#[derive(Debug, Error)]
pub enum ExecutorApprovalError {
    #[error("executor approval session not registered")]
    SessionNotRegistered,
    #[error("executor approval request failed: {0}")]
    RequestFailed(String),
}

impl ExecutorApprovalError {
    pub fn request_failed<E: fmt::Display>(err: E) -> Self {
        Self::RequestFailed(err.to_string())
    }
}

/// Abstraction for executor approval backends.
#[async_trait]
pub trait ExecutorApprovalService: Send + Sync {
    /// Registers the session identifier associated with subsequent approval requests.
    async fn register_session(&self, session_id: &str) -> Result<(), ExecutorApprovalError>;

    /// Requests approval for a tool invocation and waits for the final decision.
    async fn request_tool_approval(
        &self,
        tool_name: &str,
        tool_input: Value,
    ) -> Result<ApprovalStatus, ExecutorApprovalError>;
}
