//! Forge Router
//!
//! This module handles API routing for forge services and dual frontend routing.
//! Serves forge UI at `/` and upstream UI at `/legacy`

use axum::{
    extract::{Path, State},
    http::{header, HeaderValue, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rust_embed::RustEmbed;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::services::ForgeServices;
use forge_branch_templates::BranchNameResponse;
use forge_config::ForgeProjectSettings;

#[derive(RustEmbed)]
#[folder = "../frontend/dist"]
struct ForgeFrontend;

// For now, we'll create a simple placeholder for the upstream frontend
// In the future, this will embed the upstream frontend dist
#[derive(RustEmbed)]
#[folder = "../frontend/dist"] // Using same frontend for now
struct UpstreamFrontend;

pub fn create_router(services: ForgeServices) -> Router {
    Router::new()
        .route("/health", get(health_check))
        // Forge API routes
        .route(
            "/api/forge/config",
            get(get_forge_config).put(update_forge_config),
        )
        .route(
            "/api/forge/projects/:project_id/settings",
            get(get_project_settings).put(update_project_settings),
        )
        .route("/api/forge/omni/instances", get(list_omni_instances))
        .route(
            "/api/forge/branch-templates/:task_id",
            get(get_branch_template).put(set_branch_template),
        )
        .route(
            "/api/forge/branch-templates/:task_id/generate",
            post(generate_branch_name),
        )
        // Dual frontend routing
        .nest("/legacy", legacy_frontend_router())
        .fallback(forge_frontend_handler)
        .with_state(services)
}

fn legacy_frontend_router() -> Router<ForgeServices> {
    Router::new()
        .route("/", get(serve_legacy_index))
        .route("/*path", get(serve_legacy_assets))
}

async fn forge_frontend_handler(uri: axum::http::Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    if path.is_empty() {
        serve_forge_index().await
    } else {
        serve_forge_assets(Path(path.to_string())).await
    }
}

async fn serve_forge_index() -> Response {
    match ForgeFrontend::get("index.html") {
        Some(content) => Html(content.data.to_vec()).into_response(),
        None => (StatusCode::NOT_FOUND, "404 Not Found").into_response(),
    }
}

async fn serve_forge_assets(Path(path): Path<String>) -> Response {
    serve_static_file::<ForgeFrontend>(&path).await
}

async fn serve_legacy_index() -> Response {
    match UpstreamFrontend::get("index.html") {
        Some(content) => Html(content.data.to_vec()).into_response(),
        None => (StatusCode::NOT_FOUND, "404 Not Found").into_response(),
    }
}

async fn serve_legacy_assets(Path(path): Path<String>) -> Response {
    serve_static_file::<UpstreamFrontend>(&path).await
}

async fn serve_static_file<T: RustEmbed>(path: &str) -> Response {
    match T::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();

            let mut response = Response::new(content.data.into());
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_str(mime.as_ref()).unwrap(),
            );
            response
        }
        None => {
            // Fallback to index.html for SPA routing
            if let Some(index) = T::get("index.html") {
                Html(index.data.to_vec()).into_response()
            } else {
                (StatusCode::NOT_FOUND, "404 Not Found").into_response()
            }
        }
    }
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "forge-app",
        "message": "Forge application ready - backend extensions extracted successfully"
    }))
}

async fn get_forge_config(
    State(services): State<ForgeServices>,
) -> Result<Json<ForgeProjectSettings>, StatusCode> {
    services
        .config
        .get_global_settings()
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("Failed to load forge config: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

async fn update_forge_config(
    State(services): State<ForgeServices>,
    Json(settings): Json<ForgeProjectSettings>,
) -> Result<Json<ForgeProjectSettings>, StatusCode> {
    services
        .config
        .set_global_settings(&settings)
        .await
        .map_err(|e| {
            tracing::error!("Failed to persist forge config: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    services.apply_global_omni_config().await.map_err(|e| {
        tracing::error!("Failed to refresh Omni config: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(settings))
}

async fn get_project_settings(
    Path(project_id): Path<Uuid>,
    State(services): State<ForgeServices>,
) -> Result<Json<ForgeProjectSettings>, StatusCode> {
    services
        .config
        .get_forge_settings(project_id)
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("Failed to load project settings {}: {}", project_id, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

async fn update_project_settings(
    Path(project_id): Path<Uuid>,
    State(services): State<ForgeServices>,
    Json(settings): Json<ForgeProjectSettings>,
) -> Result<Json<ForgeProjectSettings>, StatusCode> {
    services
        .config
        .set_forge_settings(project_id, &settings)
        .await
        .map_err(|e| {
            tracing::error!("Failed to persist project settings {}: {}", project_id, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(settings))
}

async fn list_omni_instances(
    State(services): State<ForgeServices>,
) -> Result<Json<Value>, StatusCode> {
    let omni = services.omni.read().await;
    match omni.list_instances().await {
        Ok(instances) => Ok(Json(json!({ "instances": instances }))),
        Err(e) => {
            tracing::error!("Failed to list Omni instances: {}", e);
            Ok(Json(json!({
                "instances": [],
                "error": "Failed to connect to Omni service"
            })))
        }
    }
}

async fn get_branch_template(
    Path(task_id): Path<Uuid>,
    State(services): State<ForgeServices>,
) -> Result<Json<Value>, StatusCode> {
    match services.branch_templates.get_template(task_id).await {
        Ok(template) => Ok(Json(json!({
            "task_id": task_id,
            "branch_template": template
        }))),
        Err(e) => {
            tracing::error!("Failed to get branch template: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn set_branch_template(
    Path(task_id): Path<Uuid>,
    State(services): State<ForgeServices>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let template = payload
        .get("branch_template")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    match services
        .branch_templates
        .set_template(task_id, template.clone())
        .await
    {
        Ok(()) => Ok(Json(json!({
            "task_id": task_id,
            "branch_template": template,
            "success": true
        }))),
        Err(e) => {
            tracing::error!("Failed to set branch template: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[derive(Deserialize)]
struct BranchNameRequest {
    attempt_id: Option<Uuid>,
}

async fn generate_branch_name(
    Path(task_id): Path<Uuid>,
    State(services): State<ForgeServices>,
    Json(payload): Json<BranchNameRequest>,
) -> Result<Json<BranchNameResponse>, StatusCode> {
    let attempt_id = payload.attempt_id.unwrap_or_else(Uuid::new_v4);

    let branch_name = services
        .branch_templates
        .generate_branch_name(task_id, attempt_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to generate branch name: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(BranchNameResponse {
        attempt_id,
        branch_name,
    }))
}
