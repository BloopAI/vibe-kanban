use axum::{
    Router,
    routing::{delete, get, post, put},
};

use crate::DeploymentImpl;

pub mod issue_assignees;
pub mod issue_relationships;
pub mod issue_tags;
pub mod issues;
pub mod projects;
pub mod statuses;
pub mod tags;

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        // Projects
        .route(
            "/kanban/projects",
            get(projects::list).post(projects::create),
        )
        .route(
            "/kanban/projects/{id}",
            get(projects::get_one)
                .put(projects::update)
                .delete(projects::remove),
        )
        // Issues (project-scoped list/create + global bulk)
        .route(
            "/kanban/projects/{project_id}/issues",
            get(issues::list).post(issues::create),
        )
        .route("/kanban/issues/bulk", post(issues::bulk_update))
        .route(
            "/kanban/issues/{id}",
            get(issues::get_one)
                .put(issues::update)
                .delete(issues::remove),
        )
        // Statuses
        .route(
            "/kanban/projects/{project_id}/statuses",
            get(statuses::list).post(statuses::create),
        )
        .route(
            "/kanban/statuses/{id}",
            put(statuses::update).delete(statuses::remove),
        )
        // Tags
        .route(
            "/kanban/projects/{project_id}/tags",
            get(tags::list).post(tags::create),
        )
        .route("/kanban/tags/{id}", put(tags::update).delete(tags::remove))
        // Issue-tags
        .route("/kanban/issue-tags", post(issue_tags::create))
        .route("/kanban/issue-tags/{id}", delete(issue_tags::remove))
        // Issue-assignees
        .route("/kanban/issue-assignees", post(issue_assignees::create))
        .route(
            "/kanban/issue-assignees/{id}",
            delete(issue_assignees::remove),
        )
        // Issue-relationships
        .route(
            "/kanban/issue-relationships",
            post(issue_relationships::create),
        )
        .route(
            "/kanban/issue-relationships/{id}",
            delete(issue_relationships::remove),
        )
        .with_state(deployment.clone())
}
