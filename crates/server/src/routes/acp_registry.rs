use axum::{
    Router,
    extract::Path,
    response::Json,
    routing::{get, post},
};
use executors::{
    capability_cache,
    command::CommandBuilder,
    executors::acp::harness::check_followup_support,
    installed_servers::{self, InstalledAcpServer, InstalledServers},
    profile::ExecutorConfigs,
    registry::{self, RegistryEntry},
};
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;

use crate::DeploymentImpl;

const NO_FOLLOWUP_ERROR: &str =
    "This ACP server does not support follow-up messages (no fork or load capability).";

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/acp-registry", get(get_registry))
        .route("/acp-servers", get(get_installed_servers))
        .route("/acp-servers/install-registry", post(install_from_registry))
        .route("/acp-servers/install-custom", post(install_custom))
        .route("/acp-servers/{name}/uninstall", post(uninstall_server))
}

#[derive(Serialize)]
struct RegistryEntryResponse {
    #[serde(flatten)]
    entry: RegistryEntry,
    is_installed: bool,
    is_builtin: bool,
    supports_followup: Option<bool>,
}

async fn get_registry() -> Json<ApiResponse<Vec<RegistryEntryResponse>>> {
    let entries = registry::fetch_registry().await;
    let installed = InstalledServers::load().ok();
    let response: Vec<RegistryEntryResponse> = entries
        .into_iter()
        .map(|entry| {
            let server = installed
                .as_ref()
                .and_then(|i| i.get_by_registry_id(&entry.id));
            let supports_followup = capability_cache::get(&entry.id, &entry.version);
            RegistryEntryResponse {
                is_installed: server.is_some(),
                is_builtin: server.is_some_and(|s| s.is_builtin),
                supports_followup,
                entry,
            }
        })
        .collect();

    Json(ApiResponse::success(response))
}

async fn get_installed_servers() -> Json<ApiResponse<Vec<InstalledAcpServer>>> {
    match InstalledServers::load() {
        Ok(servers) => {
            let entries = registry::get_all_entries();
            let mut list = servers.list().to_vec();
            for server in &mut list {
                if let installed_servers::ServerSource::Registry { registry_id } = &server.source
                    && let Some(entry) = entries.iter().find(|e| &e.id == registry_id)
                {
                    server.icon = entry.icon.clone();
                }
            }
            Json(ApiResponse::success(list))
        }
        Err(e) => Json(ApiResponse::error(&format!(
            "Failed to load installed servers: {e}"
        ))),
    }
}

#[derive(Deserialize)]
struct InstallFromRegistryBody {
    registry_id: String,
}

#[derive(Serialize)]
struct InstallFromRegistryResponse {
    name: String,
}

async fn install_from_registry(
    Json(body): Json<InstallFromRegistryBody>,
) -> Json<ApiResponse<InstallFromRegistryResponse>> {
    let mut servers = match InstalledServers::load() {
        Ok(s) => s,
        Err(e) => return Json(ApiResponse::error(&format!("Failed to load servers: {e}"))),
    };

    if servers.get_by_registry_id(&body.registry_id).is_some() {
        return match servers.install_from_registry(&body.registry_id) {
            Ok(name) => {
                ExecutorConfigs::reload();
                Json(ApiResponse::success(InstallFromRegistryResponse { name }))
            }
            Err(e) => Json(ApiResponse::error(&format!("Failed to install: {e}"))),
        };
    }

    let entry = registry::get_entry(&body.registry_id);
    let version = entry.as_ref().map(|e| e.version.as_str()).unwrap_or("");

    let cached = capability_cache::get(&body.registry_id, version);
    if cached == Some(false) {
        return Json(ApiResponse::error(NO_FOLLOWUP_ERROR));
    }

    if cached.is_none() {
        let supports = match registry::resolve_command_for_registry_id(&body.registry_id).await {
            Some((cmd_str, cmd_overrides)) => {
                let builder = CommandBuilder::new(&cmd_str);
                match builder.build_initial() {
                    Ok(parts) => {
                        let cwd = std::env::current_dir()
                            .unwrap_or_else(|_| std::path::PathBuf::from("."));
                        check_followup_support(parts, &cwd, &cmd_overrides).await
                    }
                    Err(_) => None,
                }
            }
            None => None,
        };

        if let Some((followup, fork)) = supports {
            capability_cache::set(&body.registry_id, version, followup, fork);
        }

        match supports {
            Some((true, _)) => {}
            Some((false, _)) => return Json(ApiResponse::error(NO_FOLLOWUP_ERROR)),
            None => {
                return Json(ApiResponse::error(
                    "Failed to probe ACP server capabilities. \
                     The server may not be reachable or failed to initialize.",
                ));
            }
        }
    }

    match servers.install_from_registry(&body.registry_id) {
        Ok(name) => {
            ExecutorConfigs::reload();
            Json(ApiResponse::success(InstallFromRegistryResponse { name }))
        }
        Err(e) => Json(ApiResponse::error(&format!("Failed to install: {e}"))),
    }
}

#[derive(Deserialize)]
struct InstallCustomBody {
    name: String,
}

async fn install_custom(Json(body): Json<InstallCustomBody>) -> Json<ApiResponse<String>> {
    let mut servers = match InstalledServers::load() {
        Ok(s) => s,
        Err(e) => return Json(ApiResponse::error(&format!("Failed to load servers: {e}"))),
    };
    match servers.install_custom(&body.name) {
        Ok(()) => {
            ExecutorConfigs::reload();
            Json(ApiResponse::success("installed".to_string()))
        }
        Err(e) => Json(ApiResponse::error(&format!("Failed to install: {e}"))),
    }
}

async fn uninstall_server(Path(name): Path<String>) -> Json<ApiResponse<String>> {
    let mut servers = match InstalledServers::load() {
        Ok(s) => s,
        Err(e) => return Json(ApiResponse::error(&format!("Failed to load servers: {e}"))),
    };
    if let Some(server) = servers.get(&name)
        && let installed_servers::ServerSource::Registry { registry_id } = &server.source
    {
        registry::cleanup_binary(registry_id);
    }
    match servers.uninstall(&name) {
        Ok(()) => {
            ExecutorConfigs::reload();
            Json(ApiResponse::success("uninstalled".to_string()))
        }
        Err(e) => Json(ApiResponse::error(&format!("Failed to uninstall: {e}"))),
    }
}
