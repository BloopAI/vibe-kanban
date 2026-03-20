use std::path::Path;

use axum::{
    Extension, Json, Router,
    extract::State,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{workspace::Workspace, workspace_repo::WorkspaceRepo};
use deployment::Deployment;
use executors::{
    executors::{CodingAgent, ExecutorError},
    profile::{ExecutorConfigs, ExecutorProfileId},
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use ts_rs::TS;
use utils::response::ApiResponse;

use super::{codex_setup, cursor_setup, gh_cli_setup::GhCliSetupError};
use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RunAgentSetupRequest {
    pub executor_profile_id: ExecutorProfileId,
}

#[derive(Debug, Serialize, TS)]
pub struct RunAgentSetupResponse {}

#[derive(Deserialize, TS)]
pub struct OpenEditorRequest {
    editor_type: Option<String>,
    file_path: Option<String>,
    /// When set, open this specific repo within the workspace (for multi-repo picker).
    #[ts(optional)]
    repo_id: Option<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct OpenEditorResponse {
    pub url: Option<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct EditorPickerRepo {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub effective_editor_type: Option<String>,
    pub editor_launch_target: Option<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct EditorPickerResponse {
    pub repos: Vec<EditorPickerRepo>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/editor/open", post(open_workspace_in_editor))
        .route("/editor/picker", get(get_editor_picker))
        .route("/agent/setup", post(run_agent_setup))
        .route("/github/cli/setup", post(gh_cli_setup_handler))
}

#[axum::debug_handler]
pub async fn run_agent_setup(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RunAgentSetupRequest>,
) -> Result<ResponseJson<ApiResponse<RunAgentSetupResponse>>, ApiError> {
    let executor_profile_id = payload.executor_profile_id;
    let config = ExecutorConfigs::get_cached();
    let coding_agent = config.get_coding_agent_or_default(&executor_profile_id);
    match coding_agent {
        CodingAgent::CursorAgent(_) => {
            cursor_setup::run_cursor_setup(&deployment, &workspace).await?;
        }
        CodingAgent::Codex(codex) => {
            codex_setup::run_codex_setup(&deployment, &workspace, &codex).await?;
        }
        _ => return Err(ApiError::Executor(ExecutorError::SetupHelperNotSupported)),
    }

    deployment
        .track_if_analytics_allowed(
            "agent_setup_script_executed",
            serde_json::json!({
                "executor_profile_id": executor_profile_id.to_string(),
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(RunAgentSetupResponse {})))
}

pub async fn open_workspace_in_editor(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<OpenEditorRequest>,
) -> Result<ResponseJson<ApiResponse<OpenEditorResponse>>, ApiError> {
    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    deployment.container().touch(&workspace).await?;

    let workspace_path = Path::new(&container_ref);
    let workspace_repos =
        WorkspaceRepo::find_repos_for_workspace(&deployment.db().pool, workspace.id).await?;

    // Resolve which repo to target (if any) and build the path within the worktree.
    // Priority: explicit repo_id from picker > single-repo auto-select > workspace root.
    let target_repo = if let Some(ref repo_id_str) = payload.repo_id {
        let repo_id: uuid::Uuid = repo_id_str
            .parse()
            .map_err(|_| ApiError::BadRequest("Invalid repo ID".into()))?;
        workspace_repos.iter().find(|r| r.id == repo_id)
    } else if workspace_repos.len() == 1 && payload.file_path.is_none() {
        Some(&workspace_repos[0])
    } else {
        None
    };

    let (workspace_path, resolved_editor_type) = if let Some(repo) = target_repo {
        let base = workspace_path.join(&repo.name);
        let path = match repo.editor_launch_target.as_deref() {
            Some(target) if payload.file_path.is_none() => base.join(target),
            _ => base,
        };
        // Resolution order: request editor_type > repo override > global config
        let editor_type = payload
            .editor_type
            .as_deref()
            .map(|s| s.to_string())
            .or_else(|| repo.editor_type_override.clone());
        (path, editor_type)
    } else {
        (workspace_path.to_path_buf(), payload.editor_type.clone())
    };

    let path = if let Some(file_path) = payload.file_path.as_ref() {
        workspace_path.join(file_path)
    } else {
        workspace_path
    };

    let editor_config = {
        let config = deployment.config().read().await;
        config.editor.with_override(resolved_editor_type.as_deref())
    };

    match editor_config.open_file(path.as_path()).await {
        Ok(url) => {
            tracing::info!(
                "Opened editor for workspace {} at path: {}{}",
                workspace.id,
                path.display(),
                if url.is_some() { " (remote mode)" } else { "" }
            );

            deployment
                .track_if_analytics_allowed(
                    "task_attempt_editor_opened",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                        "editor_type": resolved_editor_type.as_ref(),
                        "remote_mode": url.is_some(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(OpenEditorResponse {
                url,
            })))
        }
        Err(e) => {
            tracing::error!(
                "Failed to open editor for attempt {}: {:?}",
                workspace.id,
                e
            );
            Err(ApiError::EditorOpen(e))
        }
    }
}

pub async fn get_editor_picker(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<EditorPickerResponse>>, ApiError> {
    let workspace_repos =
        WorkspaceRepo::find_repos_for_workspace(&deployment.db().pool, workspace.id).await?;

    let repos = workspace_repos
        .into_iter()
        .map(|repo| EditorPickerRepo {
            id: repo.id.to_string(),
            name: repo.name.clone(),
            display_name: repo.display_name.clone(),
            effective_editor_type: repo.editor_type_override.clone(),
            editor_launch_target: repo.editor_launch_target.clone(),
        })
        .collect();

    Ok(ResponseJson(ApiResponse::success(EditorPickerResponse {
        repos,
    })))
}

#[axum::debug_handler]
pub async fn gh_cli_setup_handler(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<
    ResponseJson<ApiResponse<db::models::execution_process::ExecutionProcess, GhCliSetupError>>,
    ApiError,
> {
    match super::gh_cli_setup::run_gh_cli_setup(&deployment, &workspace).await {
        Ok(execution_process) => {
            deployment
                .track_if_analytics_allowed(
                    "gh_cli_setup_executed",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(execution_process)))
        }
        Err(ApiError::Executor(executors::executors::ExecutorError::ExecutableNotFound {
            program,
        })) if program == "brew" => Ok(ResponseJson(ApiResponse::error_with_data(
            GhCliSetupError::BrewMissing,
        ))),
        Err(ApiError::Executor(ExecutorError::SetupHelperNotSupported)) => Ok(ResponseJson(
            ApiResponse::error_with_data(GhCliSetupError::SetupHelperNotSupported),
        )),
        Err(ApiError::Executor(err)) => Ok(ResponseJson(ApiResponse::error_with_data(
            GhCliSetupError::Other {
                message: err.to_string(),
            },
        ))),
        Err(err) => Err(err),
    }
}
