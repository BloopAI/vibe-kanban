use axum::{
    Json, Router,
    http::{Request, header::HeaderName},
    middleware,
    routing::get,
};
use serde::Serialize;
use tower_http::{
    cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    services::{ServeDir, ServeFile},
    trace::{DefaultOnFailure, TraceLayer},
};
use tracing::{Level, Span, field};

use crate::{AppState, auth::require_session};

#[cfg(feature = "vk-billing")]
mod billing;
#[cfg(not(feature = "vk-billing"))]
mod billing {
    use axum::Router;

    use crate::AppState;
    pub fn public_router() -> Router<AppState> {
        Router::new()
    }
    pub fn protected_router() -> Router<AppState> {
        Router::new()
    }
}
mod electric_proxy;
pub(crate) mod error;
pub mod attachments;
mod github_app;
mod identity;
pub mod issue_assignees;
pub mod issue_comment_reactions;
pub mod issue_comments;
pub mod issue_followers;
pub mod issue_relationships;
pub mod issue_tags;
pub mod issues;
mod migration;
pub mod notifications;
mod oauth;
pub(crate) mod organization_members;
mod organizations;
pub mod project_statuses;
pub mod projects;
mod pull_requests;
mod review;
pub mod tags;
mod tokens;
mod workspaces;

pub fn router(state: AppState) -> Router {
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(|request: &Request<_>| {
            let request_id = request
                .extensions()
                .get::<RequestId>()
                .and_then(|id| id.header_value().to_str().ok());
            let is_health = request.uri().path() == "/health";
            let span = if is_health {
                tracing::trace_span!(
                    "http_request",
                    method = %request.method(),
                    uri = %request.uri(),
                    request_id = field::Empty
                )
            } else {
                tracing::debug_span!(
                    "http_request",
                    method = %request.method(),
                    uri = %request.uri(),
                    request_id = field::Empty
                )
            };
            if let Some(request_id) = request_id {
                span.record("request_id", field::display(request_id));
            }
            span
        })
        .on_response(
            |response: &axum::http::Response<_>, latency: std::time::Duration, span: &Span| {
                if span.is_disabled() {
                    return;
                }
                let status = response.status().as_u16();
                let latency_ms = latency.as_millis();
                if status >= 500 {
                    tracing::error!(status, latency_ms, "server error");
                } else if status >= 400 {
                    tracing::warn!(status, latency_ms, "client error");
                } else {
                    tracing::debug!(status, latency_ms, "request completed");
                }
            },
        )
        .on_failure(DefaultOnFailure::new().level(Level::ERROR));

    let v1_public = Router::<AppState>::new()
        .route("/health", get(health))
        .merge(oauth::public_router())
        .merge(organization_members::public_router())
        .merge(tokens::public_router())
        .merge(review::public_router())
        .merge(github_app::public_router())
        .merge(billing::public_router());

    let v1_protected = Router::<AppState>::new()
        .merge(identity::router())
        .merge(projects::router())
        .merge(organizations::router())
        .merge(organization_members::protected_router())
        .merge(oauth::protected_router())
        .merge(electric_proxy::router())
        .merge(github_app::protected_router())
        .merge(project_statuses::router())
        .merge(tags::router())
        .merge(issue_comments::router())
        .merge(issue_comment_reactions::router())
        .merge(issues::router())
        .merge(issue_assignees::router())
        .merge(attachments::router())
        .merge(issue_followers::router())
        .merge(issue_tags::router())
        .merge(issue_relationships::router())
        .merge(pull_requests::router())
        .merge(notifications::router())
        .merge(workspaces::router())
        .merge(billing::protected_router())
        .merge(migration::router())
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
        .layer(middleware::from_fn(
            crate::middleware::version::add_version_headers,
        ))
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::mirror_request())
                .allow_methods(AllowMethods::mirror_request())
                .allow_headers(AllowHeaders::mirror_request())
                .allow_credentials(true),
        )
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
struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// Collect all mutation definitions for TypeScript generation.
pub fn all_mutation_definitions() -> Vec<crate::mutation_definition::MutationDefinition> {
    vec![
        projects::mutation().definition(),
        notifications::mutation().definition(),
        tags::mutation().definition(),
        project_statuses::mutation().definition(),
        issues::mutation().definition(),
        issue_assignees::mutation().definition(),
        issue_followers::mutation().definition(),
        issue_tags::mutation().definition(),
        issue_relationships::mutation().definition(),
        issue_comments::mutation().definition(),
        issue_comment_reactions::mutation().definition(),
    ]
}
