use std::path::PathBuf;

use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::pending_commit::PendingCommit;
use deployment::Deployment;
use serde::Deserialize;
use services::services::git::GitCli;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// request para ejecutar un pending commit con título personalizado
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CommitPendingRequest {
    pub title: String,
}

/// obtener todos los pending commits
pub async fn get_pending_commits(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<PendingCommit>>>, ApiError> {
    let pending_commits = PendingCommit::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(pending_commits)))
}

/// obtener el conteo de pending commits
pub async fn get_pending_commits_count(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<i64>>, ApiError> {
    let count = PendingCommit::count(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(count)))
}

/// ejecutar un pending commit con el título proporcionado por el usuario
pub async fn commit_pending(
    State(deployment): State<DeploymentImpl>,
    Path(pending_commit_id): Path<Uuid>,
    Json(payload): Json<CommitPendingRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // obtener el pending commit
    let pending_commit = PendingCommit::find_by_id(&deployment.db().pool, pending_commit_id)
        .await?
        .ok_or(ApiError::BadRequest("Pending commit not found".to_string()))?;

    // obtener el workspace para acceder al container_ref
    let workspace =
        db::models::workspace::Workspace::find_by_id(&deployment.db().pool, pending_commit.workspace_id)
            .await?
            .ok_or(ApiError::BadRequest("Workspace not found".to_string()))?;

    let container_ref = workspace
        .container_ref
        .as_ref()
        .ok_or(ApiError::BadRequest("Workspace has no container reference".to_string()))?;

    let workspace_root = PathBuf::from(container_ref);
    let worktree_path = workspace_root.join(&pending_commit.repo_path);

    // ejecutar el commit con el título del usuario
    let git = GitCli::new();
    git.add_all(&worktree_path)
        .map_err(|e| ApiError::BadRequest(format!("git add failed: {e}")))?;
    git.commit(&worktree_path, &payload.title)
        .map_err(|e| ApiError::BadRequest(format!("git commit failed: {e}")))?;

    // eliminar el pending commit de la base de datos
    PendingCommit::delete(&deployment.db().pool, pending_commit_id).await?;

    tracing::info!(
        "Committed pending commit {} with title: {}",
        pending_commit_id,
        payload.title
    );

    Ok(ResponseJson(ApiResponse::success(())))
}

/// descartar un pending commit sin ejecutar
pub async fn discard_pending(
    State(deployment): State<DeploymentImpl>,
    Path(pending_commit_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = PendingCommit::delete(&deployment.db().pool, pending_commit_id).await?;
    if rows_affected == 0 {
        Err(ApiError::BadRequest("Pending commit not found".to_string()))
    } else {
        tracing::info!("Discarded pending commit {}", pending_commit_id);
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

/// descartar todos los pending commits
pub async fn discard_all_pending(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<u64>>, ApiError> {
    // obtener todos los pending commits para contar
    let pending_commits = PendingCommit::find_all(&deployment.db().pool).await?;
    let mut total_deleted = 0u64;

    for pending_commit in pending_commits {
        let deleted = PendingCommit::delete(&deployment.db().pool, pending_commit.id).await?;
        total_deleted += deleted;
    }

    tracing::info!("Discarded {} pending commits", total_deleted);
    Ok(ResponseJson(ApiResponse::success(total_deleted)))
}

pub fn router() -> Router<DeploymentImpl> {
    let inner = Router::new()
        .route("/", get(get_pending_commits).delete(discard_all_pending))
        .route("/count", get(get_pending_commits_count))
        .route(
            "/{pending_commit_id}",
            post(commit_pending).delete(discard_pending),
        );

    Router::new().nest("/pending-commits", inner)
}
