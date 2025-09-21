use axum::{
    Router,
    routing::{IntoMakeService, get},
};

use crate::DeploymentImpl;

pub mod approvals;
pub mod auth;
pub mod config;
pub mod containers;
pub mod filesystem;
// pub mod github;
pub mod drafts;
pub mod events;
pub mod execution_processes;
pub mod frontend;
pub mod health;
pub mod images;
pub mod projects;
pub mod task_attempts;
pub mod task_templates;
pub mod tasks;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    // Create routers with different middleware layers
    let base_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(containers::router(&deployment))
        .merge(projects::router(&deployment))
        .merge(drafts::router(&deployment))
        .merge(tasks::router(&deployment))
        .merge(task_attempts::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(task_templates::router(&deployment))
        .merge(auth::router(&deployment))
        .merge(filesystem::router())
        .merge(events::router(&deployment))
        .merge(approvals::router())
        .nest("/images", images::routes())
        .with_state(deployment);

    Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", base_routes)
        .into_make_service()
}
