use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::RwLock,
};

use chrono::Utc;
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp_config_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ProfileConfig {
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

// Type alias for variant differences - None means delete, Some means add/change, absent means unchanged
pub type VariantDiff = HashMap<String, Option<VariantAgentConfig>>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct PartialProfileConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<VariantAgentConfig>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub variants: VariantDiff,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct PartialProfileConfigs {
    pub profiles: HashMap<String, PartialProfileConfig>,
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

    /// Create a partial profile by computing differences from defaults
    pub fn create_partial_profile(
        default: &ProfileConfig,
        modified: &ProfileConfig,
    ) -> PartialProfileConfig {
        let mut partial = PartialProfileConfig {
            default: None,
            variants: HashMap::new(),
        };

        // Check if default variant changed
        if default.default != modified.default {
            partial.default = Some(modified.default.clone());
        }

        // Compute variants diff
        partial.variants = Self::variants_diff(&default.variants, &modified.variants);

        partial
    }

    /// Compute differences between two variant maps
    fn variants_diff(
        default: &HashMap<String, VariantAgentConfig>,
        modified: &HashMap<String, VariantAgentConfig>,
    ) -> VariantDiff {
        let mut diff = HashMap::new();

        // Find changed or added variants
        for (k, mod_v) in modified {
            match default.get(k) {
                Some(def_v) if def_v == mod_v => {
                    // Unchanged, don't include in diff
                }
                _ => {
                    // Changed or added
                    diff.insert(k.clone(), Some(mod_v.clone()));
                }
            }
        }

        // Find removed variants
        for k in default.keys() {
            if !modified.contains_key(k) {
                diff.insert(k.clone(), None);
            }
        }

        diff
    }

    /// Load profiles from partial format and merge with defaults
    pub fn load_from_partials(partials: &PartialProfileConfigs) -> ProfileConfigs {
        let mut defaults = Self::from_defaults();
        Self::apply_partials(&mut defaults, partials);
        defaults
    }

    /// Apply partial configurations to a base ProfileConfigs
    fn apply_partials(base: &mut ProfileConfigs, partials: &PartialProfileConfigs) {
        for (profile_label, partial) in &partials.profiles {
            match base.profiles.get_mut(profile_label) {
                Some(existing_profile) => {
                    // Apply changes to existing profile
                    Self::apply_partial_to_profile(existing_profile, partial);
                }
                None => {
                    // Create new profile from partial
                    if let Some(new_profile) =
                        Self::create_profile_from_partial(profile_label, partial)
                    {
                        base.profiles.insert(profile_label.clone(), new_profile);
                    }
                }
            }
        }
    }

    /// Apply a partial configuration to an existing profile
    fn apply_partial_to_profile(profile: &mut ProfileConfig, partial: &PartialProfileConfig) {
        // Update default variant if specified
        if let Some(new_default) = &partial.default {
            profile.default = new_default.clone();
        }

        // Apply variant changes
        for (variant_key, variant_change) in &partial.variants {
            match variant_change {
                Some(new_variant) => {
                    // Add or update variant
                    profile
                        .variants
                        .insert(variant_key.clone(), new_variant.clone());
                }
                None => {
                    // Remove variant
                    profile.variants.remove(variant_key);
                }
            }
        }
    }

    /// Create a new profile from a partial configuration
    fn create_profile_from_partial(
        _profile_label: &str,
        partial: &PartialProfileConfig,
    ) -> Option<ProfileConfig> {
        // For completely new profiles, we need at least a default variant
        let default = partial.default.as_ref()?.clone();

        let mut profile = ProfileConfig {
            default,
            variants: HashMap::new(),
        };

        // Apply variant changes
        for (variant_key, variant_change) in &partial.variants {
            if let Some(variant) = variant_change {
                profile
                    .variants
                    .insert(variant_key.clone(), variant.clone());
            }
        }

        Some(profile)
    }

    /// Save profiles as partial configurations (diffs from defaults)
    pub fn save_as_diffs(&self) -> Result<(), Box<dyn std::error::Error>> {
        let defaults = Self::from_defaults();
        let mut partials = PartialProfileConfigs {
            profiles: HashMap::new(),
        };

        // Generate partials for each profile
        for (profile_label, profile) in &self.profiles {
            if let Some(default_profile) = defaults.profiles.get(profile_label) {
                // Profile exists in defaults, compute diff
                let partial = Self::create_partial_profile(default_profile, profile);

                // Only save if there are actual differences
                if partial.default.is_some() || !partial.variants.is_empty() {
                    partials.profiles.insert(profile_label.clone(), partial);
                }
            } else {
                // New profile, save as complete partial
                let partial = PartialProfileConfig {
                    default: Some(profile.default.clone()),
                    variants: profile
                        .variants
                        .iter()
                        .map(|(k, v)| (k.clone(), Some(v.clone())))
                        .collect(),
                };
                partials.profiles.insert(profile_label.clone(), partial);
            }
        }

        // Save to file
        let profiles_path = utils::assets::profiles_path();
        let content = serde_json::to_string_pretty(&partials)?;
        fs::write(&profiles_path, content)?;

        tracing::info!(
            "Saved profiles as partial configurations to {:?}",
            profiles_path
        );
        Ok(())
    }

    fn load() -> Self {
        let profiles_path = utils::assets::profiles_path();

        // Load from profiles.json if it exists, otherwise use defaults
        let content = match fs::read_to_string(&profiles_path) {
            Ok(content) => content,
            Err(e) => {
                tracing::warn!("Failed to read profiles.json: {}, using defaults", e);
                return Self::from_defaults();
            }
        };

        // First try to parse as full ProfileConfigs (legacy format)
        if let Ok(full_profiles) = serde_json::from_str::<Self>(&content) {
            tracing::info!("Loaded full profiles from profiles.json (legacy format)");

            // Auto-migrate to partial format
            if let Err(e) = Self::migrate_to_partial_format(&full_profiles) {
                tracing::error!("Failed to migrate profiles to partial format: {}", e);
            }

            return full_profiles;
        }

        // Try to parse as PartialProfileConfigs (new format)
        match serde_json::from_str::<PartialProfileConfigs>(&content) {
            Ok(partials) => {
                tracing::info!("Loaded partial profiles from profiles.json");
                Self::load_from_partials(&partials)
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to parse profiles.json as either format: {}, using defaults",
                    e
                );
                Self::from_defaults()
            }
        }
    }

    /// Migrate full profiles to partial format with backup
    fn migrate_to_partial_format(
        full_profiles: &ProfileConfigs,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let profiles_path = utils::assets::profiles_path();

        // Create backup with timestamp
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let backup_path = profiles_path.with_extension(format!("json.bak-{timestamp}"));

        if let Ok(original_content) = fs::read_to_string(&profiles_path) {
            fs::write(&backup_path, original_content)?;
            tracing::info!("Created backup at {:?}", backup_path);
        }

        // Save as partial format
        full_profiles.save_as_diffs()?;
        tracing::info!("Successfully migrated profiles to partial format");

        Ok(())
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
    use std::collections::HashMap;

    use super::*;

    #[test]
    fn test_partial_profile_structures() {
        // Test that PartialProfileConfig structures serialize correctly
        let partial = PartialProfileConfig {
            default: None,
            variants: HashMap::new(),
        };

        // Should serialize to JSON without panicking
        let json = serde_json::to_string(&partial);
        assert!(json.is_ok());

        let partials = PartialProfileConfigs {
            profiles: {
                let mut profiles = HashMap::new();
                profiles.insert("test".to_string(), partial);
                profiles
            },
        };

        // Should serialize to JSON without panicking
        let json = serde_json::to_string(&partials);
        assert!(json.is_ok());
    }

    #[test]
    fn test_load_from_empty_partials() {
        let partials = PartialProfileConfigs {
            profiles: HashMap::new(),
        };

        let result = ProfileConfigs::load_from_partials(&partials);
        let defaults = ProfileConfigs::from_defaults();

        // Should be identical to defaults when no partials provided
        assert_eq!(result.profiles.len(), defaults.profiles.len());
    }

    #[test]
    fn test_no_null_values_in_serialization() {
        use crate::{command::CmdOverrides, executors::claude::ClaudeCode};

        // Test that None values are omitted from JSON serialization
        let variant = VariantAgentConfig {
            agent: CodingAgent::ClaudeCode(ClaudeCode {
                claude_code_router: Some(false),
                append_prompt: None,
                plan: None, // Should be omitted when None
                dangerously_skip_permissions: None,
                cmd: CmdOverrides {
                    base_command_override: None,
                    additional_params: None,
                },
            }),
            mcp_config_path: None, // This should be omitted
        };

        let json = serde_json::to_string(&variant).unwrap();
        assert!(!json.contains("null"));
        assert!(!json.contains("mcp_config_path"));
        assert!(!json.contains("plan")); // Should be omitted when false

        // Test PartialProfileConfig with all None values
        let partial = PartialProfileConfig {
            default: None,
            variants: HashMap::new(),
        };

        let json = serde_json::to_string(&partial).unwrap();
        assert!(!json.contains("null"));
        assert!(!json.contains("label"));
        assert!(!json.contains("default"));
        // Empty variants HashMap should be omitted entirely, resulting in empty object
        assert_eq!(json, r#"{}"#);
    }

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
        assert!(matches!(
            claude_code_agent,
            crate::executors::CodingAgent::ClaudeCode(claude)
                if !claude.claude_code_router.unwrap_or(false)
                    && !claude.plan.unwrap_or(false)
        ));

        let claude_code_router_agent = get_profile_agent("claude-code-router");
        assert!(matches!(
            claude_code_router_agent,
            crate::executors::CodingAgent::ClaudeCode(claude)
                if claude.claude_code_router.unwrap_or(false) && !claude.plan.unwrap_or(false)
        ));

        // Test simple executors have correct types
        assert!(matches!(
            get_profile_agent("amp"),
            crate::executors::CodingAgent::Amp(_)
        ));
        assert!(matches!(
            get_profile_agent("codex"),
            crate::executors::CodingAgent::Codex(_)
        ));
        assert!(matches!(
            get_profile_agent("opencode"),
            crate::executors::CodingAgent::Opencode(_)
        ));
        assert!(matches!(
            get_profile_agent("cursor"),
            crate::executors::CodingAgent::Cursor(_)
        ));
        assert!(matches!(
            get_profile_agent("qwen-code"),
            crate::executors::CodingAgent::QwenCode(_)
        ));

        // Test Gemini model variants
        let gemini_agent = get_profile_agent("gemini");
        assert!(
            matches!(gemini_agent, crate::executors::CodingAgent::Gemini(gemini)
            if matches!(gemini.model, crate::executors::gemini::GeminiModel::Default))
        );

        // Test that plan variant exists for claude-code
        let claude_profile = profiles.get_profile("claude-code").unwrap();
        let plan_variant = claude_profile.get_variant("plan").unwrap();
        assert!(matches!(
            &plan_variant.agent,
            crate::executors::CodingAgent::ClaudeCode(claude)
                if !claude.claude_code_router.unwrap_or(false)
                    && claude.plan.unwrap_or(false)
        ));

        // Test that flash variant exists for gemini
        let gemini_profile = profiles.get_profile("gemini").unwrap();
        let flash_variant = gemini_profile.get_variant("flash").unwrap();
        assert!(
            matches!(&flash_variant.agent, crate::executors::CodingAgent::Gemini(gemini)
            if matches!(gemini.model, crate::executors::gemini::GeminiModel::Flash))
        );
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
                assert!(!claude.claude_code_router.unwrap_or(false));
                assert!(claude.plan.unwrap_or(false));
            }
            _ => panic!("Expected ClaudeCode agent"),
        }

        // Test Gemini profile
        let gemini_profile = profiles.get_profile("test-gemini").unwrap();
        match &gemini_profile.default.agent {
            crate::executors::CodingAgent::Gemini(gemini) => {
                assert!(matches!(
                    gemini.model,
                    crate::executors::gemini::GeminiModel::Flash
                ));
            }
            _ => panic!("Expected Gemini agent"),
        }
    }
}
