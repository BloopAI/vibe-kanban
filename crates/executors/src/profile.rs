use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::RwLock,
};

use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::executors::CodingAgent;

lazy_static! {
    static ref PROFILES_CACHE: RwLock<ProfileConfigs> = RwLock::new(ProfileConfigs::load());
}

// Default profiels embedded at compile time
const DEFAULT_PROFILES_JSON: &str = include_str!("../default_profiles.json");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct VariantAgentConfig {
    /// Unique identifier for this profile (e.g., "MyClaudeCode", "FastAmp")
    pub label: String,
    /// The coding agent this profile is associated with
    #[serde(flatten)]
    pub agent: CodingAgent,
    /// Optional profile-specific MCP config file path (absolute; supports leading ~). Overrides the default `BaseCodingAgent` config path
    pub mcp_config_path: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ProfileConfig {
    #[serde(flatten)]
    /// default profile variant
    pub default: VariantAgentConfig,
    /// additional variants for this profile, e.g. plan, review, subagent
    pub variants: Vec<VariantAgentConfig>,
}

impl ProfileConfig {
    pub fn get_variant(&self, variant: &str) -> Option<&VariantAgentConfig> {
        self.variants.iter().find(|m| m.label == variant)
    }

    pub fn get_mcp_config_path(&self) -> Option<PathBuf> {
        match self.default.mcp_config_path.as_ref() {
            Some(path) => Some(PathBuf::from(path)),
            None => self.default.agent.default_mcp_config_path(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ProfileVariantLabel {
    pub profile: String,
    pub variant: Option<String>,
}

impl ProfileVariantLabel {
    pub fn default(profile: String) -> Self {
        Self {
            profile,
            variant: None,
        }
    }
    pub fn with_variant(profile: String, mode: String) -> Self {
        Self {
            profile,
            variant: Some(mode),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ProfileConfigs {
    pub profiles: Vec<ProfileConfig>,
}

impl ProfileConfigs {
    pub fn get_cached() -> ProfileConfigs {
        PROFILES_CACHE.read().unwrap().clone()
    }

    pub fn reload() {
        let mut cache = PROFILES_CACHE.write().unwrap();
        *cache = Self::load();
    }

    fn load() -> Self {
        let profiles_path = utils::assets::profiles_path();

        // load from profiles.json if it exists, otherwise use defaults
        let content = match fs::read_to_string(&profiles_path) {
            Ok(content) => content,
            Err(e) => {
                tracing::warn!("Failed to read profiles.json: {}, using defaults", e);
                return Self::from_defaults();
            }
        };

        match serde_json::from_str::<Self>(&content) {
            Ok(profiles) => {
                tracing::info!("Loaded all profiles from profiles.json");
                profiles
            }
            Err(e) => {
                tracing::warn!("Failed to parse profiles.json: {}, using defaults", e);
                Self::from_defaults()
            }
        }
    }

    pub fn from_defaults() -> Self {
        serde_json::from_str(DEFAULT_PROFILES_JSON).unwrap_or_else(|e| {
            tracing::error!("Failed to parse embedded default_profiles.json: {}", e);
            panic!("Default profiles JSON is invalid")
        })
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

        let default_labels: HashSet<String> = self
            .profiles
            .iter()
            .map(|p| p.default.label.clone())
            .collect();

        // Only add user profiles with unique labels
        for user_profile in user_profiles.profiles {
            if !default_labels.contains(&user_profile.default.label) {
                self.profiles.push(user_profile);
            } else {
                tracing::debug!(
                    "Skipping user profile '{}' - default with same label exists",
                    user_profile.default.label
                );
            }
        }

        Ok(())
    }

    pub fn get_profile(&self, label: &str) -> Option<&ProfileConfig> {
        self.profiles.iter().find(|p| p.default.label == label)
    }

    pub fn to_map(&self) -> HashMap<String, ProfileConfig> {
        self.profiles
            .iter()
            .map(|p| (p.default.label.clone(), p.clone()))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn default_profiles_have_expected_base_and_noninteractive_or_json_flags() {
        // Build default profiles and make lookup by label easy
        let profiles = ProfileConfigs::from_defaults().to_map();

        let get_profile_command = |label: &str| {
            profiles
                .get(label)
                .map(|p| {
                    use crate::executors::CodingAgent;
                    match &p.default.agent {
                        CodingAgent::ClaudeCode(claude) => claude.command.build_initial(),
                        CodingAgent::Amp(amp) => amp.command.build_initial(),
                        CodingAgent::Gemini(gemini) => gemini.command.build_initial(),
                        CodingAgent::Codex(codex) => codex.command.build_initial(),
                        CodingAgent::Opencode(opencode) => opencode.command.build_initial(),
                        CodingAgent::Cursor(cursor) => cursor.command.build_initial(),
                    }
                })
                .unwrap_or_else(|| panic!("Profile not found: {label}"))
        };
        let profiles = ProfileConfigs::from_defaults();
        assert!(profiles.profiles.len() == 8);

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

        let cursor_command = get_profile_command("cursor");
        assert!(cursor_command.contains("cursor-agent"));
        assert!(cursor_command.contains("-p"));
        assert!(cursor_command.contains("--output-format=stream-json"));
    }

    #[test]
    fn test_flattened_agent_deserialization() {
        let test_json = r#"{
            "profiles": [
                {
                    "label": "test-claude",
                    "mcp_config_path": null,
                    "CLAUDE_CODE": {
                        "command": {
                            "base": "npx claude",
                            "params": ["--test"]
                        },
                        "plan": true
                    },
                    "variants": []
                },
                {
                    "label": "test-gemini",
                    "mcp_config_path": null,
                    "GEMINI": {
                        "command": {
                            "base": "npx gemini",
                            "params": ["--test"]
                        }
                    },
                    "variants": []
                }
            ]
        }"#;

        let profiles: ProfileConfigs = serde_json::from_str(test_json).expect("Should deserialize");
        assert_eq!(profiles.profiles.len(), 2);

        // Test Claude profile
        let claude_profile = profiles.get_profile("test-claude").unwrap();
        match &claude_profile.default.agent {
            crate::executors::CodingAgent::ClaudeCode(claude) => {
                assert_eq!(claude.command.base, "npx claude");
                assert_eq!(claude.command.params.as_ref().unwrap()[0], "--test");
                assert_eq!(claude.plan, true);
            }
            _ => panic!("Expected ClaudeCode agent"),
        }

        // Test Gemini profile
        let gemini_profile = profiles.get_profile("test-gemini").unwrap();
        match &gemini_profile.default.agent {
            crate::executors::CodingAgent::Gemini(gemini) => {
                assert_eq!(gemini.command.base, "npx gemini");
                assert_eq!(gemini.command.params.as_ref().unwrap()[0], "--test");
            }
            _ => panic!("Expected Gemini agent"),
        }
    }
}
