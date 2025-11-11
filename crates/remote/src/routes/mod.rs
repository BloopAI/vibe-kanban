use axum::{
    Router,
    http::{Request, header::HeaderName},
    middleware,
    routing::get,
};
use tower_http::{
    cors::CorsLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    trace::{DefaultOnFailure, DefaultOnResponse, TraceLayer},
};
use tracing::{Level, field};

use crate::{AppState, auth::require_session};

pub mod activity;
mod error;
mod identity;
mod oauth;
mod organization_members;
mod organizations;
pub mod tasks;

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

    let public_top = Router::<AppState>::new()
        .route("/health", get(health))
        .merge(oauth::public_router());

    let v1_public = Router::<AppState>::new().merge(organization_members::public_router());

    let v1_protected = Router::<AppState>::new()
        .merge(identity::router())
        .merge(activity::router())
        .merge(tasks::router())
        .merge(organizations::router())
        .merge(organization_members::protected_router())
        .merge(oauth::protected_router())
        .merge(crate::ws::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_session,
        ));

    Router::<AppState>::new()
        .merge(public_top)
        .nest("/v1", v1_public)
        .nest("/v1", v1_protected)
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

async fn health() -> &'static str {
    "ok"
}
