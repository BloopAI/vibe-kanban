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
    // validar el título del commit
    let title = payload.title.trim();
    if title.is_empty() {
        return Err(ApiError::BadRequest(
            "Commit title cannot be empty".to_string(),
        ));
    }
    if title.len() > 500 {
        return Err(ApiError::BadRequest(
            "Commit title too long (max 500 characters)".to_string(),
        ));
    }

    // obtener el pending commit
    let pending_commit = PendingCommit::find_by_id(&deployment.db().pool, pending_commit_id)
        .await?
        .ok_or(ApiError::BadRequest("Pending commit not found".to_string()))?;

    // obtener el workspace para acceder al container_ref
    let workspace = db::models::workspace::Workspace::find_by_id(
        &deployment.db().pool,
        pending_commit.workspace_id,
    )
    .await?
    .ok_or(ApiError::BadRequest("Workspace not found".to_string()))?;

    let container_ref = workspace
        .container_ref
        .as_ref()
        .ok_or(ApiError::BadRequest(
            "Workspace has no container reference".to_string(),
        ))?;

    let workspace_root = PathBuf::from(container_ref);
    let worktree_path = workspace_root.join(&pending_commit.repo_path);

    // ejecutar el commit con el título del usuario
    let git = GitCli::new();

    // intentar agregar cambios - si falla, limpiar el pending commit
    if let Err(e) = git.add_all(&worktree_path) {
        // limpiar el pending commit de la base de datos antes de retornar el error
        let _ = PendingCommit::delete(&deployment.db().pool, pending_commit_id).await;
        return Err(ApiError::BadRequest(format!(
            "git add failed (workspace may have been deleted): {e}"
        )));
    }

    // intentar hacer commit - si falla, limpiar el pending commit
    if let Err(e) = git.commit(&worktree_path, title) {
        // limpiar el pending commit de la base de datos antes de retornar el error
        let _ = PendingCommit::delete(&deployment.db().pool, pending_commit_id).await;
        return Err(ApiError::BadRequest(format!(
            "git commit failed (workspace may have been deleted): {e}"
        )));
    }

    // eliminar el pending commit de la base de datos solo si el commit fue exitoso
    PendingCommit::delete(&deployment.db().pool, pending_commit_id).await?;

    tracing::info!(
        "Committed pending commit {} with title: {}",
        pending_commit_id,
        title
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
    let total_deleted = PendingCommit::delete_all(&deployment.db().pool).await?;

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
