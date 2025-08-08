use std::{
    collections::{HashMap, HashSet},
    fs,
    sync::OnceLock,
};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::executors::BaseCodingAgent;

static PROFILES_CACHE: OnceLock<AgentProfiles> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CommandBuilder {
    /// Base executable command (e.g., "npx -y @anthropic-ai/claude-code@latest")
    pub base: String,
    /// Optional parameters to append to the base command
    pub params: Option<Vec<String>>,
}

impl CommandBuilder {
    pub fn new<S: Into<String>>(base: S) -> Self {
        Self {
            base: base.into(),
            params: None,
        }
    }

    pub fn params<I>(mut self, params: I) -> Self
    where
        I: IntoIterator,
        I::Item: Into<String>,
    {
        self.params = Some(params.into_iter().map(|p| p.into()).collect());
        self
    }

    pub fn build_initial(&self) -> String {
        let mut parts = vec![self.base.clone()];
        if let Some(ref params) = self.params {
            parts.extend(params.clone());
        }
        parts.join(" ")
    }

    pub fn build_follow_up(&self, additional_args: &[String]) -> String {
        let mut parts = vec![self.base.clone()];
        if let Some(ref params) = self.params {
            parts.extend(params.clone());
        }
        parts.extend(additional_args.iter().cloned());
        parts.join(" ")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct AgentProfile {
    /// Unique identifier for this profile (e.g., "MyClaudeCode", "FastAmp")
    pub label: String,
    /// The executor type this profile configures
    pub agent: BaseCodingAgent,
    /// Command builder configuration
    pub command: CommandBuilder,
    /// Optional profile-specific MCP config file path (absolute; supports leading ~). Overrides the default `BaseCodingAgent` config path
    pub mcp_config_path: Option<String>,
}

impl AgentProfile {
    pub fn claude_code() -> Self {
        Self {
            label: "claude-code".to_string(),
            agent: BaseCodingAgent::ClaudeCode,
            command: CommandBuilder::new("npx -y @anthropic-ai/claude-code@latest").params(vec![
                "-p",
                "--dangerously-skip-permissions",
                "--verbose",
                "--output-format=stream-json",
            ]),
            mcp_config_path: None,
        }
    }

    pub fn claude_code_plan() -> Self {
        Self {
            label: "claude-code-plan".to_string(),
            agent: BaseCodingAgent::ClaudeCode,
            command: CommandBuilder::new("npx -y @anthropic-ai/claude-code@latest").params(vec![
                "-p",
                "--permission-mode=plan",
                "--verbose",
                "--output-format=stream-json",
            ]),
            mcp_config_path: None,
        }
    }

    pub fn claude_code_router() -> Self {
        Self {
            label: "claude-code-router".to_string(),
            agent: BaseCodingAgent::ClaudeCode,
            command: CommandBuilder::new("npx -y @musistudio/claude-code-router code").params(
                vec![
                    "-p",
                    "--dangerously-skip-permissions",
                    "--verbose",
                    "--output-format=stream-json",
                ],
            ),
            mcp_config_path: None,
        }
    }

    pub fn amp() -> Self {
        Self {
            label: "amp".to_string(),
            agent: BaseCodingAgent::Amp,
            command: CommandBuilder::new("npx -y @sourcegraph/amp@0.0.1752148945-gd8844f")
                .params(vec!["--format=jsonl"]),
            mcp_config_path: None,
        }
    }

    pub fn gemini() -> Self {
        Self {
            label: "gemini".to_string(),
            agent: BaseCodingAgent::Gemini,
            command: CommandBuilder::new("npx -y @google/gemini-cli@latest").params(vec!["--yolo"]),
            mcp_config_path: None,
        }
    }

    pub fn codex() -> Self {
        Self {
            label: "codex".to_string(),
            agent: BaseCodingAgent::Codex,
            command: CommandBuilder::new("npx -y @openai/codex exec").params(vec![
                "--json",
                "--dangerously-bypass-approvals-and-sandbox",
                "--skip-git-repo-check",
            ]),
            mcp_config_path: None,
        }
    }

    pub fn qwen_code() -> Self {
        Self {
            label: "qwen-code".to_string(),
            agent: BaseCodingAgent::Gemini,
            command: CommandBuilder::new("npx -y @qwen-code/qwen-code@latest")
                .params(vec!["--yolo"]),
            mcp_config_path: Some("~/.qwen/settings.json".to_string()),
        }
    }

    pub fn opencode() -> Self {
        Self {
            label: "opencode".to_string(),
            agent: BaseCodingAgent::Opencode,
            command: CommandBuilder::new("npx -y opencode-ai@latest run")
                .params(vec!["--print-logs"]),
            mcp_config_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct AgentProfiles {
    pub profiles: Vec<AgentProfile>,
}

impl AgentProfiles {
    pub fn get_cached() -> &'static AgentProfiles {
        PROFILES_CACHE.get_or_init(Self::load)
    }

    fn load() -> Self {
        let mut profiles = Self::from_defaults();

        if let Err(e) = profiles.extend_from_file() {
            if e.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!("Failed to load additional profiles: {}", e);
            }
        } else {
            tracing::info!("Loaded additional profiles from profiles.json");
        }

        profiles
    }

    pub fn from_defaults() -> Self {
        Self {
            profiles: vec![
                AgentProfile::claude_code(),
                AgentProfile::claude_code_plan(),
                AgentProfile::claude_code_router(),
                AgentProfile::amp(),
                AgentProfile::gemini(),
                AgentProfile::codex(),
                AgentProfile::opencode(),
                AgentProfile::qwen_code(),
            ],
        }
    }

    pub fn extend_from_file(&mut self) -> Result<(), std::io::Error> {
        let profiles_path = utils::assets::profiles_path();
        if !profiles_path.exists() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Profiles file not found at {profiles_path:?}"),
            ));
        }

        let content = fs::read_to_string(&profiles_path)?;

        let user_profiles: Self = serde_json::from_str(&content).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to parse profiles.json: {e}"),
            )
        })?;

        let default_labels: HashSet<String> =
            self.profiles.iter().map(|p| p.label.clone()).collect();

        // Only add user profiles with unique labels
        for user_profile in user_profiles.profiles {
            if !default_labels.contains(&user_profile.label) {
                self.profiles.push(user_profile);
            } else {
                tracing::debug!(
                    "Skipping user profile '{}' - default with same label exists",
                    user_profile.label
                );
            }
        }

        Ok(())
    }

    pub fn get_profile(&self, label: &str) -> Option<&AgentProfile> {
        self.profiles.iter().find(|p| p.label == label)
    }

    pub fn get_profiles_for_agent(&self, agent: &BaseCodingAgent) -> Vec<&AgentProfile> {
        self.profiles.iter().filter(|p| &p.agent == agent).collect()
    }

    pub fn to_map(&self) -> HashMap<String, AgentProfile> {
        self.profiles
            .iter()
            .map(|p| (p.label.clone(), p.clone()))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_profiles_have_expected_base_and_noninteractive_or_json_flags() {
        // Build default profiles and make lookup by label easy
        let profiles = AgentProfiles::from_defaults().to_map();

        let get_profile_command = |label: &str| {
            profiles
                .get(label)
                .map(|p| p.command.build_initial())
                .unwrap_or_else(|| panic!("Profile not found: {label}"))
        };

        let claude_code_command = get_profile_command("claude-code");
        assert!(claude_code_command.contains("npx -y @anthropic-ai/claude-code@latest"));
        assert!(claude_code_command.contains("-p"));
        assert!(claude_code_command.contains("--dangerously-skip-permissions"));

        let claude_code_router_command = get_profile_command("claude-code-router");
        assert!(claude_code_router_command.contains("npx -y @musistudio/claude-code-router code"));
        assert!(claude_code_router_command.contains("-p"));
        assert!(claude_code_router_command.contains("--dangerously-skip-permissions"));

        let amp_command = get_profile_command("amp");
        assert!(amp_command.contains("npx -y @sourcegraph/amp@0.0.1752148945-gd8844f"));
        assert!(amp_command.contains("--format=jsonl"));

        let gemini_command = get_profile_command("gemini");
        assert!(gemini_command.contains("npx -y @google/gemini-cli@latest"));
        assert!(gemini_command.contains("--yolo"));

        let codex_command = get_profile_command("codex");
        assert!(codex_command.contains("npx -y @openai/codex exec"));
        assert!(codex_command.contains("--json"));

        let qwen_code_command = get_profile_command("qwen-code");
        assert!(qwen_code_command.contains("npx -y @qwen-code/qwen-code@latest"));
        assert!(qwen_code_command.contains("--yolo"));

        let opencode_command = get_profile_command("opencode");
        assert!(opencode_command.contains("npx -y opencode-ai@latest run"));
        assert!(opencode_command.contains("--print-logs"));
    }
}
