use axum::{
    Router,
    routing::{IntoMakeService, get},
};
use tower_http::validate_request::ValidateRequestHeaderLayer;
use utoipa::OpenApi;

use crate::{DeploymentImpl, middleware};

pub mod approvals;
pub mod config;
pub mod containers;
pub mod filesystem;
// pub mod github;
pub mod events;
pub mod execution_processes;
pub mod frontend;
pub mod health;
pub mod images;
pub mod migration;
pub mod oauth;
pub mod organizations;
pub mod projects;
pub mod remote;
pub mod repo;
pub mod scratch;
pub mod search;
pub mod sessions;
pub mod tags;
pub mod task_attempts;
pub mod tasks;
pub mod terminal;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Vibe Kanban Local API",
        version = env!("CARGO_PKG_VERSION"),
        description = "Local development API for Vibe Kanban"
    ),
    paths(
        // Health
        health::health_check,
        // Tasks
        tasks::get_tasks,
        tasks::get_task,
        tasks::create_task,
        tasks::create_task_and_start,
        tasks::update_task,
        tasks::delete_task,
        tasks::stream_tasks_ws,
        // Projects
        projects::get_projects,
        projects::get_project,
        projects::create_project,
        projects::update_project,
        projects::delete_project,
        projects::stream_projects_ws,
        projects::open_project_in_editor,
        projects::search_project_files,
        projects::get_project_repositories,
        projects::add_project_repository,
        projects::delete_project_repository,
        projects::get_project_repository,
        // Task Attempts (Workspaces)
        task_attempts::get_task_attempts,
        task_attempts::get_task_attempt,
        task_attempts::create_task_attempt,
        task_attempts::update_workspace,
        task_attempts::run_agent_setup,
        task_attempts::stream_task_attempt_diff_ws,
        task_attempts::stream_workspaces_ws,
        task_attempts::merge_task_attempt,
        task_attempts::push_task_attempt_branch,
        task_attempts::force_push_task_attempt_branch,
        task_attempts::open_task_attempt_in_editor,
        task_attempts::get_task_attempt_branch_status,
        task_attempts::change_target_branch,
        task_attempts::rename_branch,
        task_attempts::rebase_task_attempt,
        task_attempts::abort_conflicts_task_attempt,
        task_attempts::continue_rebase_task_attempt,
        task_attempts::start_dev_server,
        task_attempts::get_task_attempt_children,
        task_attempts::stop_task_attempt_execution,
        task_attempts::run_setup_script,
        task_attempts::run_cleanup_script,
        task_attempts::run_archive_script,
        task_attempts::gh_cli_setup_handler,
        task_attempts::get_task_attempt_repos,
        task_attempts::get_first_user_message,
        task_attempts::delete_workspace,
        task_attempts::mark_seen,
        task_attempts::link_workspace,
        task_attempts::unlink_workspace,
        task_attempts::pr::create_pr,
        task_attempts::pr::attach_existing_pr,
        task_attempts::pr::get_pr_comments,
        task_attempts::pr::create_workspace_from_pr,
        task_attempts::workspace_summary::get_workspace_summaries,
        // Execution Processes
        execution_processes::get_execution_process_by_id,
        execution_processes::stream_raw_logs_ws,
        execution_processes::stream_normalized_logs_ws,
        execution_processes::stop_execution_process,
        execution_processes::stream_execution_processes_by_session_ws,
        execution_processes::get_execution_process_repo_states,
        // Tags
        tags::get_tags,
        tags::create_tag,
        tags::update_tag,
        tags::delete_tag,
        // Config
        config::get_user_system_info,
        config::update_config,
        config::get_sound,
        config::get_mcp_servers,
        config::update_mcp_servers,
        config::get_profiles,
        config::update_profiles,
        config::check_editor_availability,
        config::check_agent_availability,
        config::stream_agent_slash_commands_ws,
        // Containers
        containers::get_container_info,
        containers::get_context,
        // Auth
        oauth::handoff_init,
        oauth::handoff_complete,
        oauth::logout,
        oauth::status,
        oauth::get_token,
        oauth::get_current_user,
        // Organizations
        organizations::list_organizations,
        organizations::get_organization,
        organizations::create_organization,
        organizations::update_organization,
        organizations::delete_organization,
        organizations::create_invitation,
        organizations::list_invitations,
        organizations::get_invitation,
        organizations::revoke_invitation,
        organizations::accept_invitation,
        organizations::list_members,
        organizations::remove_member,
        organizations::update_member_role,
        // Filesystem
        filesystem::list_directory,
        filesystem::list_git_repos,
        // Repos
        repo::register_repo,
        repo::init_repo,
        repo::get_repo_branches,
        repo::get_repo_remotes,
        repo::get_repos_batch,
        repo::get_repos,
        repo::get_recent_repos,
        repo::get_repo,
        repo::update_repo,
        repo::open_repo_in_editor,
        repo::search_repo,
        repo::list_open_prs,
        // Events
        events::events,
        // Approvals
        approvals::respond_to_approval,
        // Scratch
        scratch::list_scratch,
        scratch::get_scratch,
        scratch::create_scratch,
        scratch::update_scratch,
        scratch::delete_scratch,
        scratch::stream_scratch_ws,
        // Search
        search::search_files,
        // Migration
        migration::start_migration,
        // Sessions
        sessions::get_sessions,
        sessions::get_session,
        sessions::create_session,
        sessions::follow_up,
        sessions::reset_process,
        sessions::review::start_review,
        sessions::queue::queue_message,
        sessions::queue::cancel_queued_message,
        sessions::queue::get_queue_status,
        // Terminal
        terminal::terminal_ws,
        // Remote
        remote::issues::list_issues,
        remote::issues::get_issue,
        remote::issues::create_issue,
        remote::issues::update_issue,
        remote::issues::delete_issue,
        remote::projects::list_remote_projects,
        remote::projects::get_remote_project,
        remote::project_statuses::list_project_statuses,
        remote::workspaces::get_workspace_by_local_id,
        // Images
        images::upload_image,
        images::upload_task_image,
        images::serve_image,
        images::delete_image,
        images::get_task_images,
        images::get_task_image_metadata,
    ),
    tags(
        (name = "Health", description = "Health check"),
        (name = "Tasks", description = "Task management"),
        (name = "Projects", description = "Project management"),
        (name = "TaskAttempts", description = "Task attempt / workspace management"),
        (name = "ExecutionProcesses", description = "Execution process management"),
        (name = "Tags", description = "Tag management"),
        (name = "Config", description = "Configuration"),
        (name = "Containers", description = "Container management"),
        (name = "Auth", description = "Authentication"),
        (name = "Organizations", description = "Organization management"),
        (name = "Filesystem", description = "Filesystem operations"),
        (name = "Repos", description = "Repository management"),
        (name = "Events", description = "Server-sent events"),
        (name = "Approvals", description = "Approval management"),
        (name = "Scratch", description = "Scratch pad"),
        (name = "Search", description = "Global search"),
        (name = "Migration", description = "Data migration"),
        (name = "Sessions", description = "Session management"),
        (name = "Terminal", description = "Terminal access"),
        (name = "Remote", description = "Remote proxy"),
        (name = "Images", description = "Image management"),
    )
)]
pub struct ApiDoc;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    // Create routers with different middleware layers
    let base_routes = Router::new()
        .route("/health", get(health::health_check))
        .route(
            "/openapi.json",
            get(|| async { axum::Json(ApiDoc::openapi()) }),
        )
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
        .nest("/remote", remote::router())
        .nest("/images", images::routes())
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .with_state(deployment);

    #[allow(unused_mut)]
    let mut app = Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", base_routes);

    #[cfg(feature = "swagger-ui")]
    {
        app = app.merge(
            utoipa_swagger_ui::SwaggerUi::new("/swagger-ui")
                .config(utoipa_swagger_ui::Config::new(["/api/openapi.json"])),
        );
    }

    app.into_make_service()
}

#[cfg(test)]
mod openapi_tests {
    use super::*;

    #[test]
    fn openapi_spec_is_valid_json() {
        let spec = ApiDoc::openapi();
        let json = serde_json::to_string_pretty(&spec).unwrap();
        assert!(!json.is_empty());
        assert!(!spec.paths.paths.is_empty());
    }

    #[test]
    fn openapi_spec_has_all_tags() {
        let spec = ApiDoc::openapi();
        let tags: Vec<&str> = spec
            .tags
            .as_ref()
            .unwrap()
            .iter()
            .map(|t| t.name.as_str())
            .collect();
        assert!(tags.contains(&"Health"));
        assert!(tags.contains(&"Tasks"));
        assert!(tags.contains(&"Projects"));
        assert!(tags.contains(&"Config"));
    }
}
