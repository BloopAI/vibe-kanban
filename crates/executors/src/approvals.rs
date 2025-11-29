use std::{collections::HashMap, fmt};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use workspace_utils::approvals::{ApprovalStatus, Question};

/// Errors emitted by executor approval services.
#[derive(Debug, Error)]
pub enum ExecutorApprovalError {
    #[error("executor approval session not registered")]
    SessionNotRegistered,
    #[error("executor approval request failed: {0}")]
    RequestFailed(String),
    #[error("executor approval service unavailable")]
    ServiceUnavailable,
}

impl ExecutorApprovalError {
    pub fn request_failed<E: fmt::Display>(err: E) -> Self {
        Self::RequestFailed(err.to_string())
    }
}

/// Abstraction for executor approval backends.
#[async_trait]
pub trait ExecutorApprovalService: Send + Sync {
    /// Requests approval for a tool invocation and waits for the final decision.
    async fn request_tool_approval(
        &self,
        tool_name: &str,
        tool_input: Value,
        tool_call_id: &str,
    ) -> Result<ApprovalStatus, ExecutorApprovalError>;

    /// Requests user to answer questions (AskUserQuestion) and waits for answers.
    /// Returns the approval status and optional answers map (header -> answer).
    async fn request_question_approval(
        &self,
        questions: &[Question],
        tool_call_id: &str,
    ) -> Result<(ApprovalStatus, Option<HashMap<String, String>>), ExecutorApprovalError>;
}

#[derive(Debug, Default)]
pub struct NoopExecutorApprovalService;

#[async_trait]
impl ExecutorApprovalService for NoopExecutorApprovalService {
    async fn request_tool_approval(
        &self,
        _tool_name: &str,
        _tool_input: Value,
        _tool_call_id: &str,
    ) -> Result<ApprovalStatus, ExecutorApprovalError> {
        Ok(ApprovalStatus::Approved)
    }

    async fn request_question_approval(
        &self,
        _questions: &[Question],
        _tool_call_id: &str,
    ) -> Result<(ApprovalStatus, Option<HashMap<String, String>>), ExecutorApprovalError> {
        // NoOp service times out questions since there's no user to answer them
        Ok((ApprovalStatus::TimedOut, None))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolCallMetadata {
    pub tool_call_id: String,
}
