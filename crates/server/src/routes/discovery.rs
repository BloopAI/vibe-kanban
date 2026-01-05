use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    discovery_item::{CreateDiscoveryItem, DiscoveryItem, UpdateDiscoveryItem},
    feedback_entry::{CreateFeedbackEntry, FeedbackEntry},
};
use deployment::Deployment;
use services::services::discovery::DiscoveryService;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_discovery_item_middleware};

// ==================== Discovery Items ====================

/// GET /api/discovery/project/{project_id}
/// Get all discovery items for a project
pub async fn get_project_discovery_items(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<DiscoveryItem>>>, ApiError> {
    let service = DiscoveryService::new();
    let items = service
        .get_project_discovery_items(&deployment.db().pool, project_id)
        .await?;

    Ok(ResponseJson(ApiResponse::success(items)))
}

/// POST /api/discovery
/// Create a new discovery item
pub async fn create_discovery_item(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateDiscoveryItem>,
) -> Result<ResponseJson<ApiResponse<DiscoveryItem>>, ApiError> {
    let service = DiscoveryService::new();
    let item = service
        .create_discovery_item(&deployment.db().pool, payload)
        .await?;

    deployment
        .track_if_analytics_allowed(
            "discovery_item_created",
            serde_json::json!({
                "discovery_item_id": item.id.to_string(),
                "item_type": item.item_type.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(item)))
}

/// GET /api/discovery/{discovery_item_id}
/// Get a discovery item by ID
pub async fn get_discovery_item(
    Extension(item): Extension<DiscoveryItem>,
) -> Result<ResponseJson<ApiResponse<DiscoveryItem>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(item)))
}

/// PUT /api/discovery/{discovery_item_id}
/// Update a discovery item
pub async fn update_discovery_item(
    Extension(item): Extension<DiscoveryItem>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateDiscoveryItem>,
) -> Result<ResponseJson<ApiResponse<DiscoveryItem>>, ApiError> {
    let service = DiscoveryService::new();
    let updated_item = service
        .update_discovery_item(&deployment.db().pool, item.id, payload)
        .await?;

    deployment
        .track_if_analytics_allowed(
            "discovery_item_updated",
            serde_json::json!({
                "discovery_item_id": updated_item.id.to_string(),
                "status": updated_item.status.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_item)))
}

/// DELETE /api/discovery/{discovery_item_id}
/// Delete a discovery item
pub async fn delete_discovery_item(
    Extension(item): Extension<DiscoveryItem>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let service = DiscoveryService::new();
    let rows_affected = service
        .delete_discovery_item(&deployment.db().pool, item.id)
        .await?;

    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

// ==================== Promotion ====================

/// POST /api/discovery/{discovery_item_id}/promote
/// Promote a discovery item to a task
pub async fn promote_to_task(
    Extension(item): Extension<DiscoveryItem>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<PromoteResponse>>, ApiError> {
    let service = DiscoveryService::new();
    let (task, updated_item) = service
        .promote_to_task(&deployment.db().pool, item.id)
        .await?;

    deployment
        .track_if_analytics_allowed(
            "discovery_item_promoted",
            serde_json::json!({
                "discovery_item_id": updated_item.id.to_string(),
                "task_id": task.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(PromoteResponse {
        task,
        discovery_item: updated_item,
    })))
}

#[derive(serde::Serialize)]
pub struct PromoteResponse {
    pub task: db::models::task::Task,
    pub discovery_item: DiscoveryItem,
}

// ==================== Feedback ====================

/// GET /api/discovery/{discovery_item_id}/feedback
/// Get feedback entries for a discovery item
pub async fn get_discovery_item_feedback(
    Extension(item): Extension<DiscoveryItem>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<FeedbackEntry>>>, ApiError> {
    let service = DiscoveryService::new();
    let entries = service
        .get_discovery_item_feedback(&deployment.db().pool, item.id)
        .await?;

    Ok(ResponseJson(ApiResponse::success(entries)))
}

/// GET /api/tasks/{task_id}/feedback
/// Get feedback entries for a task (including from linked discovery item)
pub async fn get_task_feedback(
    State(deployment): State<DeploymentImpl>,
    Path(task_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<FeedbackEntry>>>, ApiError> {
    let service = DiscoveryService::new();
    let entries = service
        .get_task_feedback(&deployment.db().pool, task_id)
        .await?;

    Ok(ResponseJson(ApiResponse::success(entries)))
}

/// POST /api/feedback
/// Create a feedback entry
pub async fn create_feedback(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFeedbackEntry>,
) -> Result<ResponseJson<ApiResponse<FeedbackEntry>>, ApiError> {
    let service = DiscoveryService::new();
    let entry = service
        .create_feedback(&deployment.db().pool, payload)
        .await?;

    Ok(ResponseJson(ApiResponse::success(entry)))
}

/// DELETE /api/feedback/{feedback_id}
/// Delete a feedback entry
pub async fn delete_feedback(
    State(deployment): State<DeploymentImpl>,
    Path(feedback_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let service = DiscoveryService::new();
    let rows_affected = service
        .delete_feedback(&deployment.db().pool, feedback_id)
        .await?;

    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

// ==================== Task Discovery Link ====================

/// GET /api/tasks/{task_id}/discovery
/// Get the discovery item linked to a task
pub async fn get_task_discovery_item(
    State(deployment): State<DeploymentImpl>,
    Path(task_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Option<DiscoveryItem>>>, ApiError> {
    let service = DiscoveryService::new();
    let item = service
        .get_discovery_item_for_task(&deployment.db().pool, task_id)
        .await?;

    Ok(ResponseJson(ApiResponse::success(item)))
}

// ==================== Router ====================

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    // Routes that operate on a specific discovery item
    let item_router = Router::new()
        .route("/", get(get_discovery_item).put(update_discovery_item).delete(delete_discovery_item))
        .route("/promote", post(promote_to_task))
        .route("/feedback", get(get_discovery_item_feedback))
        .layer(from_fn_with_state(deployment.clone(), load_discovery_item_middleware));

    // Main discovery routes
    let discovery_routes = Router::new()
        .route("/", post(create_discovery_item))
        .route("/project/{project_id}", get(get_project_discovery_items))
        .nest("/{discovery_item_id}", item_router);

    // Feedback routes
    let feedback_routes = Router::new()
        .route("/", post(create_feedback))
        .route("/{feedback_id}", axum::routing::delete(delete_feedback));

    // Task-related discovery routes (to be merged with tasks router)
    let task_discovery_routes = Router::new()
        .route("/{task_id}/discovery", get(get_task_discovery_item))
        .route("/{task_id}/feedback", get(get_task_feedback));

    Router::new()
        .nest("/discovery", discovery_routes)
        .nest("/feedback", feedback_routes)
        .nest("/tasks", task_discovery_routes)
}
