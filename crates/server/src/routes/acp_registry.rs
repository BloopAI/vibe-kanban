use std::collections::HashMap;

use axum::{
    Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use deployment::Deployment;
use executors::{
    executors::{
        BaseCodingAgent, CodingAgent,
        acp::{
            install,
            registry::{self, RegistryAgent, registry_key},
        },
        acp_server::AcpServer,
    },
    profile::{ExecutorConfigs, ExecutorProfile},
};
use serde::Serialize;
use tokio::sync::Mutex;
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

/// Serialises install/uninstall: each one reads, rewrites and reloads
/// profiles.json, so concurrent requests would drop each other's changes.
static PROFILES_WRITE_LOCK: Mutex<()> = Mutex::const_new(());

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/acp-registry/agents", get(list_agents))
        .route(
            "/acp-registry/agents/{id}",
            post(install_agent).delete(uninstall_agent),
        )
        .route(
            "/acp-registry/agents/{id}/install-progress",
            get(install_progress),
        )
}

/// An agent from the ACP registry that can be installed
#[derive(Debug, Clone, Serialize, TS)]
pub struct AcpRegistryAgent {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub icon: Option<String>,
    /// Key the agent is (or would be) installed under in profiles
    pub executor: BaseCodingAgent,
    /// Whether the agent's executor key already exists in profiles
    pub installed: bool,
}

impl AcpRegistryAgent {
    fn new(agent: RegistryAgent, profiles: &ExecutorConfigs) -> Self {
        let executor = registry_key(&agent.id);
        let installed = profiles.executors.contains_key(&executor);
        Self {
            id: agent.id,
            name: agent.name,
            version: agent.version,
            description: agent.description,
            icon: agent.icon,
            executor,
            installed,
        }
    }
}

async fn list_agents() -> Result<ResponseJson<ApiResponse<Vec<AcpRegistryAgent>>>, ApiError> {
    let agents = registry::refresh().await?;
    let profiles = ExecutorConfigs::get_cached();
    Ok(ResponseJson(ApiResponse::success(
        agents
            .into_iter()
            .map(|agent| AcpRegistryAgent::new(agent, &profiles))
            .collect(),
    )))
}

async fn install_agent(
    Path(id): Path<String>,
) -> Result<ResponseJson<ApiResponse<AcpRegistryAgent>>, ApiError> {
    // The visible list excludes hidden ids, so built-ins can't be installed
    let agent = registry::cached()
        .await?
        .into_iter()
        .find(|agent| agent.id == id)
        .ok_or_else(|| ApiError::BadRequest(format!("Unknown ACP registry agent '{id}'")))?;

    // Refuse built-ins, already installed agents and key collisions alike
    let key = registry_key(&agent.id);
    if ExecutorConfigs::get_cached().executors.contains_key(&key) {
        return Err(ApiError::Conflict(format!(
            "An executor named '{key}' already exists"
        )));
    }

    // Binary agents need their archive before they can run. Download it here, so
    // the dialog can show progress and the first run does not block on it. The
    // download runs in its own task: closing the dialog must not abort it, and a
    // retry joins the install already in flight.
    if let (Some(platform), Some(target)) = (install::platform_key(), agent.binary_target()) {
        let agent_id = agent.id.clone();
        let version = agent.version.clone();
        let target = target.clone();
        tokio::spawn(async move {
            install::ensure_installed(&agent_id, &version, platform, &target).await
        })
        .await
        .map_err(|e| ApiError::BadRequest(format!("Install task failed: {e}")))?
        .map_err(|e| ApiError::BadRequest(format!("Failed to install '{}': {e}", agent.name)))?;
    }

    let _guard = PROFILES_WRITE_LOCK.lock().await;

    // Re-check under the lock: a concurrent install may have won the race.
    let mut profiles = ExecutorConfigs::get_cached();
    if profiles.executors.contains_key(&key) {
        return Err(ApiError::Conflict(format!(
            "An executor named '{key}' already exists"
        )));
    }

    let mut profile = ExecutorProfile {
        recently_used_models: None,
        configurations: HashMap::new(),
    };
    profile.set_default(CodingAgent::AcpServer(AcpServer::new(agent.id.clone())));
    profiles.executors.insert(key, profile);
    profiles.save_overrides()?;
    ExecutorConfigs::reload();

    Ok(ResponseJson(ApiResponse::success(AcpRegistryAgent::new(
        agent,
        &ExecutorConfigs::get_cached(),
    ))))
}

/// Download progress of a binary agent install, polled by the settings card.
#[derive(Debug, Clone, Serialize, TS)]
pub struct AcpRegistryInstallProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub done: bool,
    pub error: Option<String>,
}

async fn install_progress(
    Path(id): Path<String>,
) -> ResponseJson<ApiResponse<Option<AcpRegistryInstallProgress>>> {
    let progress = install::progress(&id).map(|progress| AcpRegistryInstallProgress {
        downloaded: progress.downloaded,
        total: progress.total,
        done: progress.done,
        error: progress.error,
    });
    ResponseJson(ApiResponse::success(progress))
}

async fn uninstall_agent(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let _guard = PROFILES_WRITE_LOCK.lock().await;

    let mut profiles = ExecutorConfigs::get_cached();
    let key = registry_install_key(&profiles, &id).ok_or_else(|| {
        ApiError::BadRequest(format!("'{id}' is not an installed ACP registry agent"))
    })?;

    // Removing the default would leave the config pointing at a missing executor
    if deployment.config().read().await.executor_profile.executor == key {
        return Err(ApiError::Conflict(format!(
            "'{id}' is the default agent. Choose another default before uninstalling it"
        )));
    }

    profiles.executors.remove(&key);
    profiles.save_overrides()?;
    ExecutorConfigs::reload();

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Executor key of `id` if it was installed from the registry. Uninstall only
/// removes these, never built-ins or their custom configs (compute_overrides
/// blocks deleting built-ins, but don't rely on that). Matching registry_id
/// also guards against two ids that map to the same key.
fn registry_install_key(profiles: &ExecutorConfigs, id: &str) -> Option<BaseCodingAgent> {
    let key = registry_key(id);
    let default_config = profiles.executors.get(&key)?.get_variant("DEFAULT")?;
    matches!(default_config, CodingAgent::AcpServer(server) if server.registry_id == id)
        .then_some(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_registry_agent(key: &str, registry_id: &str) -> ExecutorConfigs {
        let mut profiles = ExecutorConfigs::from_defaults();
        let mut profile = ExecutorProfile {
            recently_used_models: None,
            configurations: HashMap::new(),
        };
        profile.set_default(CodingAgent::AcpServer(AcpServer::new(
            registry_id.to_string(),
        )));
        profiles
            .executors
            .insert(BaseCodingAgent::from(key.to_string()), profile);
        profiles
    }

    #[test]
    fn registry_install_key_finds_installed_agent() {
        let profiles = with_registry_agent("KILO", "kilo");
        assert_eq!(
            registry_install_key(&profiles, "kilo"),
            Some(BaseCodingAgent::from("KILO".to_string()))
        );
    }

    #[test]
    fn registry_install_key_ignores_builtins() {
        // "claude-code" maps to the built-in CLAUDE_CODE key
        let profiles = ExecutorConfigs::from_defaults();
        assert_eq!(registry_install_key(&profiles, "claude-code"), None);
        assert_eq!(registry_install_key(&profiles, "kilo"), None);
    }

    #[test]
    fn registry_install_key_ignores_key_collisions() {
        // "some.agent" and "some-agent" both map to SOME_AGENT
        let profiles = with_registry_agent("SOME_AGENT", "some-agent");
        assert_eq!(registry_install_key(&profiles, "some.agent"), None);
    }
}
