use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::get,
};
use db::models::external_session::{
    CreateExternalSession, ExternalSession, ExternalSessionError,
};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize, TS)]
pub struct CreateExternalSessionRequest {
    pub name: Option<String>,
    pub runtime: Option<String>,
    pub project_path: Option<String>,
    pub branch: Option<String>,
    pub pid: Option<i64>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateExternalSessionRequest {
    pub status: String,
}

pub async fn list_external_sessions(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ExternalSession>>>, ApiError> {
    let pool = &deployment.db().pool;
    let sessions = ExternalSession::find_all(pool).await?;
    Ok(ResponseJson(ApiResponse::success(sessions)))
}

pub async fn create_external_session(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateExternalSessionRequest>,
) -> Result<ResponseJson<ApiResponse<ExternalSession>>, ApiError> {
    let pool = &deployment.db().pool;
    let session = ExternalSession::create(
        pool,
        &CreateExternalSession {
            name: payload.name,
            runtime: payload.runtime,
            project_path: payload.project_path,
            branch: payload.branch,
            pid: payload.pid,
        },
    )
    .await?;
    Ok(ResponseJson(ApiResponse::success(session)))
}

pub async fn get_external_session(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<ExternalSession>>, ApiError> {
    let pool = &deployment.db().pool;
    let session = ExternalSession::find_by_id(pool, id)
        .await?
        .ok_or(ApiError::ExternalSession(ExternalSessionError::NotFound))?;
    Ok(ResponseJson(ApiResponse::success(session)))
}

pub async fn update_external_session(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateExternalSessionRequest>,
) -> Result<ResponseJson<ApiResponse<ExternalSession>>, ApiError> {
    let pool = &deployment.db().pool;
    let session = ExternalSession::update_status(pool, id, &payload.status).await?;
    Ok(ResponseJson(ApiResponse::success(session)))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let _ = deployment; // unused but matches convention
    Router::new()
        .route("/", get(list_external_sessions).post(create_external_session))
        .route("/{id}", get(get_external_session).patch(update_external_session))
}
