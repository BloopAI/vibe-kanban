use std::collections::HashMap;

use axum::{
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::fs;
use ts_rs::TS;

use crate::{
    app_state::AppState,
    executor::ExecutorConfig,
    models::{
        config::{Config, EditorConstants, SoundConstants},
        ApiResponse, Environment,
    },
    utils,
};

pub fn config_router() -> Router<AppState> {
    Router::new()
        .route("/config", get(get_config))
        .route("/config", post(update_config))
        .route("/config/constants", get(get_config_constants))
        .route("/mcp-servers", get(get_mcp_servers))
        .route("/mcp-servers", post(update_mcp_servers))
}

async fn get_config(State(app_state): State<AppState>) -> ResponseJson<ApiResponse<Config>> {
    let mut config = app_state.get_config().read().await.clone();

    // Update environment info dynamically
    let info = os_info::get();
    config.environment.os_type = info.os_type().to_string();
    config.environment.os_version = info.version().to_string();
    config.environment.architecture = info.architecture().unwrap_or("unknown").to_string();
    config.environment.bitness = info.bitness().to_string();

    ResponseJson(ApiResponse::success(config))
}

async fn update_config(
    State(app_state): State<AppState>,
    Json(new_config): Json<Config>,
) -> ResponseJson<ApiResponse<Config>> {
    let config_path = utils::config_path();

    match new_config.save(&config_path) {
        Ok(_) => {
            let mut config = app_state.get_config().write().await;
            *config = new_config.clone();
            drop(config);

            app_state
                .update_analytics_config(new_config.analytics_enabled.unwrap_or(true))
                .await;

            ResponseJson(ApiResponse::success(new_config))
        }
        Err(e) => ResponseJson(ApiResponse::error(&format!("Failed to save config: {}", e))),
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ConfigConstants {
    pub editor: EditorConstants,
    pub sound: SoundConstants,
    pub mode: Environment,
}

async fn get_config_constants(
    State(app_state): State<AppState>,
) -> ResponseJson<ApiResponse<ConfigConstants>> {
    let constants = ConfigConstants {
        editor: EditorConstants::new(),
        sound: SoundConstants::new(),
        mode: app_state.mode,
    };

    ResponseJson(ApiResponse::success(constants))
}

#[derive(Debug, Deserialize)]
struct McpServerQuery {
    executor: Option<String>,
}

/// Common logic for resolving executor configuration and validating MCP support
fn resolve_executor_config(
    query_executor: Option<String>,
    saved_config: &ExecutorConfig,
) -> Result<ExecutorConfig, String> {
    let executor_config = match query_executor {
        Some(executor_type) => executor_type
            .parse::<ExecutorConfig>()
            .map_err(|e| e.to_string())?,
        None => saved_config.clone(),
    };

    if !executor_config.supports_mcp() {
        return Err(format!(
            "{} executor does not support MCP configuration",
            executor_config.display_name()
        ));
    }

    Ok(executor_config)
}

async fn get_mcp_servers(
    State(app_state): State<AppState>,
    Query(query): Query<McpServerQuery>,
) -> ResponseJson<ApiResponse<Value>> {
    let saved_config = {
        let config = app_state.get_config().read().await;
        config.executor.clone()
    };

    let executor_config = match resolve_executor_config(query.executor, &saved_config) {
        Ok(config) => config,
        Err(message) => {
            return ResponseJson(ApiResponse::error(&message));
        }
    };

    // Get the config file path for this executor
    let config_path = match executor_config.config_path() {
        Some(path) => path,
        None => {
            return ResponseJson(ApiResponse::error("Could not determine config file path"));
        }
    };

    match read_mcp_servers_from_config(&config_path, &executor_config).await {
        Ok(servers) => {
            let response_data = serde_json::json!({
                "servers": servers,
                "config_path": config_path.to_string_lossy().to_string()
            });
            ResponseJson(ApiResponse::success(response_data))
        }
        Err(e) => ResponseJson(ApiResponse::error(&format!(
            "Failed to read MCP servers: {}",
            e
        ))),
    }
}

async fn update_mcp_servers(
    State(app_state): State<AppState>,
    Query(query): Query<McpServerQuery>,
    Json(new_servers): Json<HashMap<String, Value>>,
) -> ResponseJson<ApiResponse<String>> {
    let saved_config = {
        let config = app_state.get_config().read().await;
        config.executor.clone()
    };

    let executor_config = match resolve_executor_config(query.executor, &saved_config) {
        Ok(config) => config,
        Err(message) => {
            return ResponseJson(ApiResponse::error(&message));
        }
    };

    // Get the config file path for this executor
    let config_path = match executor_config.config_path() {
        Some(path) => path,
        None => {
            return ResponseJson(ApiResponse::error("Could not determine config file path"));
        }
    };

    match update_mcp_servers_in_config(&config_path, &executor_config, new_servers).await {
        Ok(message) => ResponseJson(ApiResponse::success(message)),
        Err(e) => ResponseJson(ApiResponse::error(&format!(
            "Failed to update MCP servers: {}",
            e
        ))),
    }
}

async fn update_mcp_servers_in_config(
    file_path: &std::path::Path,
    executor_config: &ExecutorConfig,
    new_servers: HashMap<String, Value>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // Read existing config file or create empty object if it doesn't exist
    let file_content = fs::read_to_string(file_path)
        .await
        .unwrap_or_else(|_| "{}".to_string());
    let mut config: Value = serde_json::from_str(&file_content)?;

    // Get the attribute path for MCP servers
    let mcp_path = executor_config.mcp_attribute_path().unwrap();

    // Get the current server count for comparison
    let old_servers = get_mcp_servers_from_config_path(&config, &mcp_path).len();

    // Set the MCP servers using the correct attribute path
    set_mcp_servers_in_config_path(&mut config, &mcp_path, &new_servers)?;

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
    // Read the config file, return empty if it doesn't exist
    let file_content = fs::read_to_string(file_path)
        .await
        .unwrap_or_else(|_| "{}".to_string());
    let config: Value = serde_json::from_str(&file_content)?;

    // Get the attribute path for MCP servers
    let mcp_path = executor_config.mcp_attribute_path().unwrap();

    // Get the servers using the correct attribute path
    let servers = get_mcp_servers_from_config_path(&config, &mcp_path);

    Ok(servers)
}

/// Helper function to get MCP servers from config using a path
fn get_mcp_servers_from_config_path(config: &Value, path: &[&str]) -> HashMap<String, Value> {
    // Special handling for AMP - use flat key structure
    if path.len() == 2 && path[0] == "amp" && path[1] == "mcpServers" {
        let flat_key = format!("{}.{}", path[0], path[1]);
        let current = match config.get(&flat_key) {
            Some(val) => val,
            None => return HashMap::new(),
        };

        // Extract the servers object
        match current.as_object() {
            Some(servers) => servers
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            None => HashMap::new(),
        }
    } else {
        let mut current = config;

        // Navigate to the target location
        for &part in path {
            current = match current.get(part) {
                Some(val) => val,
                None => return HashMap::new(),
            };
        }

        // Extract the servers object
        match current.as_object() {
            Some(servers) => servers
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            None => HashMap::new(),
        }
    }
}

/// Helper function to set MCP servers in config using a path
fn set_mcp_servers_in_config_path(
    config: &mut Value,
    path: &[&str],
    servers: &HashMap<String, Value>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Ensure config is an object
    if !config.is_object() {
        *config = serde_json::json!({});
    }

    // Special handling for AMP - use flat key structure
    if path.len() == 2 && path[0] == "amp" && path[1] == "mcpServers" {
        let flat_key = format!("{}.{}", path[0], path[1]);
        config
            .as_object_mut()
            .unwrap()
            .insert(flat_key, serde_json::to_value(servers)?);
        return Ok(());
    }

    let mut current = config;

    // Navigate/create the nested structure (all parts except the last)
    for &part in &path[..path.len() - 1] {
        if current.get(part).is_none() {
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
    let final_attr = path.last().unwrap();
    current
        .as_object_mut()
        .unwrap()
        .insert(final_attr.to_string(), serde_json::to_value(servers)?);

    Ok(())
}
