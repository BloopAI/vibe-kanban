use std::{path::PathBuf, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use enum_dispatch::enum_dispatch;
use futures_io::Error as FuturesIoError;
use serde::{Deserialize, Serialize};
use strum_macros::EnumDiscriminants;
use thiserror::Error;
use ts_rs::TS;
use utils::msg_store::MsgStore;

use crate::executors::{amp::Amp, claude::ClaudeCode, gemini::Gemini};

pub mod amp;
pub mod claude;
pub mod gemini;

#[derive(Debug, Error)]
pub enum ExecutorError {
    #[error("Follow-up is not supported")]
    FollowUpNotSupported,
    #[error(transparent)]
    SpawnError(#[from] FuturesIoError),
    #[error("Unknown executor type: {0}")]
    UnknownExecutorType(String),
}

fn unknown_executor_error(s: &str) -> ExecutorError {
    ExecutorError::UnknownExecutorType(format!("Unknown executor type: {}.", s))
}

#[enum_dispatch]
#[derive(
    Debug, Clone, Serialize, Deserialize, PartialEq, TS, EnumDiscriminants, strum_macros::EnumString,
)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
#[strum(parse_err_ty = ExecutorError, parse_err_fn = unknown_executor_error)]
#[strum_discriminants(
    name(CodingAgentExecutorType),
    derive(strum_macros::Display, Serialize, Deserialize, TS),
    ts(export),
    serde(tag = "type", rename_all = "kebab-case")
)]
pub enum CodingAgentExecutors {
    // Echo,
    #[serde(alias = "claude")]
    ClaudeCode,
    // ClaudePlan,
    Amp,
    Gemini,
    // ClaudeCodeRouter,
    // #[serde(alias = "charmopencode")]
    // CharmOpencode,
    // #[serde(alias = "opencode")]
    // SstOpencode,
    // Aider,
    // Codex,
}

#[async_trait]
#[enum_dispatch(CodingAgentExecutors)]
pub trait StandardCodingAgentExecutor {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError>;
    async fn spawn_follow_up(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError>;
    fn normalize_logs(&self, _raw_logs_event_store: Arc<MsgStore>, _worktree_path: &PathBuf);
}
