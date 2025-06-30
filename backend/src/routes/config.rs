use std::sync::Arc;
use std::collections::HashMap;

use axum::{
    extract::Extension,
    response::Json as ResponseJson,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;
use ts_rs::TS;

use crate::{
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

async fn get_mcp_servers() -> ResponseJson<ApiResponse<HashMap<String, Value>>> {
    let claude_config_path = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string()) + "/.claude.json";
    
    match read_claude_json_mcp_servers(&claude_config_path).await {
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
    Json(new_servers): Json<HashMap<String, Value>>,
) -> ResponseJson<ApiResponse<String>> {
    let claude_config_path = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string()) + "/.claude.json";
    
    match update_claude_json_mcp_servers(&claude_config_path, new_servers).await {
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

async fn update_claude_json_mcp_servers(
    file_path: &str,
    new_servers: HashMap<String, Value>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    use tokio::fs;
    
    // Read the existing ~/.claude.json file
    let file_content = fs::read_to_string(file_path).await?;
    let mut claude_config: Value = serde_json::from_str(&file_content)?;
    
    // Get the current mcpServers for comparison
    let old_servers = claude_config
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .map(|obj| obj.len())
        .unwrap_or(0);
    
    // Replace the entire mcpServers object
    claude_config["mcpServers"] = serde_json::to_value(&new_servers)?;
    
    // Write the updated config back to file
    let updated_content = serde_json::to_string_pretty(&claude_config)?;
    fs::write(file_path, updated_content).await?;
    
    let new_count = new_servers.len();
    let message = match (old_servers, new_count) {
        (0, 0) => "No MCP servers configured".to_string(),
        (0, n) => format!("Added {} MCP server(s)", n),
        (old, new) if old == new => format!("Updated MCP server configuration ({} server(s))", new),
        (old, new) => format!("Updated MCP server configuration (was {}, now {})", old, new),
    };
    
    Ok(message)
}

async fn read_claude_json_mcp_servers(
    file_path: &str,
) -> Result<HashMap<String, Value>, Box<dyn std::error::Error + Send + Sync>> {
    use tokio::fs;
    
    // Read the existing ~/.claude.json file
    let file_content = fs::read_to_string(file_path).await?;
    let claude_config: Value = serde_json::from_str(&file_content)?;
    
    // Get the mcpServers object, or return empty if not found
    let servers: HashMap<String, Value> = match claude_config.get("mcpServers").and_then(|v| v.as_object()) {
        Some(mcp_servers) => mcp_servers
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        None => HashMap::new(),
    };
    
    Ok(servers)
}
