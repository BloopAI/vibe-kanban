use axum::{
    Extension, Json,
    extract::{Query, State},
    http::StatusCode,
    response::Json as ResponseJson,
};
use chrono::{DateTime, Utc};
use db::models::{
    coding_agent_turn::CodingAgentTurn,
    execution_process::{ExecutionProcess, ExecutionProcessStatus},
    workspace::{Workspace, WorkspaceError},
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::{container::ContainerService, diff_stream, remote_sync};
use sqlx::Error as SqlxError;
use utils::response::ApiResponse;
use uuid::Uuid;
use workspace_manager::WorkspaceManager;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct DeleteWorkspaceQuery {
    #[serde(default)]
    pub delete_remote: bool,
    #[serde(default)]
    pub delete_branches: bool,
}

pub async fn get_workspaces(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Workspace>>>, ApiError> {
    let pool = &deployment.db().pool;
    let workspaces = Workspace::fetch_all(pool).await?;
    Ok(ResponseJson(ApiResponse::success(workspaces)))
}

pub async fn get_workspace(
    Extension(workspace): Extension<Workspace>,
) -> Result<ResponseJson<ApiResponse<Workspace>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(workspace)))
}

pub async fn update_workspace(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<db::models::requests::UpdateWorkspace>,
) -> Result<ResponseJson<ApiResponse<Workspace>>, ApiError> {
    let pool = &deployment.db().pool;
    let is_archiving = request.archived == Some(true) && !workspace.archived;

    Workspace::update(
        pool,
        workspace.id,
        request.archived,
        request.pinned,
        request.name.as_deref(),
    )
    .await?;
    let updated = Workspace::find_by_id(pool, workspace.id)
        .await?
        .ok_or(WorkspaceError::WorkspaceNotFound)?;

    if (request.archived.is_some() || request.name.is_some())
        && let Ok(client) = deployment.remote_client()
    {
        let ws = updated.clone();
        let name = request.name.clone();
        let archived = request.archived;
        let stats =
            diff_stream::compute_diff_stats(&deployment.db().pool, deployment.git(), &ws).await;
        tokio::spawn(async move {
            remote_sync::sync_workspace_to_remote(
                &client,
                ws.id,
                name.map(Some),
                archived,
                stats.as_ref(),
            )
            .await;
        });
    }

    if is_archiving && let Err(e) = deployment.container().archive_workspace(workspace.id).await {
        tracing::error!("Failed to archive workspace {}: {}", workspace.id, e);
    }

    Ok(ResponseJson(ApiResponse::success(updated)))
}

pub async fn get_first_user_message(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Option<String>>>, ApiError> {
    let pool = &deployment.db().pool;
    let message = Workspace::get_first_user_message(pool, workspace.id).await?;
    Ok(ResponseJson(ApiResponse::success(message)))
}

pub async fn delete_workspace(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<DeleteWorkspaceQuery>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    let pool = &deployment.db().pool;
    let workspace_manager = deployment.workspace_manager();
    let workspace_id = workspace.id;

    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace_id)
        .await?
    {
        return Err(ApiError::Conflict(
            "Cannot delete workspace while processes are running. Stop all processes first."
                .to_string(),
        ));
    }

    let dev_servers =
        ExecutionProcess::find_running_dev_servers_by_workspace(pool, workspace_id).await?;

    for dev_server in dev_servers {
        tracing::info!(
            "Stopping dev server {} before deleting workspace {}",
            dev_server.id,
            workspace_id
        );

        if let Err(e) = deployment
            .container()
            .stop_execution(&dev_server, ExecutionProcessStatus::Killed)
            .await
        {
            tracing::error!(
                "Failed to stop dev server {} for workspace {}: {}",
                dev_server.id,
                workspace_id,
                e
            );
        }
    }

    let managed_workspace = workspace_manager.load_managed_workspace(workspace).await?;
    let deletion_context = managed_workspace.prepare_deletion_context().await?;
    let rows_affected = managed_workspace.delete_record().await?;

    if rows_affected == 0 {
        return Err(ApiError::Database(SqlxError::RowNotFound));
    }

    deployment
        .track_if_analytics_allowed(
            "workspace_deleted",
            serde_json::json!({
                "workspace_id": workspace_id.to_string(),
            }),
        )
        .await;

    if query.delete_remote {
        if let Ok(client) = deployment.remote_client() {
            match client.delete_workspace(workspace_id).await {
                Ok(()) => {
                    tracing::info!("Deleted remote workspace for {}", workspace_id);
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to delete remote workspace for {}: {}",
                        workspace_id,
                        e
                    );
                }
            }
        } else {
            tracing::debug!(
                "Remote client not available, skipping remote deletion for {}",
                workspace_id
            );
        }
    }

    WorkspaceManager::spawn_workspace_deletion_cleanup(deletion_context, query.delete_branches);

    Ok((StatusCode::ACCEPTED, ResponseJson(ApiResponse::success(()))))
}

#[axum::debug_handler]
pub async fn mark_seen(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    CodingAgentTurn::mark_seen_by_workspace_id(pool, workspace.id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

#[derive(Debug, Deserialize)]
pub struct WaitForWorkspaceRequest {
    pub workspace_ids: Vec<Uuid>,
    #[serde(default = "default_timeout_seconds")]
    pub timeout_seconds: u64,
}

fn default_timeout_seconds() -> u64 {
    1800
}

#[derive(Debug, Serialize)]
pub struct WaitForWorkspaceResponse {
    pub completed_workspace_id: Uuid,
    pub status: String,
    pub branch: String,
    pub name: Option<String>,
    pub completed_at: Option<DateTime<Utc>>,
}

/// Long-poll endpoint: holds the connection open until any of the requested workspaces
/// reaches a terminal state (not running) or the timeout elapses.
pub async fn wait_for_workspace(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<WaitForWorkspaceRequest>,
) -> Result<ResponseJson<ApiResponse<WaitForWorkspaceResponse>>, ApiError> {
    use std::time::Duration;

    if request.workspace_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "workspace_ids must not be empty".to_string(),
        ));
    }

    let pool = &deployment.db().pool;
    let deadline =
        tokio::time::Instant::now() + Duration::from_secs(request.timeout_seconds.min(3600));
    let poll_interval = Duration::from_millis(500);

    loop {
        for id in &request.workspace_ids {
            if let Some(ws) = Workspace::find_by_id_with_status(pool, *id).await? {
                if !ws.is_running {
                    // Only treat as completed if at least one execution process has
                    // been created. Otherwise the workspace hasn't started yet and we
                    // should keep polling.
                    let has_executions =
                        ExecutionProcess::has_any_execution_for_workspace(pool, ws.workspace.id)
                            .await?;

                    if has_executions {
                        let completed_at = ExecutionProcess::latest_completed_at_for_workspace(
                            pool,
                            ws.workspace.id,
                        )
                        .await?;

                        let status = if ws.is_errored { "failed" } else { "completed" };

                        return Ok(ResponseJson(ApiResponse::success(
                            WaitForWorkspaceResponse {
                                completed_workspace_id: ws.workspace.id,
                                status: status.to_string(),
                                branch: ws.workspace.branch.clone(),
                                name: ws.workspace.name.clone(),
                                completed_at,
                            },
                        )));
                    }
                }
            }
        }

        if tokio::time::Instant::now() + poll_interval > deadline {
            let first_id = request.workspace_ids[0];
            let branch = Workspace::find_by_id(pool, first_id)
                .await?
                .map(|w| w.branch.clone())
                .unwrap_or_default();

            return Ok(ResponseJson(ApiResponse::success(
                WaitForWorkspaceResponse {
                    completed_workspace_id: first_id,
                    status: "timeout".to_string(),
                    branch,
                    name: None,
                    completed_at: None,
                },
            )));
        }

        tokio::time::sleep(poll_interval).await;
    }
}
