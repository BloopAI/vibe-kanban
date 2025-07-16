use crate::app_state::AppState;
use crate::models::api_response::ApiResponse;
use crate::models::task_template::{CreateTaskTemplate, TaskTemplate, UpdateTaskTemplate};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use uuid::Uuid;

pub async fn list_templates(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<()>>)> {
    match TaskTemplate::find_all(&state.db_pool).await {
        Ok(templates) => Ok(Json(ApiResponse::success(templates))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(&format!(
                "Failed to fetch templates: {}",
                e
            ))),
        )),
    }
}

pub async fn list_project_templates(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<()>>)> {
    match TaskTemplate::find_by_project_id(&state.db_pool, Some(project_id)).await {
        Ok(templates) => Ok(Json(ApiResponse::success(templates))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(&format!(
                "Failed to fetch templates: {}",
                e
            ))),
        )),
    }
}

pub async fn list_global_templates(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<()>>)> {
    match TaskTemplate::find_by_project_id(&state.db_pool, None).await {
        Ok(templates) => Ok(Json(ApiResponse::success(templates))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(&format!(
                "Failed to fetch global templates: {}",
                e
            ))),
        )),
    }
}

pub async fn get_template(
    State(state): State<AppState>,
    Path(template_id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<()>>)> {
    match TaskTemplate::find_by_id(&state.db_pool, template_id).await {
        Ok(Some(template)) => Ok(Json(ApiResponse::success(template))),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error("Template not found")),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(&format!(
                "Failed to fetch template: {}",
                e
            ))),
        )),
    }
}

pub async fn create_template(
    State(state): State<AppState>,
    Json(payload): Json<CreateTaskTemplate>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<()>>)> {
    match TaskTemplate::create(&state.db_pool, &payload).await {
        Ok(template) => Ok((StatusCode::CREATED, Json(ApiResponse::success(template)))),
        Err(e) => {
            if e.to_string().contains("UNIQUE constraint failed") {
                Err((
                    StatusCode::CONFLICT,
                    Json(ApiResponse::error(
                        "A template with this name already exists in this scope",
                    )),
                ))
            } else {
                Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::error(&format!(
                        "Failed to create template: {}",
                        e
                    ))),
                ))
            }
        }
    }
}

pub async fn update_template(
    State(state): State<AppState>,
    Path(template_id): Path<Uuid>,
    Json(payload): Json<UpdateTaskTemplate>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<()>>)> {
    match TaskTemplate::update(&state.db_pool, template_id, &payload).await {
        Ok(template) => Ok(Json(ApiResponse::success(template))),
        Err(e) => {
            if matches!(e, sqlx::Error::RowNotFound) {
                Err((
                    StatusCode::NOT_FOUND,
                    Json(ApiResponse::error("Template not found")),
                ))
            } else if e.to_string().contains("UNIQUE constraint failed") {
                Err((
                    StatusCode::CONFLICT,
                    Json(ApiResponse::error(
                        "A template with this name already exists in this scope",
                    )),
                ))
            } else {
                Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::error(&format!(
                        "Failed to update template: {}",
                        e
                    ))),
                ))
            }
        }
    }
}

pub async fn delete_template(
    State(state): State<AppState>,
    Path(template_id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<()>>)> {
    match TaskTemplate::delete(&state.db_pool, template_id).await {
        Ok(0) => Err((
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error("Template not found")),
        )),
        Ok(_) => Ok(Json(ApiResponse::success(()))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(&format!(
                "Failed to delete template: {}",
                e
            ))),
        )),
    }
}

pub fn templates_router() -> Router<AppState> {
    Router::new()
        .route("/templates", get(list_templates).post(create_template))
        .route("/templates/global", get(list_global_templates))
        .route(
            "/templates/:id",
            get(get_template).put(update_template).delete(delete_template),
        )
        .route("/projects/:project_id/templates", get(list_project_templates))
}