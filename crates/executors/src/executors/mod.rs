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
    executors::{amp::Amp, claude::ClaudeCode, codex::Codex, gemini::Gemini, opencode::Opencode},
};

pub mod amp;
pub mod claude;
pub mod codex;
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
}

fn unknown_executor_error(s: &str) -> ExecutorError {
    ExecutorError::UnknownExecutorType(format!("Unknown executor type: {s}."))
}

#[enum_dispatch]
#[derive(
    Debug, Clone, Serialize, Deserialize, PartialEq, TS, EnumDiscriminants, strum_macros::EnumString,
)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
#[strum(parse_err_ty = ExecutorError, parse_err_fn = unknown_executor_error)]
#[strum_discriminants(
    name(BaseCodingAgent),
    derive(strum_macros::Display, Serialize, Deserialize, TS),
    strum(serialize_all = "SCREAMING_SNAKE_CASE"),
    ts(use_ts_enum),
    serde(rename_all = "SCREAMING_SNAKE_CASE")
)]
pub enum CodingAgent {
    // Echo,
    #[serde(alias = "claude")]
    ClaudeCode,
    // ClaudePlan,
    Amp,
    Gemini,
    Codex,
    // ClaudeCodeRouter,
    Opencode,
    // Aider,
}

impl CodingAgent {
    /// Create an executor from a profile string
    /// Handles both default profiles ("claude-code", "amp", "gemini") and custom profiles
    pub fn from_profile_str(profile: &str) -> Result<Self, ExecutorError> {
        match profile {
            "claude-code" => Ok(CodingAgent::ClaudeCode(ClaudeCode::new())),
            "claude-code-plan" => Ok(CodingAgent::ClaudeCode(ClaudeCode::new_plan_mode())),
            "claude-code-router" => {
                Ok(CodingAgent::ClaudeCode(ClaudeCode::new_claude_code_router()))
            }
            "amp" => Ok(CodingAgent::Amp(Amp::new())),
            "gemini" => Ok(CodingAgent::Gemini(Gemini::new())),
            "codex" => Ok(CodingAgent::Codex(Codex::new())),
            "opencode" => Ok(CodingAgent::Opencode(Opencode::new())),
            _ => {
                // Try to load from AgentProfiles
                if let Some(agent_profile) = AgentProfiles::get_cached().get_profile(profile) {
                    match agent_profile.agent {
                        BaseCodingAgent::ClaudeCode => {
                            Ok(CodingAgent::ClaudeCode(ClaudeCode::with_command_builder(
                                profile.to_string(),
                                agent_profile.command.clone(),
                            )))
                        }
                        BaseCodingAgent::Amp => Ok(CodingAgent::Amp(Amp::with_command_builder(
                            agent_profile.command.clone(),
                        ))),
                        BaseCodingAgent::Gemini => Ok(CodingAgent::Gemini(
                            Gemini::with_command_builder(agent_profile.command.clone()),
                        )),
                        BaseCodingAgent::Codex => Ok(CodingAgent::Codex(
                            Codex::with_command_builder(agent_profile.command.clone()),
                        )),
                        BaseCodingAgent::Opencode => Ok(CodingAgent::Opencode(
                            Opencode::with_command_builder(agent_profile.command.clone()),
                        )),
                    }
                } else {
                    Err(ExecutorError::UnknownExecutorType(format!(
                        "Unknown profile: {profile}"
                    )))
                }
            }
        }
    }
}

impl BaseCodingAgent {
    /// Get the JSON attribute path for MCP servers in the config file
    /// Returns None if the executor doesn't support MCP
    pub fn mcp_attribute_path(&self) -> Option<Vec<&'static str>> {
        match self {
            //ExecutorConfig::CharmOpencode => Some(vec!["mcpServers"]),
            Self::Opencode => Some(vec!["mcp"]),
            Self::ClaudeCode => Some(vec!["mcpServers"]),
            //ExecutorConfig::ClaudePlan => None, // Claude Plan shares Claude config
            Self::Amp => Some(vec!["amp", "mcpServers"]), // Nested path for Amp
            Self::Gemini => Some(vec!["mcpServers"]),
            //ExecutorConfig::Aider => None, // Aider doesn't support MCP. https://github.com/Aider-AI/aider/issues/3314
            Self::Codex => Some(vec!["mcp_servers"]), // Codex uses TOML with mcp_servers
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
            Self::Opencode => {
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
            Self::Codex => dirs::home_dir().map(|home| home.join(".codex").join("config.toml")),
            Self::Amp => dirs::config_dir().map(|config| config.join("amp").join("settings.json")),
            Self::Gemini => dirs::home_dir().map(|home| home.join(".gemini").join("settings.json")),
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
