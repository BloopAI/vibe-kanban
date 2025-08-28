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
    /// The coding agent this profile is associated with
    #[serde(flatten)]
    pub agent: CodingAgent,
    /// Optional profile-specific MCP config file path (absolute; supports leading ~). Overrides the default `BaseCodingAgent` config path
    pub mcp_config_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ProfileConfig {
    /// Unique identifier for this profile (e.g., "MyClaudeCode", "FastAmp")
    pub label: String,
    #[serde(flatten)]
    /// default profile variant
    pub default: VariantAgentConfig,
    /// additional variants for this profile, e.g. plan, review, subagent
    #[serde(default)]
    pub variants: HashMap<String, VariantAgentConfig>,
}

impl ProfileConfig {
    pub fn get_variant(&self, variant: &str) -> Option<&VariantAgentConfig> {
        self.variants.get(variant)
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
    pub profiles: HashMap<String, ProfileConfig>,
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

        let default_labels: HashSet<String> = self.profiles.keys().cloned().collect();

        // Only add user profiles with unique labels
        for (label, user_profile) in user_profiles.profiles {
            if !default_labels.contains(&label) {
                self.profiles.insert(label.clone(), user_profile);
            } else {
                tracing::debug!(
                    "Skipping user profile '{}' - default with same label exists",
                    label
                );
            }
        }

        Ok(())
    }

    pub fn get_profile(&self, label: &str) -> Option<&ProfileConfig> {
        self.profiles.get(label)
    }

    pub fn len(&self) -> usize {
        self.profiles.len()
    }

    pub fn to_map(&self) -> HashMap<String, ProfileConfig> {
        self.profiles.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn default_profiles_have_expected_agents_and_variants() {
        // Build default profiles and make lookup by label easy
        let profiles = ProfileConfigs::from_defaults().to_map();

        let get_profile_agent = |label: &str| {
            profiles
                .get(label)
                .map(|p| &p.default.agent)
                .unwrap_or_else(|| panic!("Profile not found: {label}"))
        };
        let profiles = ProfileConfigs::from_defaults();
        assert_eq!(profiles.len(), 8);

        // Test ClaudeCode variants
        let claude_code_agent = get_profile_agent("claude-code");
        assert!(matches!(claude_code_agent, crate::executors::CodingAgent::ClaudeCode(claude) 
            if matches!(claude.variant, crate::executors::claude::ClaudeCodeVariant::ClaudeCode) && !claude.plan));

        let claude_code_router_agent = get_profile_agent("claude-code-router");
        assert!(matches!(claude_code_router_agent, crate::executors::CodingAgent::ClaudeCode(claude) 
            if matches!(claude.variant, crate::executors::claude::ClaudeCodeVariant::ClaudeCodeRouter) && !claude.plan));

        // Test simple executors have correct types
        assert!(matches!(get_profile_agent("amp"), crate::executors::CodingAgent::Amp(_)));
        assert!(matches!(get_profile_agent("codex"), crate::executors::CodingAgent::Codex(_)));
        assert!(matches!(get_profile_agent("opencode"), crate::executors::CodingAgent::Opencode(_)));
        assert!(matches!(get_profile_agent("cursor"), crate::executors::CodingAgent::Cursor(_)));
        assert!(matches!(get_profile_agent("qwen-code"), crate::executors::CodingAgent::QwenCode(_)));

        // Test Gemini model variants
        let gemini_agent = get_profile_agent("gemini");
        assert!(matches!(gemini_agent, crate::executors::CodingAgent::Gemini(gemini) 
            if matches!(gemini.model, crate::executors::gemini::GeminiModel::Default)));

        // Test that plan variant exists for claude-code
        let claude_profile = profiles.get_profile("claude-code").unwrap();
        let plan_variant = claude_profile.get_variant("plan").unwrap();
        assert!(matches!(&plan_variant.agent, crate::executors::CodingAgent::ClaudeCode(claude) 
            if matches!(claude.variant, crate::executors::claude::ClaudeCodeVariant::ClaudeCode) && claude.plan));

        // Test that flash variant exists for gemini
        let gemini_profile = profiles.get_profile("gemini").unwrap();
        let flash_variant = gemini_profile.get_variant("flash").unwrap();
        assert!(matches!(&flash_variant.agent, crate::executors::CodingAgent::Gemini(gemini) 
            if matches!(gemini.model, crate::executors::gemini::GeminiModel::Flash)));
    }

    #[test]
    fn test_flattened_agent_deserialization() {
        let test_json = r#"{
            "profiles": {
                "test-claude": {
                    "label": "test-claude",
                    "mcp_config_path": null,
                    "CLAUDE_CODE": {
                        "variant": "claude_code",
                        "plan": true,
                        "append_prompt": null
                    },
                    "variants": {}
                },
                "test-gemini": {
                    "label": "test-gemini",
                    "mcp_config_path": null,
                    "GEMINI": {
                        "model": "flash",
                        "append_prompt": null
                    },
                    "variants": {}
                }
            }
        }"#;

        let profiles: ProfileConfigs = serde_json::from_str(test_json).expect("Should deserialize");
        assert_eq!(profiles.len(), 2);

        // Test Claude profile
        let claude_profile = profiles.get_profile("test-claude").unwrap();
        match &claude_profile.default.agent {
            crate::executors::CodingAgent::ClaudeCode(claude) => {
                assert!(matches!(claude.variant, crate::executors::claude::ClaudeCodeVariant::ClaudeCode));
                assert!(claude.plan);
            }
            _ => panic!("Expected ClaudeCode agent"),
        }

        // Test Gemini profile
        let gemini_profile = profiles.get_profile("test-gemini").unwrap();
        match &gemini_profile.default.agent {
            crate::executors::CodingAgent::Gemini(gemini) => {
                assert!(matches!(gemini.model, crate::executors::gemini::GeminiModel::Flash));
            }
            _ => panic!("Expected Gemini agent"),
        }
    }
}
