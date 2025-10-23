use axum::{
    Router, middleware,
    routing::{get, patch, post},
};
use tower_http::cors::CorsLayer;

use crate::{AppState, auth::require_clerk_session};

pub mod activity;
mod tasks;

pub fn router(state: AppState) -> Router {
    let api = Router::<AppState>::new()
        .route("/health", get(health))
        .route("/v1/activity", get(activity::get_activity_stream))
        .route("/v1/tasks", post(tasks::create_shared_task))
        .route("/v1/tasks/{task_id}", patch(tasks::update_shared_task))
        .route("/v1/tasks/{task_id}/assign", post(tasks::assign_task));

    Router::<AppState>::new()
        .merge(api)
        .merge(crate::ws::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_clerk_session,
        ))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}
