use axum::{
    Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    requests::{StartTaskRequest, StartTaskResponse},
    task::{CreateTask, Task, UpdateTask},
};
use deployment::Deployment;
use serde::Deserialize;
use services::services::{
    container::ContainerService,
    task_concurrency::TaskConcurrency,
    workspace::{self as ws_service, WorkspaceCreateParams},
};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub parent_workspace_id: Option<Uuid>,
}

pub async fn create_task(
    State(deployment): State<DeploymentImpl>,
    Json(body): Json<CreateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    let task = Task::create(&deployment.db().pool, body).await?;
    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn list_tasks(
    State(deployment): State<DeploymentImpl>,
    Query(ListQuery {
        parent_workspace_id,
    }): Query<ListQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<Task>>>, ApiError> {
    let tasks = match parent_workspace_id {
        Some(parent) => Task::find_by_parent_workspace_id(&deployment.db().pool, parent).await?,
        None => Task::find_all(&deployment.db().pool).await?,
    };
    Ok(ResponseJson(ApiResponse::success(tasks)))
}

pub async fn get_task(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    let task = Task::find_by_id(&deployment.db().pool, id)
        .await?
        .ok_or_else(|| ApiError::BadRequest(format!("task {id} not found")))?;
    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn update_task(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    Task::update(&deployment.db().pool, id, body).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn delete_task(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    match Task::delete(&deployment.db().pool, id).await {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(sqlx::Error::RowNotFound) => Err(ApiError::BadRequest(format!("task {id} not found"))),
        Err(e) => Err(e.into()),
    }
}

/// Atomically seed a Task + Workspace (+ optional parent concurrency check),
/// then attach requested repos and start execution post-commit.
///
/// D6: Task and Workspace rows are created inside a single sqlx transaction;
/// if either insert fails, neither row is persisted.
/// D7: Parent concurrency is enforced pre-tx via `TaskConcurrency::check_room`;
/// the limit is soft (see `check_room` docs for the TOCTOU note).
async fn start_task(
    State(deployment): State<DeploymentImpl>,
    Json(body): Json<StartTaskRequest>,
) -> Result<ResponseJson<ApiResponse<StartTaskResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // D7 pre-tx concurrency gate (only applies when a parent is named).
    if let Some(parent) = body.task.parent_workspace_id
        && !TaskConcurrency::check_room(pool, parent).await?
    {
        return Err(ApiError::TooManyRequestsWithKind {
            message: format!("Parent workspace {parent} has reached its child concurrency limit"),
            kind: "parent_concurrency_exceeded".into(),
        });
    }

    // Derive the git branch name the same way bare workspace creation does,
    // so worktree layouts stay consistent. The hint UUID is threaded into
    // `create_in_tx` (via `WorkspaceCreateParams.id`) so the persisted row's
    // id matches the short-uuid baked into `git_branch_name`.
    let workspace_id_hint = Uuid::new_v4();
    let branch_label = body
        .workspace
        .name
        .as_deref()
        .filter(|n| !n.is_empty())
        .unwrap_or("workspace");
    let git_branch_name = deployment
        .container()
        .git_branch_from_workspace(&workspace_id_hint, branch_label)
        .await;

    // D6 atomic tx: create task + bare workspace (no repo rows — those
    // require git setup and are attached post-commit via workspace_manager).
    let mut tx = pool.begin().await?;
    let task = Task::create_in_tx(
        &mut tx,
        CreateTask {
            project_id: body.task.project_id,
            title: body.task.title,
            description: body.task.description,
            parent_workspace_id: body.task.parent_workspace_id,
        },
    )
    .await?;
    let workspace = ws_service::create_in_tx(
        &mut tx,
        WorkspaceCreateParams {
            id: Some(workspace_id_hint),
            name: body.workspace.name.filter(|n| !n.is_empty()),
            task_id: Some(task.id),
            branch: git_branch_name,
            repo_ids: vec![],
        },
    )
    .await
    .map_err(|e| match e {
        ws_service::WorkspaceServiceError::Workspace(w) => ApiError::Workspace(w),
        ws_service::WorkspaceServiceError::Db(d) => ApiError::Database(d),
        ws_service::WorkspaceServiceError::RepoNotFound(id) => {
            ApiError::BadRequest(format!("repo {id} not found"))
        }
    })?;
    tx.commit().await?;

    // Post-commit: attach repos via workspace_manager (git checks + worktree setup).
    let mut managed = deployment
        .workspace_manager()
        .load_managed_workspace(workspace.clone())
        .await?;
    for repo_ref in &body.workspace.repos {
        managed
            .add_repository(repo_ref, deployment.git())
            .await
            .map_err(ApiError::from)?;
    }

    // Post-commit: kick off execution.
    let (result, failure_ctx) = deployment
        .container()
        .start_workspace_with_context(
            &workspace,
            body.workspace.executor_config.clone(),
            body.workspace.prompt,
        )
        .await;
    let execution_process =
        result.map_err(|e| crate::error::map_container_err_with_context(e, failure_ctx))?;

    deployment
        .track_if_analytics_allowed(
            "task_started",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "workspace_id": workspace.id.to_string(),
                "executor": &body.workspace.executor_config.executor,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(StartTaskResponse {
        task_id: task.id,
        workspace_id: workspace.id,
        execution_id: execution_process.id,
    })))
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/tasks", get(list_tasks).post(create_task))
        .route("/tasks/start", post(start_task))
        .route(
            "/tasks/{id}",
            get(get_task).put(update_task).delete(delete_task),
        )
}
