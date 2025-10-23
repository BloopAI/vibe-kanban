use std::{collections::HashSet, env, io::ErrorKind, path::Path};

use sha2::{Digest, Sha256};
use tokio::fs;
use tracing::warn;

use super::CursorAgent;
use crate::executors::{CodingAgent, ExecutorError, StandardCodingAgentExecutor};

pub async fn ensure_mcp_server_trust(cursor: &CursorAgent, current_dir: &Path) {
    if let Err(err) = ensure_mcp_server_trust_impl(cursor, current_dir).await {
        tracing::warn!(
            error = %err,
            "Cursor MCP approval bootstrap failed. MCP servers might be unavailable."
        );
    }
}

async fn ensure_mcp_server_trust_impl(
    cursor: &CursorAgent,
    current_dir: &Path,
) -> Result<(), ExecutorError> {
    let current_dir =
        std::fs::canonicalize(current_dir).unwrap_or_else(|_| current_dir.to_path_buf());

    let Some(config_path) = cursor.default_mcp_config_path() else {
        return Ok(());
    };

    let Some(home_dir) = dirs::home_dir() else {
        return Ok(());
    };

    let absolute_path = if current_dir.is_absolute() {
        current_dir.to_path_buf()
    } else {
        match env::current_dir() {
            Ok(cwd) => cwd.join(current_dir),
            Err(_) => current_dir.to_path_buf(),
        }
    };

    let worktree_path_str = absolute_path.to_string_lossy().to_string();
    if worktree_path_str.is_empty() {
        return Ok(());
    }

    let Some(project_slug) = cursor_project_slug(&absolute_path) else {
        return Ok(());
    };

    let config_value: serde_json::Value = match fs::read_to_string(&config_path).await {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(val) => val,
            Err(err) => {
                warn!(
                    error = ?err,
                    path = %config_path.display(),
                    "Failed to parse Cursor MCP config; falling back to defaults for auto-approval bootstrap"
                );
                default_cursor_mcp_servers(cursor)
            }
        },
        Err(err) if err.kind() == ErrorKind::NotFound => default_cursor_mcp_servers(cursor),
        Err(err) => return Err(ExecutorError::Io(err)),
    };

    let Some(servers) = config_value
        .get("mcpServers")
        .and_then(|value| value.as_object())
    else {
        return Ok(());
    };

    let approvals_path = home_dir
        .join(".cursor")
        .join("projects")
        .join(&project_slug)
        .join("mcp-approvals.json");

    let mut existing: Vec<String> = match fs::read_to_string(&approvals_path).await {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(list) => list,
            Err(err) => {
                warn!(
                    error = ?err,
                    path = %approvals_path.display(),
                    "Failed to parse existing Cursor MCP approvals; resetting file"
                );
                Vec::new()
            }
        },
        Err(err) if err.kind() == ErrorKind::NotFound => Vec::new(),
        Err(err) => return Err(ExecutorError::Io(err)),
    };

    let mut approvals_set: HashSet<String> = existing.iter().cloned().collect();
    let mut newly_added = Vec::new();

    for (server_name, definition) in servers {
        if server_name == "meta" || !definition.is_object() {
            continue;
        }

        if let Some(approval_id) =
            compute_cursor_approval_id(server_name, definition, &worktree_path_str)
            && approvals_set.insert(approval_id.clone())
        {
            newly_added.push(approval_id);
        }
    }

    if newly_added.is_empty() {
        return Ok(());
    }

    existing.extend(newly_added);

    if let Some(parent) = approvals_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(ExecutorError::Io)?;
    }

    let serialized = serde_json::to_string_pretty(&existing)?;
    fs::write(&approvals_path, serialized)
        .await
        .map_err(ExecutorError::Io)?;

    Ok(())
}

fn cursor_project_slug(path: &Path) -> Option<String> {
    let raw = path.to_string_lossy();
    if raw.is_empty() {
        return None;
    }

    let slug = regex::Regex::new(r"[^A-Za-z0-9]+")
        .unwrap()
        .replace_all(&raw, "-")
        .trim_matches('-')
        .to_string();

    if slug.is_empty() { None } else { Some(slug) }
}

fn compute_cursor_approval_id(
    server_name: &str,
    definition: &serde_json::Value,
    worktree_path: &str,
) -> Option<String> {
    let payload = serde_json::json!({
        "path": worktree_path,
        "server": definition,
    });

    let serialized = serde_json::to_string(&payload).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(serialized.as_bytes());
    let digest = hasher.finalize();
    let hex = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Some(format!("{server_name}-{}", &hex[..16]))
}

fn default_cursor_mcp_servers(cursor: &CursorAgent) -> serde_json::Value {
    let mcpc = CodingAgent::CursorAgent(cursor.clone()).get_mcp_config();
    serde_json::json!({ "mcpServers": mcpc.preconfigured })
}
