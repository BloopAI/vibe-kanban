use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use enum_dispatch::enum_dispatch;
use futures_io::Error as FuturesIoError;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::Type;
use strum_macros::{Display, EnumDiscriminants, EnumString, VariantNames};
use thiserror::Error;
use ts_rs::TS;
use utils::msg_store::MsgStore;

use crate::{
    executors::{
        amp::Amp, claude::ClaudeCode, codex::Codex, cursor::Cursor, gemini::Gemini,
        opencode::Opencode, qwen::QwenCode,
    },
    mcp_config::McpConfig,
};

pub mod amp;
pub mod claude;
pub mod codex;
pub mod cursor;
pub mod gemini;
pub mod opencode;
pub mod qwen;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BaseAgentCapability {
    SessionFork,
}

#[derive(Debug, Error)]
pub enum ExecutorError {
    #[error("Follow-up is not supported: {0}")]
    FollowUpNotSupported(String),
    #[error(transparent)]
    SpawnError(#[from] FuturesIoError),
    #[error("Unknown executor type: {0}")]
    UnknownExecutorType(String),
    #[error("I/O error: {0}")]
    Io(std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    TomlSerialize(#[from] toml::ser::Error),
    #[error(transparent)]
    TomlDeserialize(#[from] toml::de::Error),
}

#[enum_dispatch]
#[derive(
    Debug, Clone, Serialize, Deserialize, PartialEq, TS, Display, EnumDiscriminants, VariantNames,
)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
#[strum_discriminants(
    name(BaseCodingAgent),
    // Only add Hash; Eq/PartialEq are already provided by EnumDiscriminants.
    derive(EnumString, Hash, strum_macros::Display, Serialize, Deserialize, TS, Type),
    strum(serialize_all = "SCREAMING_SNAKE_CASE"),
    ts(use_ts_enum),
    serde(rename_all = "SCREAMING_SNAKE_CASE"),
    sqlx(type_name = "TEXT", rename_all = "SCREAMING_SNAKE_CASE")
)]
pub enum CodingAgent {
    ClaudeCode,
    Amp,
    Gemini,
    Codex,
    Opencode,
    Cursor,
    QwenCode,
}

impl CodingAgent {
    pub fn get_mcp_config(&self) -> McpConfig {
        match self {
            Self::Codex(_) => McpConfig::new(
                vec!["mcp_servers".to_string()],
                serde_json::json!({
                    "mcp_servers": {}
                }),
                self.preconfigured_mcp(),
                true,
            ),
            Self::Amp(_) => McpConfig::new(
                vec!["amp.mcpServers".to_string()],
                serde_json::json!({
                    "amp.mcpServers": {}
                }),
                self.preconfigured_mcp(),
                false,
            ),
            Self::Opencode(_) => McpConfig::new(
                vec!["mcp".to_string()],
                serde_json::json!({
                    "mcp": {},
                    "$schema": "https://opencode.ai/config.json"
                }),
                self.preconfigured_mcp(),
                false,
            ),
            _ => McpConfig::new(
                vec!["mcpServers".to_string()],
                serde_json::json!({
                    "mcpServers": {}
                }),
                self.preconfigured_mcp(),
                false,
            ),
        }
    }

    pub fn supports_mcp(&self) -> bool {
        self.default_mcp_config_path().is_some()
    }

    pub fn capabilities(&self) -> Vec<BaseAgentCapability> {
        match self {
            Self::ClaudeCode(_) => vec![BaseAgentCapability::SessionFork],
            Self::Amp(_) => vec![BaseAgentCapability::SessionFork],
            Self::Codex(_) => vec![BaseAgentCapability::SessionFork],
            Self::Gemini(_) | Self::Opencode(_) | Self::Cursor(_) | Self::QwenCode(_) => vec![],
        }
    }
}

#[async_trait]
#[enum_dispatch(CodingAgent)]
pub trait StandardCodingAgentExecutor {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError>;
    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError>;
    fn normalize_logs(&self, _raw_logs_event_store: Arc<MsgStore>, _worktree_path: &Path);

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf>;

    async fn check_availability(&self) -> bool {
        self.default_mcp_config_path()
            .map(|path| path.exists())
            .unwrap_or(false)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
#[serde(transparent)]
#[schemars(
    title = "Append Prompt",
    description = "Extra text appended to the prompt",
    extend("format" = "textarea")
)]
#[derive(Default)]
pub struct AppendPrompt(pub Option<String>);

impl AppendPrompt {
    pub fn get(&self) -> Option<String> {
        self.0.clone()
    }

    pub fn combine_prompt(&self, prompt: &str) -> String {
        match self {
            AppendPrompt(Some(value)) => format!("{prompt}{value}"),
            AppendPrompt(None) => prompt.to_string(),
        }
    }
}
