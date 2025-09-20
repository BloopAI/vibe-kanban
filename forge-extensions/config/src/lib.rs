//! Forge Config Extension
//!
//! This module provides forge-specific configuration functionality,
//! including the Omni configuration that was added in v7.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Forge-specific configuration that extends upstream config
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct ForgeConfig {
    /// Omni notification configuration
    pub omni: OmniConfig,
}

impl ForgeConfig {
    /// Create a new forge config with default values
    pub fn new() -> Self {
        Self {
            omni: OmniConfig::default(),
        }
    }
}

impl Default for ForgeConfig {
    fn default() -> Self {
        Self::new()
    }
}

/// Omni notification configuration
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
pub struct OmniConfig {
    pub enabled: bool,
    pub host: Option<String>,
    pub api_key: Option<String>,
    pub instance: Option<String>,
    pub recipient: Option<String>,
    pub recipient_type: Option<RecipientType>,
}

/// Recipient type for Omni notifications
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub enum RecipientType {
    PhoneNumber,
    UserId,
}

/// Service for managing forge-specific configuration
pub struct ConfigService;

impl ConfigService {
    /// Create a new config service
    pub fn new() -> Self {
        Self
    }

    /// Load forge-specific configuration
    pub async fn load_config(&self) -> Result<ForgeConfig> {
        // This would load from the forge_project_settings table
        // TODO: Implement database query
        Ok(ForgeConfig::default())
    }

    /// Save forge-specific configuration
    pub async fn save_config(&self, _config: ForgeConfig) -> Result<()> {
        // This would save to the forge_project_settings table
        // TODO: Implement database query
        Ok(())
    }
}

impl Default for ConfigService {
    fn default() -> Self {
        Self::new()
    }
}