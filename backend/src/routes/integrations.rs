use crate::app_state::AppState;
use crate::models::{ApiResponse, CreateIntegrationRequest, UpdateIntegrationRequest};
use crate::services::IntegrationService;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, post, put},
    Json, Router,
};
use uuid::Uuid;

pub fn integrations_router() -> Router<AppState> {
    Router::new()
        .route("/integrations", get(list_integrations))
        .route("/integrations", post(create_integration))
        .route("/integrations/:id", get(get_integration))
        .route("/integrations/:id", put(update_integration))
        .route("/integrations/:id", delete(delete_integration))
        .route("/integrations/:id/test", post(test_integration))
        .route("/integrations/:id/sync", post(sync_integration))
        .route("/integrations/:id/events", get(get_integration_events))
        .route("/integrations/categories", get(get_categories))
}

async fn list_integrations(
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Vec<crate::models::IntegrationWithCategory>>>, StatusCode> {
    let service = IntegrationService::new(state.db_pool.clone());
    
    match service.list_integrations().await {
        Ok(integrations) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(integrations),
            message: Some("Integrations retrieved successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to list integrations: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_integration(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<crate::models::IntegrationWithCategory>>, StatusCode> {
    let service = IntegrationService::new(state.db_pool.clone());
    
    match service.get_integration(id).await {
        Ok(Some(integration)) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(integration),
            message: Some("Integration retrieved successfully".to_string()),
        })),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to get integration {}: {}", id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn create_integration(
    State(state): State<AppState>,
    Json(request): Json<CreateIntegrationRequest>,
) -> Result<ResponseJson<ApiResponse<crate::models::Integration>>, StatusCode> {
    let service = IntegrationService::new(state.db_pool.clone());
    
    match service.create_integration(request).await {
        Ok(integration) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(integration),
            message: Some("Integration created successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to create integration: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn update_integration(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateIntegrationRequest>,
) -> Result<ResponseJson<ApiResponse<crate::models::Integration>>, StatusCode> {
    let service = IntegrationService::new(state.db_pool.clone());
    
    match service.update_integration(id, request).await {
        Ok(Some(integration)) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(integration),
            message: Some("Integration updated successfully".to_string()),
        })),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to update integration {}: {}", id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn delete_integration(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    let service = IntegrationService::new(state.db_pool.clone());
    
    match service.delete_integration(id).await {
        Ok(true) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: None,
            message: Some("Integration deleted successfully".to_string()),
        })),
        Ok(false) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to delete integration {}: {}", id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn test_integration(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<crate::models::IntegrationTestResult>>, StatusCode> {
    let service = IntegrationService::new(state.db_pool.clone());
    
    match service.test_integration(id).await {
        Ok(test_result) => Ok(ResponseJson(ApiResponse {
            success: test_result.success,
            data: Some(test_result),
            message: Some("Integration test completed".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to test integration {}: {}", id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn sync_integration(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    let service = IntegrationService::new(state.db_pool.clone());
    
    match service.sync_integration(id).await {
        Ok(true) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: None,
            message: Some("Integration synced successfully".to_string()),
        })),
        Ok(false) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to sync integration {}: {}", id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_integration_events(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<crate::models::IntegrationEvent>>>, StatusCode> {
    let service = IntegrationService::new(state.db_pool.clone());
    
    match service.get_integration_events(id, Some(50)).await {
        Ok(events) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(events),
            message: Some("Integration events retrieved successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to get integration events for {}: {}", id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_categories(
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Vec<crate::models::IntegrationCategory>>>, StatusCode> {
    let service = IntegrationService::new(state.db_pool.clone());
    
    match service.get_categories().await {
        Ok(categories) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(categories),
            message: Some("Categories retrieved successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to get categories: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}