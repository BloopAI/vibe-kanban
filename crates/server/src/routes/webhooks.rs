use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::get,
};
use db::models::webhook::{CreateWebhook, Webhook};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize, TS)]
pub struct CreateWebhookRequest {
    pub url: String,
    pub secret: Option<String>,
    pub description: Option<String>,
}

pub async fn list_webhooks(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Webhook>>>, ApiError> {
    let pool = &deployment.db().pool;
    let hooks = Webhook::find_all(pool).await?;
    Ok(ResponseJson(ApiResponse::success(hooks)))
}

pub async fn create_webhook(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateWebhookRequest>,
) -> Result<ResponseJson<ApiResponse<Webhook>>, ApiError> {
    let pool = &deployment.db().pool;
    let hook = Webhook::create(
        pool,
        &CreateWebhook {
            url: payload.url,
            secret: payload.secret,
            description: payload.description,
        },
    )
    .await?;
    Ok(ResponseJson(ApiResponse::success(hook)))
}

pub async fn delete_webhook(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let pool = &deployment.db().pool;
    Webhook::delete(pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let _ = deployment;
    Router::new()
        .route("/", get(list_webhooks).post(create_webhook))
        .route("/{id}", axum::routing::delete(delete_webhook))
}
