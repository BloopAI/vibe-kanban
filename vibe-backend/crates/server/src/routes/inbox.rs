use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::inbox::{CreateInboxItem, InboxItem, InboxSummary};
use deployment::Deployment;
use serde::Deserialize;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, middleware::load_inbox_item_middleware};

#[derive(Debug, Deserialize)]
pub struct InboxQueryParams {
    pub limit: Option<i64>,
}

/// Get all inbox items
pub async fn get_inbox_items(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<InboxQueryParams>,
) -> Result<ResponseJson<ApiResponse<Vec<InboxItem>>>, ApiError> {
    let items = InboxItem::find_all(&deployment.db().pool, params.limit).await?;
    Ok(ResponseJson(ApiResponse::success(items)))
}

/// Get unread inbox items
pub async fn get_unread_inbox_items(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<InboxQueryParams>,
) -> Result<ResponseJson<ApiResponse<Vec<InboxItem>>>, ApiError> {
    let items = InboxItem::find_unread(&deployment.db().pool, params.limit).await?;
    Ok(ResponseJson(ApiResponse::success(items)))
}

/// Get inbox summary (counts)
pub async fn get_inbox_summary(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<InboxSummary>>, ApiError> {
    let summary = InboxItem::get_summary(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(summary)))
}

/// Get a single inbox item by ID
pub async fn get_inbox_item(
    Extension(item): Extension<InboxItem>,
) -> Result<ResponseJson<ApiResponse<InboxItem>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(item)))
}

/// Create a new inbox item
pub async fn create_inbox_item(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateInboxItem>,
) -> Result<ResponseJson<ApiResponse<InboxItem>>, ApiError> {
    let item = InboxItem::create(&deployment.db().pool, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(item)))
}

/// Mark an inbox item as read
pub async fn mark_as_read(
    Extension(item): Extension<InboxItem>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<InboxItem>>, ApiError> {
    let updated = InboxItem::mark_as_read(&deployment.db().pool, item.id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;
    Ok(ResponseJson(ApiResponse::success(updated)))
}

/// Mark all inbox items as read
pub async fn mark_all_as_read(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<u64>>, ApiError> {
    let count = InboxItem::mark_all_as_read(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(count)))
}

/// Delete an inbox item
pub async fn delete_inbox_item(
    Extension(item): Extension<InboxItem>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = InboxItem::delete(&deployment.db().pool, item.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let item_router = Router::new()
        .route("/", get(get_inbox_item).delete(delete_inbox_item))
        .route("/read", post(mark_as_read))
        .layer(from_fn_with_state(deployment.clone(), load_inbox_item_middleware));

    let inner = Router::new()
        .route("/", get(get_inbox_items).post(create_inbox_item))
        .route("/unread", get(get_unread_inbox_items))
        .route("/summary", get(get_inbox_summary))
        .route("/read-all", post(mark_all_as_read))
        .nest("/{inbox_item_id}", item_router);

    Router::new().nest("/inbox", inner)
}
