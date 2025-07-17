use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Integration {
    pub id: Uuid,
    pub name: String,
    #[serde(rename = "type")]
    pub integration_type: String,
    pub provider: String,
    pub category_id: String,
    pub config: Option<String>, // JSON string
    pub enabled: bool,
    pub health_status: String,
    pub last_sync_at: Option<String>,
    pub last_health_check_at: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct IntegrationCategory {
    pub id: String,
    pub display_name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IntegrationEvent {
    pub id: Uuid,
    pub integration_id: Uuid,
    pub event_type: String,
    pub event_data: Option<String>, // JSON string
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateIntegrationRequest {
    pub name: String,
    #[serde(rename = "type")]
    pub integration_type: String,
    pub provider: String,
    pub category_id: String,
    pub config: Option<serde_json::Value>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateIntegrationRequest {
    pub name: Option<String>,
    pub config: Option<serde_json::Value>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IntegrationTestResult {
    pub success: bool,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IntegrationWithCategory {
    pub id: Uuid,
    pub name: String,
    #[serde(rename = "type")]
    pub integration_type: String,
    pub provider: String,
    pub category: IntegrationCategory,
    pub config: Option<serde_json::Value>,
    pub enabled: bool,
    pub health_status: String,
    pub last_sync_at: Option<String>,
    pub last_health_check_at: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Integration {
    #[allow(dead_code)]
    pub fn get_config_as_json(&self) -> Option<serde_json::Value> {
        self.config.as_ref().and_then(|c| serde_json::from_str(c).ok())
    }

    #[allow(dead_code)]
    pub fn set_config_from_json(&mut self, config: Option<serde_json::Value>) {
        self.config = config.and_then(|c| serde_json::to_string(&c).ok());
    }
}

// Integration type constants
pub mod integration_types {
    #[allow(dead_code)]
    pub const AI_ASSISTANT: &str = "ai_assistant";
    #[allow(dead_code)]
    pub const VERSION_CONTROL: &str = "version_control";
    #[allow(dead_code)]
    pub const COMMUNICATION: &str = "communication";
    #[allow(dead_code)]
    pub const PROJECT_MANAGEMENT: &str = "project_management";
    #[allow(dead_code)]
    pub const DEVELOPMENT_TOOL: &str = "development_tool";
}

// Health status constants
pub mod health_status {
    pub const HEALTHY: &str = "healthy";
    pub const ERROR: &str = "error";
    #[allow(dead_code)]
    pub const WARNING: &str = "warning";
    pub const UNKNOWN: &str = "unknown";
}

// Event type constants
pub mod event_types {
    pub const CREATED: &str = "created";
    pub const UPDATED: &str = "updated";
    pub const ENABLED: &str = "enabled";
    pub const DISABLED: &str = "disabled";
    pub const SYNC: &str = "sync";
    pub const TEST: &str = "test";
    #[allow(dead_code)]
    pub const ERROR: &str = "error";
    #[allow(dead_code)]
    pub const HEALTH_CHECK: &str = "health_check";
}