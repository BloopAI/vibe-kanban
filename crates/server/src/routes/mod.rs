use std::sync::Arc;

use axum::{
    Router,
    routing::{IntoMakeService, get},
};
use tower_http::{compression::CompressionLayer, validate_request::ValidateRequestHeaderLayer};

use crate::{DeploymentImpl, middleware, p2p::PairingStore};

pub mod approvals;
pub mod attachments;
pub mod config;
pub mod containers;
pub mod events;
pub mod execution_processes;
pub mod filesystem;
pub mod frontend;
pub mod health;
pub mod kanban;
pub mod oauth;
pub mod p2p_hosts;
pub mod preview;
pub mod relay_auth;
pub mod releases;
pub mod repo;
pub mod scratch;
pub mod search;
pub mod sessions;
pub mod ssh_session;
pub mod tags;
pub mod terminal;
pub mod workspaces;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    let pairing_store = Arc::new(PairingStore::new());
    let relay_signed_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(containers::router(&deployment))
        .merge(workspaces::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(tags::router(&deployment))
        .merge(oauth::router())
        .merge(filesystem::router())
        .merge(repo::router())
        .merge(events::router(&deployment))
        .merge(approvals::router())
        .merge(scratch::router(&deployment))
        .merge(search::router(&deployment))
        .merge(preview::api_router())
        .merge(releases::router())
        .merge(sessions::router(&deployment))
        .merge(kanban::router(&deployment))
        .merge(terminal::router())
        .route("/ssh-session", get(ssh_session::ssh_session_ws))
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
        .merge(p2p_hosts::router(pairing_store))
        .merge(relay_signed_routes)
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .layer(axum::middleware::from_fn(middleware::log_server_errors))
        .with_state(deployment);

    Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", api_routes)
        .layer(CompressionLayer::new())
        .into_make_service()
}
