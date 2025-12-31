use axum::{
    Router,
    middleware::from_fn_with_state,
    routing::{IntoMakeService, get},
};

use crate::{DeploymentImpl, middleware::require_google_sso};

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
pub mod oauth;
pub mod organizations;
pub mod projects;
pub mod repo;
pub mod scratch;
pub mod sessions;
pub mod shared_tasks;
pub mod tags;
pub mod task_attempts;
pub mod tasks;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    // Protected routes - require Google SSO auth when enabled
    // These routes contain project/task data that should be protected
    let protected_routes = Router::new()
        .merge(containers::router(&deployment))
        .merge(projects::router(&deployment))
        .merge(tasks::router(&deployment))
        .merge(shared_tasks::router())
        .merge(task_attempts::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(tags::router(&deployment))
        .merge(events::router(&deployment))
        .merge(approvals::router())
        .merge(scratch::router(&deployment))
        .merge(sessions::router(&deployment))
        .nest("/images", images::routes())
        .layer(from_fn_with_state(deployment.clone(), require_google_sso));

    // Public routes - never require auth (config, health, auth endpoints, filesystem)
    let public_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(oauth::router())
        .merge(organizations::router())
        .merge(filesystem::router())
        .merge(repo::router());

    let api_routes = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .with_state(deployment);

    Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", api_routes)
        .into_make_service()
}
