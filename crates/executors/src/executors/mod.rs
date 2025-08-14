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

use crate::{
    command::{AgentProfiles, ProfileVariantLabel},
    executors::{
        amp::Amp, claude::ClaudeCode, codex::Codex, cursor::Cursor, gemini::Gemini,
        opencode::Opencode,
    },
    mcp_config::McpConfig,
};

pub mod amp;
pub mod claude;
pub mod codex;
pub mod cursor;
pub mod gemini;
pub mod opencode;

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

fn unknown_executor_error(s: &str) -> ExecutorError {
    ExecutorError::UnknownExecutorType(format!("Unknown executor type: {s}."))
}

#[enum_dispatch]
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
    TS,
    EnumDiscriminants,
    strum_macros::EnumString,
    strum_macros::EnumIter,
)]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(parse_err_ty = ExecutorError, parse_err_fn = unknown_executor_error)]
pub enum CodingAgent {
    ClaudeCode,
    Amp,
    Gemini,
    Codex,
    Opencode,
}

impl CodingAgent {
    /// Create a CodingAgent from a profile variant
    /// Loads profile from AgentProfiles (both default and custom profiles)
    pub fn from_profile_variant(profile: &ProfileVariantLabel) -> Result<Self, ExecutorError> {
        if let Some(agent_profile) = AgentProfiles::get_cached().get_profile(&profile.profile) {
            if let Some(variant_name) = &profile.variant {
                if let Some(variant) = agent_profile.get_variant(&variant_name) {
                    Ok(variant.agent.clone())
                } else {
                    Err(ExecutorError::UnknownExecutorType(format!(
                        "Unknown mode: {}",
                        variant_name
                    )))
                }
            } else {
                Ok(agent_profile.inner.agent.clone())
            }
        } else {
            Err(ExecutorError::UnknownExecutorType(format!(
                "Unknown profile: {}",
                profile.profile
            )))
        }
    }

    pub fn supports_mcp(&self) -> bool {
        self.default_mcp_config_path().is_some()
    }

    pub fn get_mcp_config(&self) -> McpConfig {
        match self {
            Self::Codex(_) => McpConfig::new(
                vec!["mcp_servers".to_string()],
                serde_json::json!({
                    "mcp_servers": {}
                }),
                serde_json::json!({
                    "command": "npx",
                    "args": ["-y", "vibe-kanban", "--mcp"],
                }),
                true,
            ),
            Self::Amp(_) => McpConfig::new(
                vec!["amp.mcpServers".to_string()],
                serde_json::json!({
                    "amp.mcpServers": {}
                }),
                serde_json::json!({
                    "command": "npx",
                    "args": ["-y", "vibe-kanban", "--mcp"],
                }),
                false,
            ),
            Self::Opencode(_) => McpConfig::new(
                vec!["mcp".to_string()],
                serde_json::json!({
                    "mcp": {},
                    "$schema": "https://opencode.ai/config.json"
                }),
                serde_json::json!({
                    "type": "local",
                    "command": ["npx", "-y", "vibe-kanban", "--mcp"],
                    "enabled": true
                }),
                false,
            ),
            _ => McpConfig::new(
                vec!["mcpServers".to_string()],
                serde_json::json!({
                    "mcpServers": {}
                }),
                serde_json::json!({
                    "command": "npx",
                    "args": ["-y", "vibe-kanban", "--mcp"],
                }),
                false,
            ),
        }
    }

    pub fn default_mcp_config_path(&self) -> Option<PathBuf> {
        match self {
            //ExecutorConfig::CharmOpencode => {
            //dirs::home_dir().map(|home| home.join(".opencode.json"))
            //}
            Self::ClaudeCode(_) => dirs::home_dir().map(|home| home.join(".claude.json")),
            //ExecutorConfig::ClaudePlan => dirs::home_dir().map(|home| home.join(".claude.json")),
            Self::Opencode(_) => {
                #[cfg(unix)]
                {
                    xdg::BaseDirectories::with_prefix("opencode").get_config_file("opencode.json")
                }
                #[cfg(not(unix))]
                {
                    dirs::config_dir().map(|config| config.join("opencode").join("opencode.json"))
                }
            }
            //ExecutorConfig::Aider => None,
            Self::Codex(_) => dirs::home_dir().map(|home| home.join(".codex").join("config.toml")),
            Self::Amp(_) => {
                dirs::config_dir().map(|config| config.join("amp").join("settings.json"))
            }
            Self::Gemini(_) => {
                dirs::home_dir().map(|home| home.join(".gemini").join("settings.json"))
            }
            Self::Cursor(_) => dirs::home_dir().map(|home| home.join(".cursor").join("mcp.json")),
        }
    }
}

#[async_trait]
#[enum_dispatch(CodingAgent)]
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
