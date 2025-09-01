use std::{collections::HashMap, fs, path::PathBuf, sync::RwLock};

use convert_case::{Case, Casing};
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use strum::VariantNames;
use thiserror::Error;
use ts_rs::TS;

use crate::executors::CodingAgent;

/// Return the canonical form for variant keys.
/// – "DEFAULT" is kept as-is  
/// – everything else is converted to SCREAMING_SNAKE_CASE
pub fn canonical_variant_key<S: AsRef<str>>(raw: S) -> String {
    let key = raw.as_ref();
    if key.eq_ignore_ascii_case("DEFAULT") {
        "DEFAULT".to_string()
    } else {
        // Convert to SCREAMING_SNAKE_CASE by first going to snake_case then uppercase
        key.to_case(Case::Snake).to_case(Case::ScreamingSnake)
    }
}

#[derive(Error, Debug)]
pub enum ProfileError {
    #[error("Built-in executor '{executor}' cannot be deleted")]
    CannotDeleteExecutor { executor: String },

    #[error("Built-in configuration '{executor}:{variant}' cannot be deleted")]
    CannotDeleteBuiltInConfig { executor: String, variant: String },

    #[error("Validation error: {0}")]
    Validation(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Serde(#[from] serde_json::Error),
}

lazy_static! {
    static ref EXECUTOR_PROFILES_CACHE: RwLock<ExecutorConfigs> =
        RwLock::new(ExecutorConfigs::load());
}

// New format default profiles (v3 - flattened)
const DEFAULT_PROFILES_JSON: &str = include_str!("../default_profiles.json");

// Executor-centric profile identifier
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, Hash, Eq)]
pub struct ExecutorProfileId {
    /// The executor type (e.g., "CLAUDE_CODE", "AMP")
    #[serde(alias = "profile")]
    // Backwards compatability with ProfileVariantIds, esp stored in DB under ExecutorAction
    pub executor: String,
    /// Optional variant name (e.g., "PLAN", "ROUTER")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
}

impl ExecutorProfileId {
    /// Create a new executor profile ID with default variant
    pub fn new(executor: String) -> Self {
        Self {
            executor,
            variant: None,
        }
    }

    /// Create a new executor profile ID with specific variant
    pub fn with_variant(executor: String, variant: String) -> Self {
        Self {
            executor,
            variant: Some(variant),
        }
    }

    /// Get cache key for this executor profile
    pub fn cache_key(&self) -> String {
        match &self.variant {
            Some(variant) => format!("{}:{}", self.executor, variant),
            None => self.executor.clone(),
        }
    }
}

impl std::fmt::Display for ExecutorProfileId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.variant {
            Some(variant) => write!(f, "{}:{}", self.executor, variant),
            None => write!(f, "{}", self.executor),
        }
    }
}

impl std::str::FromStr for ExecutorProfileId {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if let Some((executor, variant)) = s.split_once(':') {
            Ok(Self::with_variant(
                executor.to_string(),
                variant.to_string(),
            ))
        } else {
            Ok(Self::new(s.to_string()))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct VariantAgentConfig {
    /// The coding agent this profile is associated with
    #[serde(flatten)]
    pub agent: CodingAgent,
}

// New executor-centric data structures (v3 - flattened)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, type = "{ [key in string]: VariantAgentConfig }")]
pub struct ExecutorProfile {
    /// All configurations for this executor (default + variants)
    /// Key "DEFAULT" is reserved for the default configuration
    #[serde(flatten)]
    pub configurations: HashMap<String, VariantAgentConfig>,
}

impl ExecutorProfile {
    /// Get variant configuration by name, or None if not found
    pub fn get_variant(&self, variant: &str) -> Option<&VariantAgentConfig> {
        self.configurations.get(variant)
    }

    /// Get the default configuration for this executor
    pub fn get_default(&self) -> Option<&VariantAgentConfig> {
        self.configurations.get("DEFAULT")
    }

    /// Get MCP config path from default configuration
    pub fn get_mcp_config_path(&self) -> Option<PathBuf> {
        self.get_default()?.agent.default_mcp_config_path()
    }

    /// Create a new executor profile with just a default configuration
    pub fn new_with_default(default_config: VariantAgentConfig) -> Self {
        let mut configurations = HashMap::new();
        configurations.insert("DEFAULT".to_string(), default_config);
        Self { configurations }
    }

    /// Add or update a variant configuration
    pub fn set_variant(
        &mut self,
        variant_name: String,
        config: VariantAgentConfig,
    ) -> Result<(), &'static str> {
        let key = canonical_variant_key(&variant_name);
        if key == "DEFAULT" {
            return Err(
                "Cannot override 'DEFAULT' variant using set_variant, use set_default instead",
            );
        }
        self.configurations.insert(key, config);
        Ok(())
    }

    /// Set the default configuration
    pub fn set_default(&mut self, config: VariantAgentConfig) {
        self.configurations.insert("DEFAULT".to_string(), config);
    }

    /// Get all variant names (excluding "DEFAULT")
    pub fn variant_names(&self) -> Vec<&String> {
        self.configurations
            .keys()
            .filter(|k| *k != "DEFAULT")
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ExecutorConfigs {
    pub executors: HashMap<String, ExecutorProfile>,
}

// Type alias for backwards compatibility during transition
pub type ExecutorProfileConfigs = ExecutorConfigs;

impl ExecutorConfigs {
    /// Normalise all variant keys in-place
    fn canonicalise(&mut self) {
        for profile in self.executors.values_mut() {
            let mut replacements = Vec::new();
            for key in profile.configurations.keys().cloned().collect::<Vec<_>>() {
                let canon = canonical_variant_key(&key);
                if canon != key {
                    replacements.push((key, canon));
                }
            }
            for (old, new) in replacements {
                if let Some(cfg) = profile.configurations.remove(&old) {
                    // If both lowercase and canonical forms existed, keep canonical one
                    profile.configurations.entry(new).or_insert(cfg);
                }
            }
        }
    }

    /// Get cached executor profiles
    pub fn get_cached() -> ExecutorConfigs {
        EXECUTOR_PROFILES_CACHE.read().unwrap().clone()
    }

    /// Reload executor profiles cache
    pub fn reload() {
        let mut cache = EXECUTOR_PROFILES_CACHE.write().unwrap();
        *cache = Self::load();
    }

    /// Load executor profiles from file or defaults
    pub fn load() -> Self {
        let profiles_path = utils::assets::profiles_path();

        // Load defaults first
        let mut defaults = Self::from_defaults_v3();
        defaults.canonicalise();

        // Try to load user overrides
        let content = match fs::read_to_string(&profiles_path) {
            Ok(content) => content,
            Err(_) => {
                tracing::info!("No user profiles.json found, using defaults only");
                return defaults;
            }
        };

        // Parse user overrides
        match serde_json::from_str::<Self>(&content) {
            Ok(mut user_overrides) => {
                tracing::info!("Loaded user profile overrides from profiles.json");
                user_overrides.canonicalise();
                Self::merge_with_defaults(defaults, user_overrides)
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to parse user profiles.json: {}, using defaults only",
                    e
                );
                defaults
            }
        }
    }

    /// Save user profile overrides to file (only saves what differs from defaults)
    pub fn save_overrides(&self) -> Result<(), ProfileError> {
        let profiles_path = utils::assets::profiles_path();
        let mut defaults = Self::from_defaults_v3();
        defaults.canonicalise();

        // Canonicalise current config before computing overrides
        let mut self_clone = self.clone();
        self_clone.canonicalise();

        // Compute differences from defaults
        let overrides = Self::compute_overrides(&defaults, &self_clone)?;

        // Validate the merged result would be valid
        let merged = Self::merge_with_defaults(defaults, overrides.clone());
        Self::validate_merged(&merged)?;

        // Write overrides directly to file
        let content = serde_json::to_string_pretty(&overrides)?;
        fs::write(&profiles_path, content)?;

        tracing::info!("Saved profile overrides to {:?}", profiles_path);
        Ok(())
    }

    /// Deep merge defaults with user overrides
    fn merge_with_defaults(mut defaults: Self, overrides: Self) -> Self {
        for (executor_key, override_profile) in overrides.executors {
            match defaults.executors.get_mut(&executor_key) {
                Some(default_profile) => {
                    // Merge configurations (user configs override defaults, new ones are added)
                    for (config_name, config) in override_profile.configurations {
                        default_profile.configurations.insert(config_name, config);
                    }
                }
                None => {
                    // New executor, add completely
                    defaults.executors.insert(executor_key, override_profile);
                }
            }
        }
        defaults
    }

    /// Compute what overrides are needed to transform defaults into current config
    fn compute_overrides(defaults: &Self, current: &Self) -> Result<Self, ProfileError> {
        let mut overrides = Self {
            executors: HashMap::new(),
        };

        // Fast scan for any illegal deletions BEFORE allocating/cloning
        for (executor_key, default_profile) in &defaults.executors {
            // Check if executor was removed entirely
            if !current.executors.contains_key(executor_key) {
                return Err(ProfileError::CannotDeleteExecutor {
                    executor: executor_key.clone(),
                });
            }

            let current_profile = &current.executors[executor_key];

            // Check if ANY built-in configuration was removed
            for config_name in default_profile.configurations.keys() {
                if !current_profile.configurations.contains_key(config_name) {
                    return Err(ProfileError::CannotDeleteBuiltInConfig {
                        executor: executor_key.clone(),
                        variant: config_name.clone(),
                    });
                }
            }
        }

        for (executor_key, current_profile) in &current.executors {
            if let Some(default_profile) = defaults.executors.get(executor_key) {
                let mut override_configurations = HashMap::new();

                // Check each configuration in current profile
                for (config_name, current_config) in &current_profile.configurations {
                    if let Some(default_config) = default_profile.configurations.get(config_name) {
                        // Only include if different from default
                        if current_config != default_config {
                            override_configurations
                                .insert(config_name.clone(), current_config.clone());
                        }
                    } else {
                        // New configuration, always include
                        override_configurations.insert(config_name.clone(), current_config.clone());
                    }
                }

                // Only include executor if there are actual differences
                if !override_configurations.is_empty() {
                    overrides.executors.insert(
                        executor_key.clone(),
                        ExecutorProfile {
                            configurations: override_configurations,
                        },
                    );
                }
            } else {
                // New executor, include completely
                overrides
                    .executors
                    .insert(executor_key.clone(), current_profile.clone());
            }
        }

        Ok(overrides)
    }

    /// Validate that merged profiles are consistent and valid
    fn validate_merged(merged: &Self) -> Result<(), ProfileError> {
        let valid_executor_keys = CodingAgent::VARIANTS;

        for (executor_key, profile) in &merged.executors {
            // Validate executor key is a known CodingAgent variant
            if !valid_executor_keys.contains(&executor_key.as_str()) {
                return Err(ProfileError::Validation(format!(
                    "Unknown executor key '{executor_key}'. Valid keys: {valid_executor_keys:?}"
                )));
            }

            // Ensure default configuration exists
            let default_config = profile.configurations.get("DEFAULT").ok_or_else(|| {
                ProfileError::Validation(format!(
                    "Executor '{executor_key}' is missing required 'default' configuration"
                ))
            })?;

            // Validate that the default agent type matches the executor key
            if default_config.agent.to_string() != *executor_key {
                return Err(ProfileError::Validation(format!(
                    "Executor key '{executor_key}' does not match the agent variant '{}'",
                    default_config.agent
                )));
            }

            // Ensure configuration names don't conflict with reserved words
            for config_name in profile.configurations.keys() {
                if config_name.starts_with("__") {
                    return Err(ProfileError::Validation(format!(
                        "Configuration name '{config_name}' is reserved (starts with '__')"
                    )));
                }
            }
        }
        Ok(())
    }

    /// Get agent by executor profile ID
    pub fn get_agent_by_id(&self, id: &ExecutorProfileId) -> Option<CodingAgent> {
        self.get_agent(&id.executor, id.variant.as_deref())
    }

    /// Load from the new v3 defaults
    pub fn from_defaults_v3() -> Self {
        serde_json::from_str(DEFAULT_PROFILES_JSON).unwrap_or_else(|e| {
            tracing::error!("Failed to parse embedded default_profiles.json: {}", e);
            panic!("Default profiles v3 JSON is invalid")
        })
    }

    // Alias for backwards compatibility
    pub fn from_defaults_v2() -> Self {
        Self::from_defaults_v3()
    }

    /// Get profile by executor key
    pub fn get_executor_profile(&self, executor_key: &str) -> Option<&ExecutorProfile> {
        self.executors.get(executor_key)
    }

    /// Get agent by executor key and optional variant
    pub fn get_agent(&self, executor_key: &str, variant: Option<&str>) -> Option<CodingAgent> {
        let uppercase_key = executor_key.to_uppercase(); // Backwards compatibility with old ProfileVariant
        self.get_executor_profile(&uppercase_key)
            .and_then(|profile| {
                let variant_name = variant.unwrap_or("DEFAULT");
                profile
                    .get_variant(variant_name)
                    .or_else(|| profile.get_variant("DEFAULT"))
                    .map(|v| v.agent.clone())
            })
    }

    /// Get profile by executor key, create with default config if not found
    pub fn get_mcp_config_path(&self, executor_key: &str) -> Option<PathBuf> {
        self.get_executor_profile(executor_key)?
            .get_mcp_config_path()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_executor_profiles_v3() {
        // Test loading from v3 defaults
        let executor_profiles = ExecutorConfigs::from_defaults_v3();

        // Should have all the expected executor types
        assert!(
            executor_profiles
                .get_executor_profile("CLAUDE_CODE")
                .is_some()
        );
        assert!(executor_profiles.get_executor_profile("AMP").is_some());
        assert!(executor_profiles.get_executor_profile("GEMINI").is_some());
        assert!(executor_profiles.get_executor_profile("CODEX").is_some());
        assert!(executor_profiles.get_executor_profile("OPENCODE").is_some());
        assert!(
            executor_profiles
                .get_executor_profile("QWEN_CODE")
                .is_some()
        );
        assert!(executor_profiles.get_executor_profile("CURSOR").is_some());

        // Test CLAUDE_CODE profile has expected configurations
        let claude_profile = executor_profiles
            .get_executor_profile("CLAUDE_CODE")
            .unwrap();
        assert!(claude_profile.get_variant("DEFAULT").is_some());
        assert!(claude_profile.get_variant("PLAN").is_some());
        assert!(claude_profile.get_variant("ROUTER").is_some());

        // Test getting agents by executor key and variant
        let default_claude = executor_profiles.get_agent("CLAUDE_CODE", None).unwrap();
        let plan_claude = executor_profiles
            .get_agent("CLAUDE_CODE", Some("PLAN"))
            .unwrap();

        // They should be different configurations
        assert_ne!(default_claude, plan_claude);

        // Test GEMINI profile has FLASH variant
        let flash_gemini = executor_profiles
            .get_agent("GEMINI", Some("FLASH"))
            .unwrap();
        assert!(matches!(flash_gemini, CodingAgent::Gemini(_)));
    }

    #[test]
    fn test_executor_profile_id() {
        // Test ExecutorProfileId functionality
        let id1 = ExecutorProfileId::new("CLAUDE_CODE".to_string());
        let id2 = ExecutorProfileId::with_variant("CLAUDE_CODE".to_string(), "PLAN".to_string());

        assert_eq!(id1.cache_key(), "CLAUDE_CODE");
        assert_eq!(id2.cache_key(), "CLAUDE_CODE:PLAN");

        // Test Display trait
        assert_eq!(format!("{id1}"), "CLAUDE_CODE");
        assert_eq!(format!("{id2}"), "CLAUDE_CODE:PLAN");

        // Test FromStr trait
        let parsed1: ExecutorProfileId = "GEMINI".parse().unwrap();
        let parsed2: ExecutorProfileId = "GEMINI:FLASH".parse().unwrap();

        assert_eq!(parsed1.executor, "GEMINI");
        assert_eq!(parsed1.variant, None);
        assert_eq!(parsed2.executor, "GEMINI");
        assert_eq!(parsed2.variant, Some("FLASH".to_string()));
    }

    #[test]
    fn test_save_and_load_overrides() {
        use crate::{command::CmdOverrides, executors::claude::ClaudeCode};

        // Create a custom profile configuration
        let mut custom_profiles = ExecutorConfigs::from_defaults_v3();

        // Add a custom variant to CLAUDE_CODE
        let custom_variant = VariantAgentConfig {
            agent: CodingAgent::ClaudeCode(ClaudeCode {
                plan: Some(true),
                dangerously_skip_permissions: Some(false),
                claude_code_router: Some(false),
                append_prompt: Some("Custom prompt".to_string()),
                cmd: CmdOverrides {
                    base_command_override: None,
                    additional_params: None,
                },
            }),
        };

        custom_profiles
            .executors
            .get_mut("CLAUDE_CODE")
            .unwrap()
            .configurations
            .insert("CUSTOM".to_string(), custom_variant);

        // Test computing overrides
        let defaults = ExecutorConfigs::from_defaults_v3();
        let overrides = ExecutorConfigs::compute_overrides(&defaults, &custom_profiles).unwrap();

        // Should only contain the new custom variant
        assert!(overrides.executors.contains_key("CLAUDE_CODE"));
        let claude_overrides = &overrides.executors["CLAUDE_CODE"];
        assert!(claude_overrides.configurations.contains_key("CUSTOM"));
        assert!(!claude_overrides.configurations.contains_key("PLAN")); // plan is already in defaults

        // Test merging
        let merged = ExecutorConfigs::merge_with_defaults(defaults.clone(), overrides);
        assert!(
            merged
                .executors
                .get("CLAUDE_CODE")
                .unwrap()
                .configurations
                .contains_key("CUSTOM")
        );
        assert!(
            merged
                .executors
                .get("CLAUDE_CODE")
                .unwrap()
                .configurations
                .contains_key("PLAN")
        ); // from defaults

        // Test validation
        assert!(ExecutorConfigs::validate_merged(&merged).is_ok());
    }

    #[test]
    fn test_validation_errors() {
        let mut invalid_profiles = ExecutorConfigs::from_defaults_v3();

        // Add invalid configuration name
        let claude_profile = invalid_profiles.executors.get_mut("CLAUDE_CODE").unwrap();
        claude_profile.configurations.insert(
            "__reserved".to_string(),
            claude_profile.get_default().unwrap().clone(),
        );

        // Should fail validation
        assert!(ExecutorConfigs::validate_merged(&invalid_profiles).is_err());

        // Test invalid executor key validation
        let mut invalid_executor = ExecutorConfigs::from_defaults_v3();
        let claude_profile = invalid_executor.executors.remove("CLAUDE_CODE").unwrap();
        invalid_executor
            .executors
            .insert("INVALID_EXECUTOR".to_string(), claude_profile);

        // Should fail validation due to unknown executor key
        assert!(ExecutorConfigs::validate_merged(&invalid_executor).is_err());
    }

    #[test]
    fn test_agent_retrieval() {
        let executor_profiles = ExecutorConfigs::from_defaults_v3();

        // Test basic agent retrieval
        let claude = executor_profiles.get_agent("CLAUDE_CODE", None);
        assert!(claude.is_some());
        let claude_agent = claude.as_ref().unwrap();
        assert!(matches!(claude_agent, CodingAgent::ClaudeCode(_)));

        // Test variant retrieval
        let claude_plan = executor_profiles.get_agent("CLAUDE_CODE", Some("PLAN"));
        assert!(claude_plan.is_some());

        // Test via ExecutorProfileId
        let id = ExecutorProfileId::new("CLAUDE_CODE".to_string());
        let claude_by_id = executor_profiles.get_agent_by_id(&id);
        assert!(claude_by_id.is_some());
        assert_eq!(claude, claude_by_id);
    }

    #[test]
    fn test_flattened_structure() {
        // Test that the flattened structure works correctly
        let test_json = r#"{
            "executors": {
                "CLAUDE_CODE": {
                    "DEFAULT": {
                        "CLAUDE_CODE": {
                            "PLAN": false,
                            "dangerously_skip_permissions": true,
                            "append_prompt": null
                        }
                    },
                    "PLAN": {
                        "CLAUDE_CODE": {
                            "PLAN": true,
                            "dangerously_skip_permissions": false,
                            "append_prompt": null
                        }
                    }
                }
            }
        }"#;

        let parsed: ExecutorConfigs = serde_json::from_str(test_json).expect("JSON should parse");
        let claude_profile = parsed.get_executor_profile("CLAUDE_CODE").unwrap();

        // Should have both default and plan configurations
        assert!(claude_profile.get_variant("DEFAULT").is_some());
        assert!(claude_profile.get_variant("PLAN").is_some());

        // Variant names should work correctly
        let variant_names = claude_profile.variant_names();
        assert_eq!(variant_names.len(), 1); // Only "PLAN", not "DEFAULT"
        assert!(variant_names.contains(&&"PLAN".to_string()));
    }

    #[test]
    fn test_strum_integration() {
        // Test that VARIANTS array contains expected values
        let variants = CodingAgent::VARIANTS;
        assert!(variants.contains(&"CLAUDE_CODE"));
        assert!(variants.contains(&"AMP"));
        assert!(variants.contains(&"GEMINI"));
        assert!(variants.contains(&"CODEX"));
        assert!(variants.contains(&"OPENCODE"));
        assert!(variants.contains(&"QWEN_CODE"));
        assert!(variants.contains(&"CURSOR"));
        assert!(!variants.contains(&"INVALID_EXECUTOR"));

        // Test that Display works correctly
        let claude = ExecutorConfigs::from_defaults_v3()
            .get_agent("CLAUDE_CODE", None)
            .unwrap();
        assert_eq!(claude.to_string(), "CLAUDE_CODE");
    }

    #[test]
    fn test_cannot_delete_default_config() {
        let defaults = ExecutorConfigs::from_defaults_v3();
        let mut invalid_config = defaults.clone();

        // Remove default configuration from CLAUDE_CODE
        invalid_config
            .executors
            .get_mut("CLAUDE_CODE")
            .unwrap()
            .configurations
            .remove("DEFAULT");

        // Should fail with CannotDeleteBuiltInConfig error
        match ExecutorConfigs::compute_overrides(&defaults, &invalid_config) {
            Err(ProfileError::CannotDeleteBuiltInConfig { executor, variant }) => {
                assert_eq!(executor, "CLAUDE_CODE");
                assert_eq!(variant, "DEFAULT");
            }
            _ => panic!("Expected CannotDeleteBuiltInConfig error"),
        }
    }

    #[test]
    fn test_cannot_delete_other_builtin_configs() {
        let defaults = ExecutorConfigs::from_defaults_v3();

        // Test removing plan configuration from CLAUDE_CODE
        let mut invalid_config = defaults.clone();
        invalid_config
            .executors
            .get_mut("CLAUDE_CODE")
            .unwrap()
            .configurations
            .remove("PLAN");

        match ExecutorConfigs::compute_overrides(&defaults, &invalid_config) {
            Err(ProfileError::CannotDeleteBuiltInConfig { executor, variant }) => {
                assert_eq!(executor, "CLAUDE_CODE");
                assert_eq!(variant, "PLAN");
            }
            _ => panic!("Expected CannotDeleteBuiltInConfig error for plan"),
        }

        // Test removing FLASH configuration from GEMINI
        let mut invalid_config2 = defaults.clone();
        invalid_config2
            .executors
            .get_mut("GEMINI")
            .unwrap()
            .configurations
            .remove("FLASH");

        match ExecutorConfigs::compute_overrides(&defaults, &invalid_config2) {
            Err(ProfileError::CannotDeleteBuiltInConfig { executor, variant }) => {
                assert_eq!(executor, "GEMINI");
                assert_eq!(variant, "FLASH");
            }
            _ => panic!("Expected CannotDeleteBuiltInConfig error for FLASH"),
        }
    }

    #[test]
    fn test_can_add_custom_config() {
        use crate::{command::CmdOverrides, executors::claude::ClaudeCode};

        let defaults = ExecutorConfigs::from_defaults_v3();
        let mut config_with_custom = defaults.clone();

        // Add a custom variant to CLAUDE_CODE
        let custom_variant = VariantAgentConfig {
            agent: CodingAgent::ClaudeCode(ClaudeCode {
                plan: Some(true),
                dangerously_skip_permissions: Some(false),
                claude_code_router: Some(false),
                append_prompt: Some("Custom prompt".to_string()),
                cmd: CmdOverrides {
                    base_command_override: None,
                    additional_params: None,
                },
            }),
        };

        config_with_custom
            .executors
            .get_mut("CLAUDE_CODE")
            .unwrap()
            .configurations
            .insert("MY_CUSTOM".to_string(), custom_variant);

        // Should succeed - adding custom configs is allowed
        assert!(ExecutorConfigs::compute_overrides(&defaults, &config_with_custom).is_ok());
    }

    #[test]
    fn test_cannot_delete_executor() {
        let defaults = ExecutorConfigs::from_defaults_v3();
        let mut invalid_config = defaults.clone();

        // Remove entire CLAUDE_CODE executor
        invalid_config.executors.remove("CLAUDE_CODE");

        // Should fail with CannotDeleteExecutor error
        match ExecutorConfigs::compute_overrides(&defaults, &invalid_config) {
            Err(ProfileError::CannotDeleteExecutor { executor }) => {
                assert_eq!(executor, "CLAUDE_CODE");
            }
            _ => panic!("Expected CannotDeleteExecutor error"),
        }
    }

    #[test]
    fn test_canonical_variant_key() {
        use crate::profile::canonical_variant_key;

        // DEFAULT should remain unchanged regardless of case
        assert_eq!(canonical_variant_key("DEFAULT"), "DEFAULT");
        assert_eq!(canonical_variant_key("default"), "DEFAULT");
        assert_eq!(canonical_variant_key("Default"), "DEFAULT");

        // Other keys should be converted to SCREAMING_SNAKE_CASE
        assert_eq!(canonical_variant_key("plan"), "PLAN");
        assert_eq!(canonical_variant_key("PLAN"), "PLAN");
        assert_eq!(canonical_variant_key("router"), "ROUTER");
        assert_eq!(canonical_variant_key("flash"), "FLASH");
        assert_eq!(canonical_variant_key("myCustom"), "MY_CUSTOM");
        assert_eq!(canonical_variant_key("my_custom"), "MY_CUSTOM");
        assert_eq!(canonical_variant_key("MY_CUSTOM"), "MY_CUSTOM");
    }

    #[test]
    fn test_set_variant_canonicalises() {
        use crate::{command::CmdOverrides, executors::claude::ClaudeCode};

        let mut profile = ExecutorProfile::new_with_default(VariantAgentConfig {
            agent: CodingAgent::ClaudeCode(ClaudeCode {
                plan: Some(false),
                dangerously_skip_permissions: Some(true),
                claude_code_router: Some(false),
                append_prompt: None,
                cmd: CmdOverrides {
                    base_command_override: None,
                    additional_params: None,
                },
            }),
        });

        let custom_variant = VariantAgentConfig {
            agent: CodingAgent::ClaudeCode(ClaudeCode {
                plan: Some(true),
                dangerously_skip_permissions: Some(false),
                claude_code_router: Some(false),
                append_prompt: Some("Custom prompt".to_string()),
                cmd: CmdOverrides {
                    base_command_override: None,
                    additional_params: None,
                },
            }),
        };

        // Setting variant with lowercase should canonicalise the key
        profile
            .set_variant("myCustom".to_string(), custom_variant.clone())
            .unwrap();

        // Should be stored under canonical key
        assert!(profile.configurations.contains_key("MY_CUSTOM"));
        assert!(!profile.configurations.contains_key("myCustom"));
        assert_eq!(profile.get_variant("MY_CUSTOM").unwrap(), &custom_variant);
    }

    #[test]
    fn test_lower_case_variant_canonicalized() {
        use crate::{command::CmdOverrides, executors::claude::ClaudeCode};

        let mut configs = ExecutorConfigs::from_defaults_v3();

        // Add a custom variant with lowercase name
        let custom_variant = VariantAgentConfig {
            agent: CodingAgent::ClaudeCode(ClaudeCode {
                plan: Some(true),
                dangerously_skip_permissions: Some(false),
                claude_code_router: Some(false),
                append_prompt: Some("Custom prompt".to_string()),
                cmd: CmdOverrides {
                    base_command_override: None,
                    additional_params: None,
                },
            }),
        };

        // Set a variant with mixed case
        configs
            .executors
            .get_mut("CLAUDE_CODE")
            .unwrap()
            .set_variant("myCustomVariant".to_string(), custom_variant.clone())
            .unwrap();

        // Test that the variant was canonicalized when saved
        let defaults = ExecutorConfigs::from_defaults_v3();
        let mut config_clone = configs.clone();
        config_clone.canonicalise();

        let overrides = ExecutorConfigs::compute_overrides(&defaults, &config_clone).unwrap();

        // Serialize to JSON to check the format
        let json = serde_json::to_string_pretty(&overrides).unwrap();

        // Should contain canonical form
        assert!(json.contains("\"MY_CUSTOM_VARIANT\""));
        assert!(!json.contains("\"myCustomVariant\""));

        // Should be able to find the variant under canonical key
        assert!(
            configs
                .executors
                .get("CLAUDE_CODE")
                .unwrap()
                .configurations
                .contains_key("MY_CUSTOM_VARIANT")
        );
        assert!(
            !configs
                .executors
                .get("CLAUDE_CODE")
                .unwrap()
                .configurations
                .contains_key("myCustomVariant")
        );
    }
}
