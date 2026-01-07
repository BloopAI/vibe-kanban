//! Utilities for reading and writing external agent config files (not the server's own config).
//!
//! These helpers abstract over JSON vs TOML formats used by different agents.

use std::{collections::HashMap, path::PathBuf, sync::LazyLock};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tokio::fs;
use ts_rs::TS;

use crate::executors::{CodingAgent, ExecutorError};

static DEFAULT_MCP_JSON: &str = include_str!("../default_mcp.json");
pub static PRECONFIGURED_MCP_SERVERS: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str::<Value>(DEFAULT_MCP_JSON).expect("Failed to parse default MCP JSON")
});

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct McpConfig {
    servers: HashMap<String, serde_json::Value>,
    pub servers_path: Vec<String>,
    pub template: serde_json::Value,
    pub preconfigured: serde_json::Value,
    pub is_toml_config: bool,
}

impl McpConfig {
    pub fn new(
        servers_path: Vec<String>,
        template: serde_json::Value,
        preconfigured: serde_json::Value,
        is_toml_config: bool,
    ) -> Self {
        Self {
            servers: HashMap::new(),
            servers_path,
            template,
            preconfigured,
            is_toml_config,
        }
    }
    pub fn set_servers(&mut self, servers: HashMap<String, serde_json::Value>) {
        self.servers = servers;
    }
}

/// Read an agent's external config file (JSON or TOML) and normalize it to serde_json::Value.
pub async fn read_agent_config(
    config_path: &std::path::Path,
    mcp_config: &McpConfig,
) -> Result<Value, ExecutorError> {
    if let Ok(file_content) = fs::read_to_string(config_path).await {
        if mcp_config.is_toml_config {
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
    } else {
        Ok(mcp_config.template.clone())
    }
}

/// Write an agent's external config (as serde_json::Value) back to disk in the agent's format (JSON or TOML).
pub async fn write_agent_config(
    config_path: &std::path::Path,
    mcp_config: &McpConfig,
    config: &Value,
) -> Result<(), ExecutorError> {
    if mcp_config.is_toml_config {
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

type ServerMap = Map<String, Value>;

fn is_http_server(s: &Map<String, Value>) -> bool {
    matches!(s.get("type").and_then(Value::as_str), Some("http"))
}

fn is_stdio(s: &Map<String, Value>) -> bool {
    !is_http_server(s) && s.get("command").is_some()
}

fn extract_meta(mut obj: ServerMap) -> (ServerMap, Option<Value>) {
    let meta = obj.remove("meta");
    (obj, meta)
}

fn attach_meta(mut obj: ServerMap, meta: Option<Value>) -> Value {
    if let Some(m) = meta {
        obj.insert("meta".to_string(), m);
    }
    Value::Object(obj)
}

fn ensure_header(headers: &mut Map<String, Value>, key: &str, val: &str) {
    match headers.get_mut(key) {
        Some(Value::String(_)) => {}
        _ => {
            headers.insert(key.to_string(), Value::String(val.to_string()));
        }
    }
}

fn transform_http_servers<F>(mut servers: ServerMap, mut f: F) -> ServerMap
where
    F: FnMut(Map<String, Value>) -> Map<String, Value>,
{
    for (_k, v) in servers.iter_mut() {
        if let Value::Object(s) = v
            && is_http_server(s)
        {
            let taken = std::mem::take(s);
            *s = f(taken);
        }
    }
    servers
}

// --- Adapters ---------------------------------------------------------------

fn adapt_passthrough(servers: ServerMap, meta: Option<Value>) -> Value {
    attach_meta(servers, meta)
}

fn adapt_gemini(servers: ServerMap, meta: Option<Value>) -> Value {
    let servers = transform_http_servers(servers, |mut s| {
        let url = s
            .remove("url")
            .unwrap_or_else(|| Value::String(String::new()));
        let mut headers = s
            .remove("headers")
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();

        ensure_header(
            &mut headers,
            "Accept",
            "application/json, text/event-stream",
        );
        Map::from_iter([
            ("httpUrl".to_string(), url),
            ("headers".to_string(), Value::Object(headers)),
        ])
    });
    attach_meta(servers, meta)
}

fn adapt_cursor(servers: ServerMap, meta: Option<Value>) -> Value {
    let servers = transform_http_servers(servers, |mut s| {
        let url = s
            .remove("url")
            .unwrap_or_else(|| Value::String(String::new()));
        let headers = s
            .remove("headers")
            .unwrap_or_else(|| Value::Object(Default::default()));
        Map::from_iter([("url".to_string(), url), ("headers".to_string(), headers)])
    });
    attach_meta(servers, meta)
}

fn adapt_codex(mut servers: ServerMap, mut meta: Option<Value>) -> Value {
    servers.retain(|_, v| v.as_object().map(is_stdio).unwrap_or(false));

    if let Some(Value::Object(ref mut m)) = meta {
        m.retain(|k, _| servers.contains_key(k));
        servers.insert("meta".to_string(), Value::Object(std::mem::take(m)));
        meta = None; // already attached above
    }
    attach_meta(servers, meta)
}

fn adapt_opencode(servers: ServerMap, meta: Option<Value>) -> Value {
    let mut servers = transform_http_servers(servers, |mut s| {
        let url = s
            .remove("url")
            .unwrap_or_else(|| Value::String(String::new()));

        let mut headers = s
            .remove("headers")
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();

        ensure_header(
            &mut headers,
            "Accept",
            "application/json, text/event-stream",
        );

        Map::from_iter([
            ("type".to_string(), Value::String("remote".to_string())),
            ("url".to_string(), url),
            ("headers".to_string(), Value::Object(headers)),
            ("enabled".to_string(), Value::Bool(true)),
        ])
    });

    for (_k, v) in servers.iter_mut() {
        if let Value::Object(s) = v
            && is_stdio(s)
        {
            let command_str = s
                .remove("command")
                .and_then(|v| match v {
                    Value::String(s) => Some(s),
                    _ => None,
                })
                .unwrap_or_default();

            let mut cmd_vec: Vec<Value> = Vec::new();
            if !command_str.is_empty() {
                cmd_vec.push(Value::String(command_str));
            }

            if let Some(arr) = s.remove("args").and_then(|v| match v {
                Value::Array(arr) => Some(arr),
                _ => None,
            }) {
                for a in arr {
                    match a {
                        Value::String(s) => cmd_vec.push(Value::String(s)),
                        other => cmd_vec.push(other), // fall back to raw value if not string
                    }
                }
            }

            let mut new_map = Map::new();
            new_map.insert("type".to_string(), Value::String("local".to_string()));
            new_map.insert("command".to_string(), Value::Array(cmd_vec));
            new_map.insert("enabled".to_string(), Value::Bool(true));
            *s = new_map;
        }
    }

    attach_meta(servers, meta)
}

fn adapt_copilot(mut servers: ServerMap, meta: Option<Value>) -> Value {
    for (_, value) in servers.iter_mut() {
        if let Value::Object(s) = value
            && !s.contains_key("tools")
        {
            s.insert(
                "tools".to_string(),
                Value::Array(vec![Value::String("*".to_string())]),
            );
        }
    }
    attach_meta(servers, meta)
}

enum Adapter {
    Passthrough,
    Gemini,
    Cursor,
    Codex,
    Opencode,
    Copilot,
}

fn apply_adapter(adapter: Adapter, canonical: Value) -> Value {
    let (servers_only, meta) = match canonical.as_object() {
        Some(map) => extract_meta(map.clone()),
        None => (ServerMap::new(), None),
    };

    match adapter {
        Adapter::Passthrough => adapt_passthrough(servers_only, meta),
        Adapter::Gemini => adapt_gemini(servers_only, meta),
        Adapter::Cursor => adapt_cursor(servers_only, meta),
        Adapter::Codex => adapt_codex(servers_only, meta),
        Adapter::Opencode => adapt_opencode(servers_only, meta),
        Adapter::Copilot => adapt_copilot(servers_only, meta),
    }
}

impl CodingAgent {
    pub fn preconfigured_mcp(&self) -> Value {
        use Adapter::*;

        let adapter = match self {
            CodingAgent::ClaudeCode(_) | CodingAgent::Amp(_) | CodingAgent::Droid(_) => Passthrough,
            CodingAgent::QwenCode(_) | CodingAgent::Gemini(_) => Gemini,
            CodingAgent::CursorAgent(_) => Cursor,
            CodingAgent::Codex(_) => Codex,
            CodingAgent::Opencode(_) => Opencode,
            CodingAgent::Copilot(..) => Copilot,
        };

        let canonical = PRECONFIGURED_MCP_SERVERS.clone();
        apply_adapter(adapter, canonical)
    }
}

/// Represents the source of an MCP server configuration
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum McpServerSource {
    /// Server configured by vibe-kanban in the agent's config file
    VibeKanban,
    /// Server configured in Claude Code's user-level ~/.claude/.mcp.json
    ClaudeCodeUser,
    /// Server configured in Claude Code's project-level .mcp.json
    ClaudeCodeProject,
}

/// MCP server with source information
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct McpServerWithSource {
    /// The server configuration
    pub config: Value,
    /// Where this server configuration came from
    pub source: McpServerSource,
    /// Whether this server can be edited by vibe-kanban (false for Claude Code sources)
    pub editable: bool,
}

/// Claude Code MCP configuration from ~/.claude/.mcp.json or project .mcp.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClaudeCodeMcpConfig {
    #[serde(default, rename = "mcpServers")]
    pub mcp_servers: HashMap<String, Value>,
}

/// Returns the path to Claude Code's user-level MCP configuration
pub fn claude_code_user_mcp_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".claude").join(".mcp.json"))
}

/// Returns the path to Claude Code's project-level MCP configuration for a given directory
pub fn claude_code_project_mcp_path(project_dir: &std::path::Path) -> PathBuf {
    project_dir.join(".mcp.json")
}

/// Reads Claude Code's MCP configuration from a given path
pub async fn read_claude_code_mcp_config(
    path: &std::path::Path,
) -> Result<ClaudeCodeMcpConfig, ExecutorError> {
    match fs::read_to_string(path).await {
        Ok(content) => {
            if content.trim().is_empty() {
                return Ok(ClaudeCodeMcpConfig::default());
            }
            serde_json::from_str(&content).map_err(ExecutorError::Json)
        }
        Err(_) => Ok(ClaudeCodeMcpConfig::default()),
    }
}

/// Reads Claude Code's user-level MCP servers from ~/.claude/.mcp.json
pub async fn read_claude_code_user_mcp_servers() -> HashMap<String, McpServerWithSource> {
    let Some(path) = claude_code_user_mcp_path() else {
        return HashMap::new();
    };

    match read_claude_code_mcp_config(&path).await {
        Ok(config) => config
            .mcp_servers
            .into_iter()
            .map(|(name, config)| {
                (
                    name,
                    McpServerWithSource {
                        config,
                        source: McpServerSource::ClaudeCodeUser,
                        editable: false,
                    },
                )
            })
            .collect(),
        Err(e) => {
            tracing::warn!("Failed to read Claude Code user MCP config: {}", e);
            HashMap::new()
        }
    }
}

/// Reads Claude Code's project-level MCP servers from a project directory's .mcp.json
pub async fn read_claude_code_project_mcp_servers(
    project_dir: &std::path::Path,
) -> HashMap<String, McpServerWithSource> {
    let path = claude_code_project_mcp_path(project_dir);

    match read_claude_code_mcp_config(&path).await {
        Ok(config) => config
            .mcp_servers
            .into_iter()
            .map(|(name, config)| {
                (
                    name,
                    McpServerWithSource {
                        config,
                        source: McpServerSource::ClaudeCodeProject,
                        editable: false,
                    },
                )
            })
            .collect(),
        Err(e) => {
            tracing::debug!(
                "No project-level Claude Code MCP config at {}: {}",
                path.display(),
                e
            );
            HashMap::new()
        }
    }
}

/// Reads all Claude Code MCP servers (both user and project level)
/// Project-level servers take precedence over user-level servers with the same name
pub async fn read_all_claude_code_mcp_servers(
    project_dir: Option<&std::path::Path>,
) -> HashMap<String, McpServerWithSource> {
    let mut servers = read_claude_code_user_mcp_servers().await;

    if let Some(dir) = project_dir {
        let project_servers = read_claude_code_project_mcp_servers(dir).await;
        // project-level servers override user-level servers
        servers.extend(project_servers);
    }

    servers
}
