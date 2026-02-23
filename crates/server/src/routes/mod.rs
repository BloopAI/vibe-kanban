use axum::{
    Router,
    routing::{IntoMakeService, get},
};
use tower_http::validate_request::ValidateRequestHeaderLayer;

use crate::{DeploymentImpl, middleware};

pub mod approvals;
pub mod config;
pub mod containers;
pub mod filesystem;
// pub mod github;
pub mod events;
pub mod execution_processes;
pub mod frontend;
pub mod health;
pub mod images;
pub mod migration;
pub mod oauth;
pub mod organizations;
pub mod remote;
pub mod repo;
pub mod scratch;
pub mod search;
pub mod sessions;
pub mod tags;
pub mod task_attempts;
pub mod terminal;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    // Create routers with different middleware layers
    // Routes that should NOT require authentication even when VK_ENFORCE_LOGIN is enabled
    let public_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())  // /config/info and other config endpoints
        .merge(oauth::router())   // /auth/* endpoints for login/logout
        .with_state(deployment.clone());

    // Routes that require authentication when VK_ENFORCE_LOGIN is enabled
    let protected_routes = Router::new()
        .merge(containers::router(&deployment))
        .merge(task_attempts::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(tags::router(&deployment))
        .merge(organizations::router())
        .merge(filesystem::router())
        .merge(repo::router())
        .merge(events::router(&deployment))
        .merge(approvals::router())
        .merge(scratch::router(&deployment))
        .merge(search::router(&deployment))
        .merge(migration::router())
        .merge(sessions::router(&deployment))
        .merge(terminal::router())
        .nest("/remote", remote::router())
        .nest("/images", images::routes())
        .layer(axum::middleware::from_fn_with_state(
            deployment.clone(),
            middleware::enforce_login_middleware,
        ))
        .with_state(deployment.clone());

    // Combine public and protected routes
    let base_routes = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .with_state(deployment);

    Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", base_routes)
        .into_make_service()
}
