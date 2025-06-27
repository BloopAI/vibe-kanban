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
    
    // Get or create the mcpServers object
    let mcp_servers = claude_config
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or("mcpServers field not found or not an object")?;
    
    let mut added_count = 0;
    let mut updated_count = 0;
    
    // Merge new servers, detecting duplicates
    for (server_name, server_config) in new_servers {
        if mcp_servers.contains_key(&server_name) {
            updated_count += 1;
        } else {
            added_count += 1;
        }
        mcp_servers.insert(server_name, server_config);
    }
    
    // Write the updated config back to file
    let updated_content = serde_json::to_string_pretty(&claude_config)?;
    fs::write(file_path, updated_content).await?;
    
    let message = match (added_count, updated_count) {
        (0, 0) => "No MCP servers to update".to_string(),
        (added, 0) => format!("Added {} new MCP server(s)", added),
        (0, updated) => format!("Updated {} existing MCP server(s)", updated),
        (added, updated) => format!("Added {} new and updated {} existing MCP server(s)", added, updated),
    };
    
    Ok(message)
}
