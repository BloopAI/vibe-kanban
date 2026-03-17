use axum::{
    Router,
    http::StatusCode,
    response::{IntoResponse, Json as ResponseJson},
    routing::{IntoMakeService, get},
};
use tower_http::validate_request::ValidateRequestHeaderLayer;

use crate::{DeploymentImpl, middleware};

pub mod approvals;
pub mod config;
pub mod containers;
pub mod filesystem;
// pub mod github;
pub mod events;
pub mod execution_processes;
pub mod frontend;
pub mod health;
pub mod images;
pub mod migration;
pub mod oauth;
pub mod organizations;
pub mod relay_auth;
pub mod relay_ws;
pub mod releases;
pub mod remote;
pub mod repo;
pub mod scratch;
pub mod search;
pub mod sessions;
pub mod tags;
pub mod terminal;
pub mod workspaces;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    let relay_signed_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(containers::router(&deployment))
        .merge(workspaces::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(tags::router(&deployment))
        .merge(oauth::router())
        .merge(organizations::router())
        .merge(filesystem::router())
        .merge(repo::router())
        .merge(events::router(&deployment))
        .merge(approvals::router())
        .merge(scratch::router(&deployment))
        .merge(search::router(&deployment))
        .merge(releases::router())
        .merge(migration::router())
        .merge(sessions::router(&deployment))
        .merge(terminal::router())
        .nest("/remote", remote::router())
        .nest("/images", images::routes())
        .layer(axum::middleware::from_fn_with_state(
            deployment.clone(),
            middleware::sign_relay_response,
        ))
        .layer(axum::middleware::from_fn_with_state(
            deployment.clone(),
            middleware::require_relay_request_signature,
        ))
        .with_state(deployment.clone());

    let api_routes = Router::new()
        .merge(relay_auth::router())
        .merge(relay_signed_routes)
        .fallback(api_fallback)
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .with_state(deployment);

    Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .nest("/api", api_routes)
        .fallback(get(frontend::serve_frontend))
        .into_make_service()
}

/// Catch-all handler for unmatched API routes. Without this fallback,
/// non-GET requests (POST, PUT, DELETE) that don't match any API route
/// fall through to the frontend's GET-only `/{*path}` wildcard, which
/// returns 405 Method Not Allowed instead of the expected 404.
async fn api_fallback() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        ResponseJson(serde_json::json!({ "error": "Not found" })),
    )
}
