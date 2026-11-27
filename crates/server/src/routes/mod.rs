use axum::{
    Router,
    routing::{IntoMakeService, get},
};
use tower_http::{compression::CompressionLayer, validate_request::ValidateRequestHeaderLayer};

use crate::{DeploymentImpl, middleware};

pub mod acp_registry;
pub mod approvals;
pub mod config;
pub mod containers;
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
pub mod webrtc;
pub mod workspaces;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    let api_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(acp_registry::router())
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
        .merge(relay_auth::router())
        .merge(host_relay::router())
        // Relayed requests need a valid signature on every `/api` route,
        // except the few that pairing needs (see
        // `middleware::relay_route_policy`).
        .layer(axum::middleware::from_fn_with_state(
            deployment.clone(),
            middleware::relay_request_guard,
        ))
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .layer(axum::middleware::from_fn(middleware::log_server_errors))
        .with_state(deployment);

    Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", api_routes)
        // Every request, the frontend included, must name an allowed Host
        // (DNS rebinding protection). `/api` also checks Origin above.
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_host,
        ))
        .layer(CompressionLayer::new())
        .into_make_service()
}
