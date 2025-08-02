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
#[ts(export)]
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
#[ts(export)]
pub struct AgentProfile {
    /// Unique identifier for this profile (e.g., "MyClaudeCode", "FastAmp")
    pub label: String,
    /// The executor type this profile configures
    pub agent: BaseCodingAgent,
    /// Command builder configuration
    pub command: CommandBuilder,
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
        }
    }

    pub fn amp() -> Self {
        Self {
            label: "amp".to_string(),
            agent: BaseCodingAgent::Amp,
            command: CommandBuilder::new("npx -y @sourcegraph/amp@0.0.1752148945-gd8844f")
                .params(vec!["--format=jsonl"]),
        }
    }

    pub fn gemini() -> Self {
        Self {
            label: "gemini".to_string(),
            agent: BaseCodingAgent::Gemini,
            command: CommandBuilder::new("npx -y @google/gemini-cli@latest").params(vec!["--yolo"]),
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
        }
    }

    pub fn opencode() -> Self {
        Self {
            label: "opencode".to_string(),
            agent: BaseCodingAgent::Opencode,
            command: CommandBuilder::new("npx -y opencode-ai@latest run")
                .params(vec!["--print-logs"]),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct AgentProfiles {
    pub profiles: Vec<AgentProfile>,
}

impl AgentProfiles {
    pub fn get_cached() -> &'static AgentProfiles {
        PROFILES_CACHE.get_or_init(|| Self::load())
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
                AgentProfile::amp(),
                AgentProfile::gemini(),
                AgentProfile::codex(),
                AgentProfile::opencode(),
            ],
        }
    }

    pub fn extend_from_file(&mut self) -> Result<(), std::io::Error> {
        let profiles_path = utils::assets::profiles_path();
        if !profiles_path.exists() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Profiles file not found at {:?}", profiles_path),
            ));
        }

        let content = fs::read_to_string(&profiles_path)?;

        let user_profiles: Self = serde_json::from_str(&content).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to parse profiles.json: {}", e),
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
    fn test_command_builder() {
        let builder = CommandBuilder::new("npx claude").params(vec!["--verbose", "--json"]);
        assert_eq!(builder.build_initial(), "npx claude --verbose --json");
        assert_eq!(
            builder.build_follow_up(&["--resume".to_string(), "session123".to_string()]),
            "npx claude --verbose --json --resume session123"
        );
    }

    #[test]
    fn test_default_profiles() {
        let profiles = AgentProfiles::from_defaults();
        assert!(profiles.profiles.len() == 6);

        let claude_profile = profiles.get_profile("claude-code").unwrap();
        assert_eq!(claude_profile.agent, BaseCodingAgent::ClaudeCode);
        assert!(
            claude_profile
                .command
                .build_initial()
                .contains("claude-code")
        );
        assert!(
            claude_profile
                .command
                .build_initial()
                .contains("--dangerously-skip-permissions")
        );

        let amp_profile = profiles.get_profile("amp").unwrap();
        assert_eq!(amp_profile.agent, BaseCodingAgent::Amp);
        assert!(amp_profile.command.build_initial().contains("amp"));
        assert!(
            amp_profile
                .command
                .build_initial()
                .contains("--format=jsonl")
        );

        let gemini_profile = profiles.get_profile("gemini").unwrap();
        assert_eq!(gemini_profile.agent, BaseCodingAgent::Gemini);
        assert!(gemini_profile.command.build_initial().contains("gemini"));
        assert!(gemini_profile.command.build_initial().contains("--yolo"));

        let codex_profile = profiles.get_profile("codex").unwrap();
        assert_eq!(codex_profile.agent, BaseCodingAgent::Codex);
        assert!(codex_profile.command.build_initial().contains("codex"));
        assert!(codex_profile.command.build_initial().contains("--json"));

        let opencode_profile = profiles.get_profile("opencode").unwrap();
        assert_eq!(opencode_profile.agent, BaseCodingAgent::Opencode);
        assert!(
            opencode_profile
                .command
                .build_initial()
                .contains("opencode-ai")
        );
        assert!(opencode_profile.command.build_initial().contains("run"));
        assert!(
            opencode_profile
                .command
                .build_initial()
                .contains("--print-logs")
        );
    }

    #[test]
    fn test_profiles_for_agent() {
        let profiles = AgentProfiles::from_defaults();

        let claude_profiles = profiles.get_profiles_for_agent(&BaseCodingAgent::ClaudeCode);
        assert_eq!(claude_profiles.len(), 2); // default and plan mode

        let amp_profiles = profiles.get_profiles_for_agent(&BaseCodingAgent::Amp);
        assert_eq!(amp_profiles.len(), 1);
    }
}
