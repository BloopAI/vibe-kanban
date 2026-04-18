pub mod handlers;
pub mod types;

// Re-export types for public API
pub use types::{
    GitHubCountsResponse, LinkToLocalFolderRequest, ListProjectFilesQuery, MergedProject,
    MergedProjectsResponse, NodeLocation, OpenEditorRequest, OpenEditorResponse, OrphanedProject,
    OrphanedProjectsResponse, RemoteNodeGroup, RemoteNodeProject, SetGitHubEnabledRequest,
    TaskCounts, UnifiedProject,
};

use axum::{
    Router,
    middleware::from_fn_with_state,
    routing::{get, post},
};

use crate::{
    DeploymentImpl,
    middleware::{
        load_project_by_remote_id_middleware, load_project_middleware,
        load_project_middleware_with_wildcard,
    },
};

// Import handlers from the handlers module
use handlers::{
    // Core handlers
    create_project,
    delete_orphaned_projects,
    delete_project,
    // Swarm handlers
    force_resync_tasks,
    // GitHub handlers
    get_github_counts,
    // Merged handlers
    get_merged_projects,
    get_project,
    get_project_branches,
    // Linking handlers
    get_project_remote_members,
    get_project_sync_health,
    get_projects,
    link_to_local_folder,
    list_orphaned_projects,
    // File handlers
    list_project_files,
    open_project_in_editor,
    read_project_file,
    read_project_file_by_remote_id,
    scan_project_config,
    search_project_files,
    set_github_enabled,
    sync_github_counts,
    unlink_from_swarm,
    update_project,
};

/// Builds the axum router containing all project-related HTTP routes.
///
/// This router mounts the `/projects` subtree (including per-project, file, by-remote-id, and orphaned routes),
/// exposes `/merged-projects`, and applies the appropriate per-route middleware for loading projects
/// (including wildcard and by-remote-id variants).
///
/// # Returns
///
/// A configured `Router<DeploymentImpl>` with all project endpoints and their middleware applied.
///
/// # Examples
///
/// ```
/// // Create or obtain a DeploymentImpl instance and pass a reference to build the router.
/// // let deployment = DeploymentImpl::new(...);
/// // let router = crate::routes::projects::router(&deployment);
/// ```
pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let project_id_router = Router::new()
        .route(
            "/",
            get(get_project).put(update_project).delete(delete_project),
        )
        .route("/remote/members", get(get_project_remote_members))
        .route("/branches", get(get_project_branches))
        .route("/search", get(search_project_files))
        .route("/open-editor", post(open_project_in_editor))
        // File browser endpoints
        .route("/files", get(list_project_files))
        // GitHub integration endpoints
        .route("/github", post(set_github_enabled))
        .route("/github/counts", get(get_github_counts))
        .route("/github/sync", post(sync_github_counts))
        // Swarm sync health endpoints
        .route("/sync-health", get(get_project_sync_health))
        .route("/unlink-swarm", post(unlink_from_swarm))
        .route("/force-resync-tasks", post(force_resync_tasks))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_middleware,
        ));

    // File content route needs to be outside the middleware-wrapped router
    // because it uses a wildcard path parameter. Uses the wildcard variant
    // that extracts both path params but only uses the id.
    let project_files_router = Router::new()
        .route("/{id}/files/{*file_path}", get(read_project_file))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_middleware_with_wildcard,
        ));

    // Routes for accessing projects by remote_project_id (used for node-to-node proxying)
    // These routes allow a proxying node to request data using the Hive project ID
    let by_remote_id_router = Router::new()
        .route("/branches", get(get_project_branches))
        .route("/search", get(search_project_files))
        .route("/files", get(list_project_files))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_by_remote_id_middleware,
        ));

    // File content route for by-remote-id (wildcard path parameter)
    let by_remote_id_files_router = Router::new()
        .route(
            "/by-remote-id/{remote_project_id}/files/{*file_path}",
            get(read_project_file_by_remote_id),
        )
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_by_remote_id_middleware,
        ));

    let projects_router = Router::new()
        .route("/", get(get_projects).post(create_project))
        .route("/scan-config", post(scan_project_config))
        .route("/link-local", post(link_to_local_folder))
        .route(
            "/orphaned",
            get(list_orphaned_projects).delete(delete_orphaned_projects),
        )
        .nest("/{id}", project_id_router)
        .merge(project_files_router)
        .nest("/by-remote-id/{remote_project_id}", by_remote_id_router)
        .merge(by_remote_id_files_router);

    Router::new()
        .nest("/projects", projects_router)
        .route("/merged-projects", get(get_merged_projects))
}

// Note: Type tests are in types.rs
// Note: Tests for check_remote_proxy are in crates/server/src/proxy.rs
