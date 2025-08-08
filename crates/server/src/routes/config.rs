use std::collections::HashMap;

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http,
    response::{Json as ResponseJson, Response},
    routing::{get, put},
    Json, Router,
};
use deployment::{Deployment, DeploymentError};
use executors::{command::AgentProfiles, executors::BaseCodingAgent};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use services::services::config::{save_config_to_file, Config, SoundFile};
use tokio::fs;
use ts_rs::TS;
use utils::{assets::config_path, response::ApiResponse};

use crate::{
    error::ApiError,
    mcp::agent_config::{read_agent_config, write_agent_config},
    DeploymentImpl,
};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/info", get(get_user_system_info))
        .route("/config", put(update_config))
        .route("/sounds/{sound}", get(get_sound))
        .route("/mcp-config", get(get_mcp_servers).post(update_mcp_servers))
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct Environment {
    pub os_type: String,
    pub os_version: String,
    pub os_architecture: String,
    pub bitness: String,
}

impl Default for Environment {
    fn default() -> Self {
        Self::new()
    }
}

impl Environment {
    pub fn new() -> Self {
        let info = os_info::get();
        Environment {
            os_type: info.os_type().to_string(),
            os_version: info.version().to_string(),
            os_architecture: info.architecture().unwrap_or("unknown").to_string(),
            bitness: info.bitness().to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct UserSystemInfo {
    pub config: Config,
    #[serde(flatten)]
    pub profiles: AgentProfiles,
    pub environment: Environment,
}

// TODO: update frontend, BE schema has changed, this replaces GET /config and /config/constants
#[axum::debug_handler]
async fn get_user_system_info(
    State(deployment): State<DeploymentImpl>,
) -> ResponseJson<ApiResponse<UserSystemInfo>> {
    let config = deployment.config().read().await;

    let user_system_info = UserSystemInfo {
        config: config.clone(),
        profiles: AgentProfiles::get_cached().clone(),
        environment: Environment::new(),
    };

    ResponseJson(ApiResponse::success(user_system_info))
}

async fn update_config(
    State(deployment): State<DeploymentImpl>,
    Json(new_config): Json<Config>,
) -> ResponseJson<ApiResponse<Config>> {
    let config_path = config_path();

    match save_config_to_file(&new_config, &config_path).await {
        Ok(_) => {
            let mut config = deployment.config().write().await;
            *config = new_config.clone();
            drop(config);

            ResponseJson(ApiResponse::success(new_config))
        }
        Err(e) => ResponseJson(ApiResponse::error(&format!("Failed to save config: {}", e))),
    }
}

async fn get_sound(Path(sound): Path<SoundFile>) -> Result<Response, ApiError> {
    let sound = sound.serve().await.map_err(DeploymentError::Other)?;
    let response = Response::builder()
        .status(http::StatusCode::OK)
        .header(
            http::header::CONTENT_TYPE,
            http::HeaderValue::from_static("audio/wav"),
        )
        .body(Body::from(sound.data.into_owned()))
        .unwrap();
    Ok(response)
}

#[derive(Debug, Deserialize)]
struct McpServerQuery {
    base_coding_agent: Option<BaseCodingAgent>,
}

async fn get_mcp_servers(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<McpServerQuery>,
) -> Result<ResponseJson<ApiResponse<Value>>, ApiError> {
    let agent = match query.base_coding_agent {
        Some(executor) => executor,
        None => {
            let config = deployment.config().read().await;
            let profile = executors::command::AgentProfiles::get_cached()
                .get_profile(&config.profile)
                .expect("Corrupted config");
            profile.agent
        }
    };

    if !agent.supports_mcp() {
        return Ok(ResponseJson(ApiResponse::error(
            "This executor does not support MCP servers",
        )));
    }

    // Get the config file path for this executor
    let config_path = match agent.config_path() {
        Some(path) => path,
        None => {
            return Ok(ResponseJson(ApiResponse::error(
                "Could not determine config file path",
            )));
        }
    };

    match read_mcp_servers_from_config(&config_path, &agent).await {
        Ok(servers) => {
            let response_data = serde_json::json!({
                "servers": servers,
                "config_path": config_path.to_string_lossy().to_string()
            });
            Ok(ResponseJson(ApiResponse::success(response_data)))
        }
        Err(e) => Ok(ResponseJson(ApiResponse::error(&format!(
            "Failed to read MCP servers: {}",
            e
        )))),
    }
}

async fn update_mcp_servers(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<McpServerQuery>,
    Json(new_servers): Json<HashMap<String, Value>>,
) -> Result<ResponseJson<ApiResponse<String>>, ApiError> {
    let agent = match query.base_coding_agent {
        Some(executor) => executor,
        None => {
            let config = deployment.config().read().await;
            let profile = executors::command::AgentProfiles::get_cached()
                .get_profile(&config.profile)
                .expect("Corrupted config");
            profile.agent
        }
    };

    if !agent.supports_mcp() {
        return Ok(ResponseJson(ApiResponse::error(
            "This executor does not support MCP servers",
        )));
    }

    // Get the config file path for this executor
    let config_path = match agent.config_path() {
        Some(path) => path,
        None => {
            return Ok(ResponseJson(ApiResponse::error(
                "Could not determine config file path",
            )));
        }
    };

    match update_mcp_servers_in_config(&config_path, &agent, new_servers).await {
        Ok(message) => Ok(ResponseJson(ApiResponse::success(message))),
        Err(e) => Ok(ResponseJson(ApiResponse::error(&format!(
            "Failed to update MCP servers: {}",
            e
        )))),
    }
}

async fn update_mcp_servers_in_config(
    config_path: &std::path::Path,
    agent: &BaseCodingAgent,
    new_servers: HashMap<String, Value>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // Read existing config (JSON or TOML depending on agent)
    let mut config = read_agent_config(config_path, agent).await?;

    let mcp_path = agent.mcp_attribute_path().unwrap();

    // Get the current server count for comparison
    let old_servers = get_mcp_servers_from_config_path(agent, &config, &mcp_path).len();

    // Set the MCP servers using the correct attribute path
    set_mcp_servers_in_config_path(agent, &mut config, &mcp_path, &new_servers)?;

    // Write the updated config back to file (JSON or TOML depending on agent)
    write_agent_config(config_path, agent, &config).await?;

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
    config_path: &std::path::Path,
    agent: &BaseCodingAgent,
) -> Result<HashMap<String, Value>, Box<dyn std::error::Error + Send + Sync>> {
    // Read config in appropriate format (JSON or TOML) and normalize to serde_json::Value
    let raw_config = read_agent_config(config_path, agent).await?;
    let mcp_path = agent.mcp_attribute_path().unwrap();
    let servers = get_mcp_servers_from_config_path(agent, &raw_config, &mcp_path);
    Ok(servers)
}

/// Helper function to get MCP servers from config using a path
fn get_mcp_servers_from_config_path(
    agent: &BaseCodingAgent,
    raw_config: &Value,
    path: &[&str],
) -> HashMap<String, Value> {
    // Special handling for AMP - use flat key structure
    let current = if matches!(agent, BaseCodingAgent::Amp) {
        let flat_key = format!("{}.{}", path[0], path[1]);
        let current = match raw_config.get(&flat_key) {
            Some(val) => val,
            None => return HashMap::new(),
        };
        current
    } else {
        let mut current = raw_config;
        for &part in path {
            current = match current.get(part) {
                Some(val) => val,
                None => return HashMap::new(),
            };
        }
        current
    };

    // Extract the servers object
    match current.as_object() {
        Some(servers) => servers
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        None => HashMap::new(),
    }
}

/// Helper function to set MCP servers in config using a path
fn set_mcp_servers_in_config_path(
    agent: &BaseCodingAgent,
    raw_config: &mut Value,
    path: &[&str],
    servers: &HashMap<String, Value>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Ensure config is an object
    if !raw_config.is_object() {
        *raw_config = serde_json::json!({});
    }

    // Special handling for AMP - use flat key structure
    if matches!(agent, BaseCodingAgent::Amp) {
        let flat_key = format!("{}.{}", path[0], path[1]);
        raw_config
            .as_object_mut()
            .unwrap()
            .insert(flat_key, serde_json::to_value(servers)?);
        return Ok(());
    }

    let mut current = raw_config;

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
