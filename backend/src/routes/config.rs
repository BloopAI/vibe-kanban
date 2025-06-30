use std::{collections::HashMap, sync::Arc};

use axum::{
    extract::{Extension, Query},
    response::Json as ResponseJson,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;
use ts_rs::TS;

use crate::{
    executor::ExecutorConfig,
    models::{
        config::{Config, EditorConstants, SoundConstants},
        ApiResponse,
    },
    utils,
};

pub fn config_router() -> Router {
    Router::new()
        .route("/config", get(get_config))
        .route("/config", post(update_config))
        .route("/config/constants", get(get_config_constants))
        .route("/mcp-servers", get(get_mcp_servers))
        .route("/mcp-servers", post(update_mcp_servers))
}

async fn get_config(
    Extension(config): Extension<Arc<RwLock<Config>>>,
) -> ResponseJson<ApiResponse<Config>> {
    let config = config.read().await;
    ResponseJson(ApiResponse {
        success: true,
        data: Some(config.clone()),
        message: Some("Config retrieved successfully".to_string()),
    })
}

async fn update_config(
    Extension(config_arc): Extension<Arc<RwLock<Config>>>,
    Json(new_config): Json<Config>,
) -> ResponseJson<ApiResponse<Config>> {
    let config_path = utils::config_path();

    match new_config.save(&config_path) {
        Ok(_) => {
            let mut config = config_arc.write().await;
            *config = new_config.clone();

            ResponseJson(ApiResponse {
                success: true,
                data: Some(new_config),
                message: Some("Config updated successfully".to_string()),
            })
        }
        Err(e) => ResponseJson(ApiResponse {
            success: false,
            data: None,
            message: Some(format!("Failed to save config: {}", e)),
        }),
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ConfigConstants {
    pub editor: EditorConstants,
    pub sound: SoundConstants,
}

async fn get_config_constants() -> ResponseJson<ApiResponse<ConfigConstants>> {
    let constants = ConfigConstants {
        editor: EditorConstants::new(),
        sound: SoundConstants::new(),
    };

    ResponseJson(ApiResponse {
        success: true,
        data: Some(constants),
        message: Some("Config constants retrieved successfully".to_string()),
    })
}

#[derive(Debug, Deserialize)]
struct McpServerQuery {
    executor: Option<String>,
}

async fn get_mcp_servers(
    Extension(config): Extension<Arc<RwLock<Config>>>,
    Query(query): Query<McpServerQuery>,
) -> ResponseJson<ApiResponse<HashMap<String, Value>>> {
    // Use executor from query parameter if provided, otherwise use saved config
    let executor_config = if let Some(executor_type) = query.executor {
        match executor_type.as_str() {
            "echo" => ExecutorConfig::Echo,
            "claude" => ExecutorConfig::Claude,
            "amp" => ExecutorConfig::Amp,
            "gemini" => ExecutorConfig::Gemini,
            _ => {
                return ResponseJson(ApiResponse {
                    success: false,
                    data: None,
                    message: Some(format!("Unknown executor type: {}", executor_type)),
                });
            }
        }
    } else {
        let config = config.read().await;
        config.executor.clone()
    };

    // Check if the executor supports MCP
    if !executor_config.supports_mcp() {
        return ResponseJson(ApiResponse {
            success: false,
            data: None,
            message: Some(format!(
                "{} executor does not support MCP configuration",
                executor_config.display_name()
            )),
        });
    }

    // Get the config file path for this executor
    let config_path = match executor_config.config_path() {
        Some(path) => path,
        None => {
            return ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some("Could not determine config file path".to_string()),
            });
        }
    };

    match read_mcp_servers_from_config(&config_path, &executor_config).await {
        Ok(servers) => ResponseJson(ApiResponse {
            success: true,
            data: Some(servers),
            message: Some("MCP servers retrieved successfully".to_string()),
        }),
        Err(e) => ResponseJson(ApiResponse {
            success: false,
            data: None,
            message: Some(format!("Failed to read MCP servers: {}", e)),
        }),
    }
}

async fn update_mcp_servers(
    Extension(config): Extension<Arc<RwLock<Config>>>,
    Query(query): Query<McpServerQuery>,
    Json(new_servers): Json<HashMap<String, Value>>,
) -> ResponseJson<ApiResponse<String>> {
    // Use executor from query parameter if provided, otherwise use saved config
    let executor_config = if let Some(executor_type) = query.executor {
        match executor_type.as_str() {
            "echo" => ExecutorConfig::Echo,
            "claude" => ExecutorConfig::Claude,
            "amp" => ExecutorConfig::Amp,
            "gemini" => ExecutorConfig::Gemini,
            _ => {
                return ResponseJson(ApiResponse {
                    success: false,
                    data: None,
                    message: Some(format!("Unknown executor type: {}", executor_type)),
                });
            }
        }
    } else {
        let config = config.read().await;
        config.executor.clone()
    };

    // Check if the executor supports MCP
    if !executor_config.supports_mcp() {
        return ResponseJson(ApiResponse {
            success: false,
            data: None,
            message: Some(format!(
                "{} executor does not support MCP configuration",
                executor_config.display_name()
            )),
        });
    }

    // Get the config file path for this executor
    let config_path = match executor_config.config_path() {
        Some(path) => path,
        None => {
            return ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some("Could not determine config file path".to_string()),
            });
        }
    };

    match update_mcp_servers_in_config(&config_path, &executor_config, new_servers).await {
        Ok(message) => ResponseJson(ApiResponse {
            success: true,
            data: Some(message.clone()),
            message: Some(message),
        }),
        Err(e) => ResponseJson(ApiResponse {
            success: false,
            data: None,
            message: Some(format!("Failed to update MCP servers: {}", e)),
        }),
    }
}

async fn update_mcp_servers_in_config(
    file_path: &std::path::Path,
    executor_config: &ExecutorConfig,
    new_servers: HashMap<String, Value>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    use tokio::fs;

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // Read existing config file or create empty object if it doesn't exist
    let file_content = fs::read_to_string(file_path)
        .await
        .unwrap_or_else(|_| "{}".to_string());
    let mut config: Value = serde_json::from_str(&file_content)?;

    // Get the attribute name for MCP servers
    let mcp_attr = executor_config.mcp_attribute().unwrap_or("mcpServers");

    // Get the current server count for comparison
    let old_servers = get_mcp_servers_from_config(config, mcp_attr).len();

    // Set the MCP servers using the correct attribute path
    set_mcp_servers_in_config(&mut config, mcp_attr, &new_servers)?;

    // Write the updated config back to file
    let updated_content = serde_json::to_string_pretty(&config)?;
    fs::write(file_path, updated_content).await?;

    let new_count = new_servers.len();
    let message = match (old_servers, new_count) {
        (0, 0) => "No MCP servers configured".to_string(),
        (0, n) => format!("Added {} MCP server(s)", n),
        (old, new) if old == new => format!("Updated MCP server configuration ({} server(s))", new),
        (old, new) => format!(
            "Updated MCP server configuration (was {}, now {})",
            old, new
        ),
    };

    Ok(message)
}

async fn read_mcp_servers_from_config(
    file_path: &std::path::Path,
    executor_config: &ExecutorConfig,
) -> Result<HashMap<String, Value>, Box<dyn std::error::Error + Send + Sync>> {
    use tokio::fs;

    // Read the config file, return empty if it doesn't exist
    let file_content = fs::read_to_string(file_path)
        .await
        .unwrap_or_else(|_| "{}".to_string());
    let config: Value = serde_json::from_str(&file_content)?;

    // Get the attribute name for MCP servers
    let mcp_attr = executor_config.mcp_attribute().unwrap_or("mcpServers");

    // Get the servers using the correct attribute path
    let servers = get_mcp_servers_from_config(&config, mcp_attr);

    Ok(servers)
}

/// Helper function to get MCP servers from config using the attribute path
fn get_mcp_servers_from_config(config: &Value, mcp_attr: &str) -> HashMap<String, Value> {
    // Handle nested attribute like "amp.mcpServers"
    if mcp_attr.contains('.') {
        let parts: Vec<&str> = mcp_attr.split('.').collect();
        let mut current = config;

        // Navigate through the nested structure
        for part in &parts[..parts.len() - 1] {
            current = match current.get(part) {
                Some(val) => val,
                None => return HashMap::new(),
            };
        }

        // Get the final attribute
        let final_attr = parts.last().unwrap();
        match current.get(final_attr).and_then(|v| v.as_object()) {
            Some(servers) => servers
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            None => HashMap::new(),
        }
    } else {
        // Simple attribute like "mcpServers"
        match config.get(mcp_attr).and_then(|v| v.as_object()) {
            Some(servers) => servers
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            None => HashMap::new(),
        }
    }
}

/// Helper function to set MCP servers in config using the attribute path
fn set_mcp_servers_in_config(
    config: &mut Value,
    mcp_attr: &str,
    servers: &HashMap<String, Value>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Ensure config is an object
    if !config.is_object() {
        *config = serde_json::json!({});
    }

    // Handle nested attribute like "amp.mcpServers"
    if mcp_attr.contains('.') {
        let parts: Vec<&str> = mcp_attr.split('.').collect();
        let mut current = config;

        // Navigate/create the nested structure
        for part in &parts[..parts.len() - 1] {
            if !current.get(part).is_some() {
                current
                    .as_object_mut()
                    .unwrap()
                    .insert(part.to_string(), serde_json::json!({}));
            }
            current = current.get_mut(part).unwrap();
            if !current.is_object() {
                *current = serde_json::json!({});
            }
        }

        // Set the final attribute
        let final_attr = parts.last().unwrap();
        current
            .as_object_mut()
            .unwrap()
            .insert(final_attr.to_string(), serde_json::to_value(servers)?);
    } else {
        // Simple attribute like "mcpServers"
        config
            .as_object_mut()
            .unwrap()
            .insert(mcp_attr.to_string(), serde_json::to_value(servers)?);
    }

    Ok(())
}
