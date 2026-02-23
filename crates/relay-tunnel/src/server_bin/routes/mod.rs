mod auth_code;
pub mod connect;
pub mod subdomain;

use axum::{
    Router,
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::headers::{HeaderMapExt, Host};
use serde::Serialize;
use tower_http::{
    cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
use uuid::Uuid;

use super::{auth, state::RelayAppState};

pub fn build_router(state: RelayAppState) -> Router {
    let protected = Router::new()
        .route("/relay/connect/{host_id}", get(connect::relay_connect))
        .route(
            "/relay/sessions/{session_id}/auth-code",
            post(auth_code::relay_session_auth_code),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_session,
        ));

    let public = Router::new().route("/health", get(health));

    Router::<RelayAppState>::new()
        .nest("/v1", protected)
        .merge(public)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            relay_subdomain_middleware,
        ))
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::mirror_request())
                .allow_methods(AllowMethods::mirror_request())
                .allow_headers(AllowHeaders::mirror_request())
                .allow_credentials(true),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Middleware that intercepts requests on relay subdomains.
/// If the Host header matches `{host_id}.{relay_base_domain}`, the request
/// is handled by the relay proxy. Otherwise it passes through normally.
async fn relay_subdomain_middleware(
    state: State<RelayAppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let host = request
        .headers()
        .typed_get::<Host>()
        .map(|h| h.hostname().to_owned())
        .unwrap_or_default();

    if let Some(host_id) = extract_relay_host_id(&host, &state.config.relay_base_domain) {
        return subdomain::relay_subdomain_request(state, request, host_id).await;
    }

    next.run(request).await
}

fn extract_relay_host_id(host: &str, relay_base_domain: &str) -> Option<Uuid> {
    let subdomain = crate::server::extract_relay_subdomain(host, relay_base_domain)?;
    Uuid::parse_str(&subdomain).ok()
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, axum::Json(HealthResponse { status: "ok" }))
}
