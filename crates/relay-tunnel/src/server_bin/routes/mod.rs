mod auth_code;
pub mod connect;
pub mod path_routes;

use axum::{
    Router,
    http::{HeaderName, StatusCode},
    middleware,
    response::IntoResponse,
    routing::{any, get, post},
};
use serde::Serialize;
use tower_http::{
    cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer, ExposeHeaders},
    trace::TraceLayer,
};

use super::{auth, state::RelayAppState};

pub fn build_router(state: RelayAppState) -> Router {
    let protected = Router::new()
        .route("/relay/connect", get(connect::relay_connect))
        .route(
            "/relay/sessions/{session_id}/auth-code",
            post(auth_code::relay_session_auth_code),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_session,
        ));

    let public = Router::new()
        .route("/health", get(health))
        .route(
            "/relay/h/{host_id}/exchange",
            get(path_routes::relay_path_exchange),
        )
        .route(
            "/relay/h/{host_id}/s/{browser_session_id}",
            any(path_routes::relay_path_proxy),
        )
        .route(
            "/relay/h/{host_id}/s/{browser_session_id}/",
            any(path_routes::relay_path_proxy),
        )
        .route(
            "/relay/h/{host_id}/s/{browser_session_id}/{*tail}",
            any(path_routes::relay_path_proxy_with_tail),
        );

    Router::<RelayAppState>::new()
        .nest("/v1", protected)
        .merge(public)
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::mirror_request())
                .allow_methods(AllowMethods::mirror_request())
                .allow_headers(AllowHeaders::mirror_request())
                .expose_headers(ExposeHeaders::list([
                    HeaderName::from_static("x-vk-resp-ts"),
                    HeaderName::from_static("x-vk-resp-nonce"),
                    HeaderName::from_static("x-vk-resp-signature"),
                ]))
                .allow_credentials(true),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, axum::Json(HealthResponse { status: "ok" }))
}
