use std::{collections::HashMap, fs, path::PathBuf, sync::OnceLock};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::executors::CodingAgentExecutorType;

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
    pub agent: CodingAgentExecutorType,
    /// Command builder configuration
    pub command: CommandBuilder,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct AgentProfiles {
    pub profiles: Vec<AgentProfile>,
}

impl AgentProfiles {
    pub fn load_from_file(path: &PathBuf) -> Result<Self, std::io::Error> {
        let content = fs::read_to_string(path)?;
        serde_json::from_str(&content).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to parse profiles.json: {}", e),
            )
        })
    }

    pub fn get_profile(&self, label: &str) -> Option<&AgentProfile> {
        self.profiles.iter().find(|p| p.label == label)
    }

    pub fn get_profiles_for_agent(&self, agent: &CodingAgentExecutorType) -> Vec<&AgentProfile> {
        self.profiles.iter().filter(|p| &p.agent == agent).collect()
    }

    pub fn to_map(&self) -> HashMap<String, AgentProfile> {
        self.profiles
            .iter()
            .map(|p| (p.label.clone(), p.clone()))
            .collect()
    }
}

pub struct DefaultCommandBuilders;

impl DefaultCommandBuilders {
    pub fn claude_code() -> CommandBuilder {
        CommandBuilder::new("npx -y @anthropic-ai/claude-code@latest").params(vec![
            "-p",
            "--dangerously-skip-permissions",
            "--verbose",
            "--output-format=stream-json",
        ])
    }

    pub fn claude_code_plan() -> CommandBuilder {
        CommandBuilder::new("npx -y @anthropic-ai/claude-code@latest").params(vec![
            "-p",
            "--permission-mode=plan",
            "--verbose",
            "--output-format=stream-json",
        ])
    }

    pub fn amp() -> CommandBuilder {
        CommandBuilder::new("npx @sourcegraph/amp@0.0.1752148945-gd8844f")
            .params(vec!["--format=jsonl"])
    }

    pub fn gemini() -> CommandBuilder {
        CommandBuilder::new("npx @google/gemini-cli@latest").params(vec!["--yolo"])
    }

    pub fn default_profiles() -> AgentProfiles {
        AgentProfiles {
            profiles: vec![
                AgentProfile {
                    label: "claude-code".to_string(),
                    agent: CodingAgentExecutorType::ClaudeCode,
                    command: Self::claude_code(),
                },
                AgentProfile {
                    label: "claude-code-plan".to_string(),
                    agent: CodingAgentExecutorType::ClaudeCode,
                    command: Self::claude_code_plan(),
                },
                AgentProfile {
                    label: "amp".to_string(),
                    agent: CodingAgentExecutorType::Amp,
                    command: Self::amp(),
                },
                AgentProfile {
                    label: "gemini".to_string(),
                    agent: CodingAgentExecutorType::Gemini,
                    command: Self::gemini(),
                },
            ],
        }
    }
}

pub struct ProfileManager;

impl ProfileManager {
    pub fn get_profiles() -> &'static AgentProfiles {
        PROFILES_CACHE.get_or_init(|| Self::load_profiles())
    }

    fn load_profiles() -> AgentProfiles {
        let profiles_path = utils::assets::profiles_path();

        if profiles_path.exists() {
            match AgentProfiles::load_from_file(&profiles_path) {
                Ok(profiles) => {
                    tracing::info!("Loaded agent profiles from {:?}", profiles_path);
                    profiles
                }
                Err(e) => {
                    tracing::warn!("Failed to load profiles from {:?}: {}", profiles_path, e);
                    DefaultCommandBuilders::default_profiles()
                }
            }
        } else {
            tracing::debug!(
                "No profiles.json found at {:?}, using defaults",
                profiles_path
            );
            DefaultCommandBuilders::default_profiles()
        }
    }

    pub fn get_profile(label: &str) -> Option<&'static AgentProfile> {
        Self::get_profiles().get_profile(label)
    }

    pub fn get_command_builder(label: &str) -> Option<CommandBuilder> {
        Self::get_profile(label).map(|p| p.command.clone())
    }

    pub fn get_profiles_for_agent(agent: &CodingAgentExecutorType) -> Vec<&'static AgentProfile> {
        Self::get_profiles().get_profiles_for_agent(agent)
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
    fn test_default_builders() {
        let claude = DefaultCommandBuilders::claude_code();
        assert!(claude.build_initial().contains("claude-code"));
        assert!(
            claude
                .build_initial()
                .contains("--dangerously-skip-permissions")
        );

        let amp = DefaultCommandBuilders::amp();
        assert!(amp.build_initial().contains("amp"));
        assert!(amp.build_initial().contains("--format=jsonl"));

        let gemini = DefaultCommandBuilders::gemini();
        assert!(gemini.build_initial().contains("gemini"));
        assert!(gemini.build_initial().contains("--yolo"));
    }

    #[test]
    fn test_agent_profiles() {
        let profiles = DefaultCommandBuilders::default_profiles();
        assert_eq!(profiles.profiles.len(), 4);

        let claude_profile = profiles.get_profile("claude-code").unwrap();
        assert_eq!(claude_profile.agent, CodingAgentExecutorType::ClaudeCode);

        let claude_profiles = profiles.get_profiles_for_agent(&CodingAgentExecutorType::ClaudeCode);
        assert_eq!(claude_profiles.len(), 2); // default and plan mode
    }
}
