use axum::{
    routing::{get, IntoMakeService},
    Router,
};

use crate::DeploymentImpl;

pub mod auth;
pub mod config;
pub mod filesystem;
// pub mod github;
pub mod execution_processes;
pub mod health;
pub mod projects;
pub mod task_attempts;
pub mod task_templates;
pub mod tasks;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    // Create routers with different middleware layers
    let base_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(projects::router(&deployment))
        .merge(tasks::router(&deployment))
        .merge(task_attempts::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(task_templates::router(&deployment))
        .merge(auth::router(&deployment))
        .merge(filesystem::router())
        .with_state(deployment);

    Router::new().nest("/api", base_routes).into_make_service()
}
