use axum::{
    Json, Router,
    http::{Request, header::HeaderName},
    middleware,
    routing::get,
};
use serde::Serialize;
use tower_http::{
    cors::CorsLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    services::{ServeDir, ServeFile},
    trace::{DefaultOnFailure, DefaultOnResponse, TraceLayer},
};
use tracing::{Level, field};

use crate::{AppState, auth::require_session};

pub mod activity;
mod error;
mod identity;
mod nodes;
mod oauth;
pub(crate) mod organization_members;
mod organizations;
mod projects;
mod relay;
pub mod tasks;
mod tokens;

pub fn router(state: AppState) -> Router {
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(|request: &Request<_>| {
            let request_id = request
                .extensions()
                .get::<RequestId>()
                .and_then(|id| id.header_value().to_str().ok());
            let span = tracing::info_span!(
                "http_request",
                method = %request.method(),
                uri = %request.uri(),
                request_id = field::Empty
            );
            if let Some(request_id) = request_id {
                span.record("request_id", field::display(request_id));
            }
            span
        })
        .on_response(DefaultOnResponse::new().level(Level::INFO))
        .on_failure(DefaultOnFailure::new().level(Level::ERROR));

    let v1_public = Router::<AppState>::new()
        .route("/health", get(health))
        .merge(oauth::public_router())
        .merge(organization_members::public_router())
        .merge(tokens::public_router())
        .merge(nodes::api_key_router())
        .merge(crate::nodes::ws::router())
        .merge(relay::router());

    let v1_protected = Router::<AppState>::new()
        .merge(identity::router())
        .merge(activity::router())
        .merge(projects::router())
        .merge(tasks::router())
        .merge(organizations::router())
        .merge(organization_members::protected_router())
        .merge(oauth::protected_router())
        .merge(nodes::protected_router())
        .merge(crate::ws::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_session,
        ));

    let static_dir = "/srv/static";
    let spa =
        ServeDir::new(static_dir).fallback(ServeFile::new(format!("{static_dir}/index.html")));

    Router::<AppState>::new()
        .nest("/v1", v1_public)
        .nest("/v1", v1_protected)
        .fallback_service(spa)
        .layer(CorsLayer::permissive())
        .layer(trace_layer)
        .layer(PropagateRequestIdLayer::new(HeaderName::from_static(
            "x-request-id",
        )))
        .layer(SetRequestIdLayer::new(
            HeaderName::from_static("x-request-id"),
            MakeRequestUuid {},
        ))
        .with_state(state)
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub git_commit: &'static str,
    pub git_branch: &'static str,
    pub build_timestamp: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        git_commit: option_env!("VK_GIT_COMMIT").unwrap_or("unknown"),
        git_branch: option_env!("VK_GIT_BRANCH").unwrap_or("unknown"),
        build_timestamp: option_env!("VK_BUILD_TIMESTAMP").unwrap_or("unknown"),
    })
}
