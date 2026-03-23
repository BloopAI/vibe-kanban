pub mod attachments;
pub mod codex_setup;
pub mod core;
pub mod create;
pub mod cursor_setup;
pub mod execution;
pub mod gh_cli_setup;
pub mod git;
pub mod integration;
pub mod links;
pub mod pr;
pub mod repos;
pub mod streams;
pub mod workspace_summary;

use axum::{
    Router,
    middleware::from_fn_with_state,
    routing::{get, post},
};

use crate::{DeploymentImpl, middleware::load_workspace_middleware};

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let workspace_id_router = Router::new()
        .route(
            "/",
            get(core::get_workspace)
                .put(core::update_workspace)
                .delete(core::delete_workspace),
        )
        .route("/messages/first", get(core::get_first_user_message))
        .route("/seen", axum::routing::put(core::mark_seen))
        .nest("/git", git::router())
        .nest("/execution", execution::router())
        .nest("/integration", integration::router())
        .nest("/repos", repos::router())
        .nest("/pull-requests", pr::router())
        .layer(from_fn_with_state(
            deployment.clone(),
            load_workspace_middleware,
        ));

    let workspaces_router = Router::new()
        .route(
            "/",
            get(core::get_workspaces).post(create::create_workspace),
        )
        .route("/start", post(create::create_and_start_workspace))
        .route("/from-pr", post(pr::create_workspace_from_pr))
        .route("/streams/ws", get(streams::stream_workspaces_ws))
        .route(
            "/summaries",
            post(workspace_summary::get_workspace_summaries),
        )
        .nest("/{id}", workspace_id_router)
        .nest("/{id}/attachments", attachments::router(deployment))
        .nest("/{id}/links", links::router(deployment));

    Router::new().nest("/workspaces", workspaces_router)
}
