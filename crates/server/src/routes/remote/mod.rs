use axum::Router;

use crate::DeploymentImpl;

mod issues;
mod project_statuses;
mod projects;
mod workspaces;

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .merge(issues::router())
        .merge(projects::router())
        .merge(project_statuses::router())
        .merge(workspaces::router())
}
