use axum::Router;

use crate::DeploymentImpl;

mod issue_assignees;
mod issues;
mod project_statuses;
mod projects;
mod workspaces;

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .merge(issue_assignees::router())
        .merge(issues::router())
        .merge(projects::router())
        .merge(project_statuses::router())
        .merge(workspaces::router())
}
