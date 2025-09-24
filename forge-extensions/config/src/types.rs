use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

/// Project-level configuration stored in auxiliary tables
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ProjectConfig {
    pub project_id: Uuid,
    pub custom_executors: Option<serde_json::Value>,
    pub forge_config: Option<serde_json::Value>,
}

/// Configuration for forge-specific project settings
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ForgeProjectSettings {
    pub omni_enabled: bool,
    pub omni_config: Option<forge_omni::OmniConfig>,
    pub branch_templates_enabled: bool,
    pub genie_enabled: bool,
}

impl Default for ForgeProjectSettings {
    fn default() -> Self {
        Self {
            omni_enabled: false,
            omni_config: None,
            branch_templates_enabled: true,
            genie_enabled: false,
        }
    }
}
