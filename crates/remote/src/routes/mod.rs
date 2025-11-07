use axum::{
    Router,
    http::{Request, header::HeaderName},
    middleware,
    routing::{delete, get, patch, post},
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
mod tasks;

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

    let public = Router::<AppState>::new()
        .route("/health", get(health))
        .route("/oauth/device/init", post(oauth::device_init))
        .route("/oauth/device/poll", post(oauth::device_poll));

    let protected = Router::<AppState>::new()
        .route("/v1/activity", get(activity::get_activity_stream))
        .route("/v1/identity", get(identity::get_identity))
        .route("/v1/tasks/bulk", get(tasks::bulk_shared_tasks))
        .route("/v1/tasks", post(tasks::create_shared_task))
        .route("/v1/tasks/{task_id}", patch(tasks::update_shared_task))
        .route("/v1/tasks/{task_id}", delete(tasks::delete_shared_task))
        .route("/v1/tasks/{task_id}/assign", post(tasks::assign_task))
        .route("/profile", get(oauth::profile))
        .merge(crate::ws::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_session,
        ));

    Router::<AppState>::new()
        .merge(public)
        .merge(protected)
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
