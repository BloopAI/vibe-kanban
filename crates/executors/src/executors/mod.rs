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
    command::AgentProfiles,
    executors::{amp::Amp, claude::ClaudeCode, gemini::Gemini},
};

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
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
#[strum(parse_err_ty = ExecutorError, parse_err_fn = unknown_executor_error)]
#[strum_discriminants(
    name(CodingAgentExecutorType),
    derive(strum_macros::Display, Serialize, Deserialize, TS),
    ts(use_ts_enum),
    serde(rename_all = "SCREAMING_SNAKE_CASE")
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

impl CodingAgentExecutors {
    /// Create an executor from a profile string
    /// Handles both default profiles ("claude-code", "amp", "gemini") and custom profiles
    pub fn from_profile_str(profile: &str) -> Result<Self, ExecutorError> {
        match profile {
            "claude-code" => Ok(CodingAgentExecutors::ClaudeCode(ClaudeCode::new())),
            "amp" => Ok(CodingAgentExecutors::Amp(Amp::new())),
            "gemini" => Ok(CodingAgentExecutors::Gemini(Gemini::new())),
            _ => {
                // Try to load from AgentProfiles
                if let Some(agent_profile) = AgentProfiles::get_cached().get_profile(profile) {
                    match agent_profile.agent {
                        CodingAgentExecutorType::ClaudeCode => Ok(
                            CodingAgentExecutors::ClaudeCode(ClaudeCode::with_command_builder(
                                profile.to_string(),
                                agent_profile.command.clone(),
                            )),
                        ),
                        CodingAgentExecutorType::Amp => Ok(CodingAgentExecutors::Amp(
                            Amp::with_command_builder(agent_profile.command.clone()),
                        )),
                        CodingAgentExecutorType::Gemini => Ok(CodingAgentExecutors::Gemini(
                            Gemini::with_command_builder(agent_profile.command.clone()),
                        )),
                    }
                } else {
                    Err(ExecutorError::UnknownExecutorType(format!(
                        "Unknown profile: {}",
                        profile
                    )))
                }
            }
        }
    }
}

impl CodingAgentExecutorType {
    /// Get the JSON attribute path for MCP servers in the config file
    /// Returns None if the executor doesn't support MCP
    pub fn mcp_attribute_path(&self) -> Option<Vec<&'static str>> {
        match self {
            //ExecutorConfig::CharmOpencode => Some(vec!["mcpServers"]),
            //ExecutorConfig::SstOpencode => Some(vec!["mcp"]),
            Self::ClaudeCode => Some(vec!["mcpServers"]),
            //ExecutorConfig::ClaudePlan => None, // Claude Plan shares Claude config
            Self::Amp => Some(vec!["amp", "mcpServers"]), // Nested path for Amp
            Self::Gemini => Some(vec!["mcpServers"]),
            //ExecutorConfig::ClaudeCodeRouter => Some(vec!["mcpServers"]),
            //ExecutorConfig::Aider => None, // Aider doesn't support MCP. https://github.com/Aider-AI/aider/issues/3314
            //ExecutorConfig::Codex => None, // Codex uses TOML config, frontend doesn't handle TOML yet
        }
    }

    pub fn supports_mcp(&self) -> bool {
        self.mcp_attribute_path().is_some()
    }

    pub fn config_path(&self) -> Option<PathBuf> {
        match self {
            //ExecutorConfig::CharmOpencode => {
            //dirs::home_dir().map(|home| home.join(".opencode.json"))
            //}
            Self::ClaudeCode => dirs::home_dir().map(|home| home.join(".claude.json")),
            //ExecutorConfig::ClaudePlan => dirs::home_dir().map(|home| home.join(".claude.json")),
            //ExecutorConfig::ClaudeCodeRouter => {
            //dirs::home_dir().map(|home| home.join(".claude.json"))
            //}
            //ExecutorConfig::SstOpencode => {
            //#[cfg(unix)]
            //{
            //xdg::BaseDirectories::with_prefix("opencode").get_config_file("opencode.json")
            //}
            //    #[cfg(not(unix))]
            //    {
            //        dirs::config_dir().map(|config| config.join("opencode").join("opencode.json"))
            //    }
            //                                                                                //ExecutorConfig::Aider => None,
            //ExecutorConfig::Codex => {
            //    dirs::home_dir().map(|home| home.join(".codex").join("config.toml"))
            //}
            Self::Amp => dirs::config_dir().map(|config| config.join("amp").join("settings.json")),
            Self::Gemini => dirs::home_dir().map(|home| home.join(".gemini").join("settings.json")),
        }
    }
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
