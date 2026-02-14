use axum::Router;

use crate::DeploymentImpl;

pub mod issues;
pub mod project_statuses;
pub mod projects;
pub mod workspaces;

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .merge(issues::router())
        .merge(projects::router())
        .merge(project_statuses::router())
        .merge(workspaces::router())
}
