use axum::{
    Router,
    http::{Request, header::HeaderName},
    middleware,
    routing::get,
};
use tower_http::{
    cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    services::{ServeDir, ServeFile},
    trace::{DefaultOnFailure, DefaultOnResponse, TraceLayer},
};
use tracing::{Level, field};

use crate::{AppState, auth::require_session};

mod electric_proxy;
mod error;
mod github_app;
mod identity;
mod issue_assignees;
mod issue_comment_reactions;
mod issue_comments;
mod issue_followers;
mod issue_relationships;
mod issue_tags;
mod issues;
mod notifications;
mod oauth;
pub(crate) mod organization_members;
mod organizations;
mod project_statuses;
mod projects;
mod review;
mod tags;
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
        .merge(review::public_router())
        .merge(github_app::public_router());

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
        .merge(issue_followers::router())
        .merge(issue_tags::router())
        .merge(issue_relationships::router())
        .merge(notifications::router())
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

async fn health() -> &'static str {
    "ok"
}
