//! WebSocket and streaming handlers: stream_tasks_ws, get_available_nodes, get_stream_connection_info.

use axum::{
    Extension,
    extract::{
        Query, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    response::{IntoResponse, Json as ResponseJson},
};
use db::models::{project::Project, task::Task};
use deployment::Deployment;
use futures_util::TryStreamExt;
use remote::routes::{projects::ListProjectNodesResponse, tasks::TaskStreamConnectionInfoResponse};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::routes::tasks::types::TaskQuery;
use crate::{
    DeploymentImpl,
    error::ApiError,
    ws_util::{WsKeepAlive, run_ws_stream},
};

fn resolve_remote_project_id(
    task: &Task,
    project: Option<Project>,
) -> Result<Option<Uuid>, ApiError> {
    if let Some(project) = project {
        return Ok(project.remote_project_id);
    }

    if task.shared_task_id == Some(task.id) {
        return Ok(Some(task.project_id));
    }

    Err(ApiError::BadRequest("Project not found".to_string()))
}

// ============================================================================
// WebSocket Task Stream
// ============================================================================

/// WebSocket endpoint for streaming task updates.
pub async fn stream_tasks_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) =
            handle_tasks_ws(socket, deployment, query.project_id, query.include_archived).await
        {
            tracing::warn!("tasks WS closed: {}", e);
        }
    })
}

/// Internal handler for WebSocket task streaming.
async fn handle_tasks_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    project_id: Uuid,
    include_archived: bool,
) -> anyhow::Result<()> {
    // Get the raw stream and convert LogMsg to WebSocket messages
    let stream = deployment
        .events()
        .stream_tasks_raw(project_id, include_archived)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    // Use run_ws_stream for proper keep-alive handling
    run_ws_stream(socket, stream, WsKeepAlive::for_list_streams()).await
}

// ============================================================================
// Available Nodes
// ============================================================================

/// Get list of nodes where this task's project exists (for remote attempt start).
///
/// Returns nodes that have the task's project linked, allowing the frontend
/// to show a node selector when starting a task attempt remotely.
pub async fn get_available_nodes(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ListProjectNodesResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get the task's project to find the remote_project_id
    let project = Project::find_by_id(pool, task.project_id).await?;

    // If the project is not linked to the hive, return empty list
    let Some(remote_project_id) = resolve_remote_project_id(&task, project)? else {
        return Ok(ResponseJson(ApiResponse::success(
            ListProjectNodesResponse { nodes: vec![] },
        )));
    };

    // Query the hive for nodes that have this project linked
    let client = deployment.remote_client()?;
    let response = client.list_project_nodes(remote_project_id).await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

// ============================================================================
// Stream Connection Info
// ============================================================================

/// Get stream connection info for a remote task.
///
/// Returns connection URLs and token to stream diff/log data directly from
/// the remote node where the task attempt is running.
pub async fn get_stream_connection_info(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TaskStreamConnectionInfoResponse>>, ApiError> {
    // This endpoint is only valid for remote tasks
    let shared_task_id = task.shared_task_id.ok_or_else(|| {
        ApiError::BadRequest("Task is not a remote task or has no shared_task_id".to_string())
    })?;

    // Call the hive to get connection info
    let client = deployment.remote_client()?;
    let response = client
        .get_task_stream_connection_info(shared_task_id)
        .await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use db::models::task::TaskStatus;

    fn make_task(shared_task_id: Option<Uuid>) -> Task {
        Task {
            id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            title: "task".to_string(),
            description: None,
            status: TaskStatus::Todo,
            parent_task_id: None,
            shared_task_id,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            remote_assignee_user_id: None,
            remote_assignee_name: None,
            remote_assignee_username: None,
            remote_version: 0,
            remote_last_synced_at: None,
            remote_stream_node_id: None,
            remote_stream_url: None,
            archived_at: None,
            activity_at: None,
        }
    }

    #[test]
    fn resolve_remote_project_id_uses_local_project_mapping_when_available() {
        let task = make_task(Some(Uuid::new_v4()));
        let remote_project_id = Uuid::new_v4();
        let project = Project {
            id: Uuid::new_v4(),
            name: "project".to_string(),
            git_repo_path: "/tmp/project".into(),
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
            parallel_setup_script: false,
            remote_project_id: Some(remote_project_id),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            is_remote: false,
            source_node_id: None,
            source_node_name: None,
            source_node_public_url: None,
            source_node_status: None,
            remote_last_synced_at: None,
            github_enabled: false,
            github_owner: None,
            github_repo: None,
            github_open_issues: 0,
            github_open_prs: 0,
            github_last_synced_at: None,
        };

        let resolved = resolve_remote_project_id(&task, Some(project)).expect("resolve project");
        assert_eq!(resolved, Some(remote_project_id));
    }

    #[test]
    fn resolve_remote_project_id_falls_back_to_task_project_id_for_hive_only_task() {
        let mut task = make_task(Some(Uuid::new_v4()));
        task.shared_task_id = Some(task.id);
        let expected_remote_project_id = task.project_id;

        let resolved = resolve_remote_project_id(&task, None).expect("resolve hive-only task");
        assert_eq!(resolved, Some(expected_remote_project_id));
    }

    #[test]
    fn resolve_remote_project_id_errors_for_local_task_without_project_row() {
        let task = make_task(None);

        let result = resolve_remote_project_id(&task, None);
        assert!(matches!(result, Err(ApiError::BadRequest(_))));
    }

    #[test]
    fn resolve_remote_project_id_errors_for_synced_local_task_without_project_row() {
        let task = make_task(Some(Uuid::new_v4()));

        let result = resolve_remote_project_id(&task, None);
        assert!(matches!(result, Err(ApiError::BadRequest(_))));
    }
}
