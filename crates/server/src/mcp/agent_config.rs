//! Utilities for reading and writing external agent config files (not the server's own config).
//!
//! These helpers abstract over JSON vs TOML formats used by different agents.

use executors::executors::BaseCodingAgent;
use serde_json::Value;
use tokio::fs;

/// Determine if the agent's config file is TOML-based.
fn is_toml_config(agent: &BaseCodingAgent) -> bool {
    matches!(agent, BaseCodingAgent::Codex)
}

/// Read an agent's external config file (JSON or TOML) and normalize it to serde_json::Value.
pub async fn read_agent_config(
    config_path: &std::path::Path,
    agent: &BaseCodingAgent,
) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    let file_content = fs::read_to_string(config_path).await.unwrap_or_else(|_| {
        if is_toml_config(agent) {
            "".to_string()
        } else {
            "{}".to_string()
        }
    });

    if is_toml_config(agent) {
        // Parse TOML then convert to JSON Value
        if file_content.trim().is_empty() {
            return Ok(serde_json::json!({}));
        }
        let toml_val: toml::Value = toml::from_str(&file_content)?;
        let json_string = serde_json::to_string(&toml_val)?;
        Ok(serde_json::from_str(&json_string)?)
    } else {
        Ok(serde_json::from_str(&file_content)?)
    }
}

/// Write an agent's external config (as serde_json::Value) back to disk in the agent's format (JSON or TOML).
pub async fn write_agent_config(
    config_path: &std::path::Path,
    agent: &BaseCodingAgent,
    config: &Value,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if is_toml_config(agent) {
        // Convert JSON Value back to TOML
        let toml_value: toml::Value = serde_json::from_str(&serde_json::to_string(config)?)?;
        let toml_content = toml::to_string_pretty(&toml_value)?;
        fs::write(config_path, toml_content).await?;
    } else {
        let json_content = serde_json::to_string_pretty(config)?;
        fs::write(config_path, json_content).await?;
    }
    Ok(())
}
