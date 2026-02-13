use axum::Router;

use crate::DeploymentImpl;

mod issue_relationships;
mod issue_tags;
mod issues;
mod project_statuses;
mod projects;
mod tags;
mod workspaces;

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .merge(issue_relationships::router())
        .merge(issue_tags::router())
        .merge(issues::router())
        .merge(projects::router())
        .merge(project_statuses::router())
        .merge(tags::router())
        .merge(workspaces::router())
}
