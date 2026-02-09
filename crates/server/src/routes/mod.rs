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
pub mod health;
pub mod images;
pub mod migration;
pub mod oauth;
pub mod organizations;
pub mod projects;
pub mod remote_issues;
pub mod remote_project_statuses;
pub mod remote_projects;
pub mod remote_workspaces;
pub mod repo;
pub mod scratch;
pub mod search;
pub mod sessions;
pub mod tags;
pub mod task_attempts;
pub mod tasks;
pub mod terminal;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    // Create routers with different middleware layers
    let base_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(containers::router(&deployment))
        .merge(projects::router(&deployment))
        .merge(tasks::router(&deployment))
        .merge(task_attempts::router(&deployment))
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
        .merge(migration::router())
        .merge(sessions::router(&deployment))
        .merge(terminal::router())
        .merge(remote_issues::router())
        .merge(remote_projects::router())
        .merge(remote_project_statuses::router())
        .merge(remote_workspaces::router())
        .nest("/images", images::routes())
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .with_state(deployment);

    Router::new().nest("/api", base_routes).into_make_service()
}
