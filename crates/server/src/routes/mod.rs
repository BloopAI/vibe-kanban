use axum::{
    Router,
    routing::{IntoMakeService, get},
};
use tower_http::{compression::CompressionLayer, validate_request::ValidateRequestHeaderLayer};

use crate::{DeploymentImpl, middleware};

pub mod approvals;
pub mod config;
pub mod containers;
pub mod cursor_mcp;
pub mod filesystem;
// pub mod github;
pub mod attachments;
pub mod events;
pub mod execution_processes;
pub mod frontend;
pub mod health;
pub mod host_relay;
pub mod oauth;
pub mod organizations;
pub mod preview;
pub mod relay_auth;
pub mod releases;
pub mod remote;
pub mod repo;
pub mod scratch;
pub mod search;
pub mod sessions;
pub mod ssh_session;
pub mod tags;
pub mod terminal;
pub mod v1;
pub mod webrtc;
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
        .merge(preview::api_router())
        .merge(releases::router())
        .merge(sessions::router(&deployment))
        .merge(terminal::router())
        .route("/ssh-session", get(ssh_session::ssh_session_ws))
        .nest("/remote", remote::router())
        .merge(webrtc::router())
        .nest("/attachments", attachments::routes())
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
        .merge(host_relay::router(&deployment))
        // Cursor MCP endpoints sit OUTSIDE relay_signed_routes because the
        // bridge process talks to the backend directly over localhost and
        // does not have a relay signing session. The frontend WebSocket
        // path supports both signed (cloud) and plain-local upgrades via
        // SignedWsUpgrade.
        .merge(cursor_mcp::router().with_state(deployment.clone()))
        .merge(relay_signed_routes)
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .layer(axum::middleware::from_fn(middleware::log_server_errors))
        .with_state(deployment.clone());

    // `/v1/*` mirrors the cloud `crates/remote` API surface for `local_only`
    // desktop deployments. The frontend's Electric `useShape` collections
    // (see `shared/remote-types.ts`) are configured with `/v1/fallback/*`
    // and `/v1/<entity>` URLs and reach this router via the same origin as
    // the frontend (HTML served at `/`). We share the origin validation
    // and error-logging middleware with `/api/*` but skip relay-signature
    // verification because fallback requests are browser fetches, not
    // relay traffic.
    let v1_routes = v1::router()
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .layer(axum::middleware::from_fn(middleware::log_server_errors))
        .with_state(deployment);

    Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", api_routes)
        .nest("/v1", v1_routes)
        .layer(CompressionLayer::new())
        .into_make_service()
}
