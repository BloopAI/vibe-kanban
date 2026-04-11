use std::path::{Path, PathBuf};

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
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
}

#[derive(Debug, Serialize, TS)]
pub struct OpenEditorResponse {
    pub url: Option<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct OpenEditorPathResponse {
    pub workspace_path: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenEditorPathQuery {
    file_path: Option<String>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/editor/path", get(get_workspace_editor_path))
        .route("/editor/open", post(open_workspace_in_editor))
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
    let path = resolve_workspace_editor_path(&deployment, &workspace, payload.file_path.as_deref())
        .await?;

    let editor_config = {
        let config = deployment.config().read().await;
        let editor_type_str = payload.editor_type.as_deref();
        config.editor.with_override(editor_type_str)
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
                        "editor_type": payload.editor_type.as_ref(),
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

pub async fn get_workspace_editor_path(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<OpenEditorPathQuery>,
) -> Result<ResponseJson<ApiResponse<OpenEditorPathResponse>>, ApiError> {
    let path =
        resolve_workspace_editor_path(&deployment, &workspace, query.file_path.as_deref()).await?;

    Ok(ResponseJson(ApiResponse::success(OpenEditorPathResponse {
        workspace_path: path.to_string_lossy().into_owned(),
    })))
}

async fn resolve_workspace_editor_path(
    deployment: &DeploymentImpl,
    workspace: &Workspace,
    file_path: Option<&str>,
) -> Result<PathBuf, ApiError> {
    let container_ref = deployment
        .container()
        .ensure_container_exists(workspace)
        .await?;
    deployment.container().touch(workspace).await?;

    let workspace_path = Path::new(&container_ref);
    let workspace_repos =
        WorkspaceRepo::find_repos_for_workspace(&deployment.db().pool, workspace.id).await?;
    let workspace_path = if workspace_repos.len() == 1 && file_path.is_none() {
        workspace_path.join(&workspace_repos[0].name)
    } else {
        workspace_path.to_path_buf()
    };

    Ok(if let Some(file_path) = file_path {
        workspace_path.join(file_path)
    } else {
        workspace_path
    })
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
