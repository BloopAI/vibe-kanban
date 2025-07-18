use axum::response::Json;

use crate::models::ApiResponse;

pub async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success("OK".to_string()))
}
