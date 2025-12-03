use std::path::Path as StdPath;

use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use db::models::{
    cached_node::CachedNodeStatus,
    cached_node_project::CachedNodeProjectWithNode,
    project::{
        CreateProject, Project, ProjectError, ScanConfigRequest, ScanConfigResponse,
        SearchMatchType, SearchResult, UpdateProject,
    },
    task::Task,
};
use deployment::Deployment;
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use services::services::{
    file_ranker::FileRanker,
    file_search_cache::{CacheError, SearchMode, SearchQuery},
    filesystem::{DirectoryListResponse, FileContentResponse, FilesystemError},
    git::GitBranch,
    project_detector::ProjectDetector,
    remote_client::CreateRemoteProjectPayload,
    share::link_shared_tasks_to_project,
};
use ts_rs::TS;
use utils::{
    api::projects::{RemoteProject, RemoteProjectMembersResponse},
    path::expand_tilde,
    response::ApiResponse,
};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_project_middleware};

#[derive(Deserialize, TS)]
pub struct LinkToExistingRequest {
    pub remote_project_id: Uuid,
}

#[derive(Deserialize, TS)]
pub struct CreateRemoteProjectRequest {
    pub organization_id: Uuid,
    pub name: String,
}

/// A project in the unified view - can be local or from another node
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "type")]
pub enum UnifiedProject {
    /// A local project on this node
    #[serde(rename = "local")]
    Local(Project),
    /// A project from another node (cached from hive sync)
    #[serde(rename = "remote")]
    Remote(RemoteNodeProject),
}

/// A project from another node in the organization
#[derive(Debug, Clone, Serialize, TS)]
pub struct RemoteNodeProject {
    pub id: Uuid,
    pub node_id: Uuid,
    pub project_id: Uuid,
    pub local_project_id: Uuid,
    pub project_name: String,
    pub git_repo_path: String,
    pub default_branch: String,
    pub sync_status: String,
    #[ts(type = "Date | null")]
    pub last_synced_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub cached_at: DateTime<Utc>,
    // Node info
    pub node_name: String,
    pub node_status: CachedNodeStatus,
    pub node_public_url: Option<String>,
}

impl From<CachedNodeProjectWithNode> for RemoteNodeProject {
    fn from(p: CachedNodeProjectWithNode) -> Self {
        Self {
            id: p.id,
            node_id: p.node_id,
            project_id: p.project_id,
            local_project_id: p.local_project_id,
            project_name: p.project_name,
            git_repo_path: p.git_repo_path,
            default_branch: p.default_branch,
            sync_status: p.sync_status,
            last_synced_at: p.last_synced_at,
            created_at: p.created_at,
            cached_at: p.cached_at,
            node_name: p.node_name,
            node_status: p.node_status,
            node_public_url: p.node_public_url,
        }
    }
}

/// Response for the unified projects endpoint
#[derive(Debug, Clone, Serialize, TS)]
pub struct UnifiedProjectsResponse {
    /// Local projects (always shown first)
    pub local: Vec<Project>,
    /// Projects from other nodes grouped by node
    pub remote_by_node: Vec<RemoteNodeGroup>,
}

/// A group of projects from a single remote node
#[derive(Debug, Clone, Serialize, TS)]
pub struct RemoteNodeGroup {
    pub node_id: Uuid,
    pub node_name: String,
    pub node_status: CachedNodeStatus,
    pub node_public_url: Option<String>,
    pub projects: Vec<RemoteNodeProject>,
}

pub async fn get_projects(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Project>>>, ApiError> {
    let projects = Project::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(projects)))
}

/// Get a unified view of all projects: local projects first, then remote projects grouped by node.
///
/// Remote projects that are already linked to a local project (via remote_project_id) are excluded
/// to avoid duplicates. Projects from the current node are also excluded since they're shown as local.
pub async fn get_unified_projects(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<UnifiedProjectsResponse>>, ApiError> {
    use std::collections::HashMap;

    let pool = &deployment.db().pool;

    // Get local projects
    let local_projects = Project::find_all(pool).await?;

    // Collect remote_project_ids to exclude from remote list
    let linked_remote_ids: Vec<Uuid> = local_projects
        .iter()
        .filter_map(|p| p.remote_project_id)
        .collect();

    // Get current node_id to exclude from remote list (if connected to hive)
    let current_node_id = if let Some(ctx) = deployment.node_runner_context() {
        ctx.node_id().await
    } else {
        None
    };

    tracing::debug!(
        local_count = local_projects.len(),
        linked_remote_ids_count = linked_remote_ids.len(),
        linked_remote_ids = ?linked_remote_ids,
        current_node_id = ?current_node_id,
        "unified projects: fetching remote projects"
    );

    // Get all remote projects from all organizations, excluding:
    // 1. Projects already linked locally
    // 2. Projects from the current node (they're shown as local projects)
    let all_remote =
        CachedNodeProjectWithNode::find_remote_projects(pool, &linked_remote_ids, current_node_id)
            .await
            .unwrap_or_default();

    tracing::debug!(
        remote_count = all_remote.len(),
        "unified projects: found remote projects"
    );

    // Group remote projects by node
    let mut by_node: HashMap<Uuid, RemoteNodeGroup> = HashMap::new();
    for remote_project in all_remote {
        let node_id = remote_project.node_id;
        let group = by_node.entry(node_id).or_insert_with(|| RemoteNodeGroup {
            node_id,
            node_name: remote_project.node_name.clone(),
            node_status: remote_project.node_status,
            node_public_url: remote_project.node_public_url.clone(),
            projects: Vec::new(),
        });
        group.projects.push(RemoteNodeProject::from(remote_project));
    }

    // Convert to sorted list of node groups
    let mut remote_by_node: Vec<RemoteNodeGroup> = by_node.into_values().collect();
    remote_by_node.sort_by(|a, b| a.node_name.cmp(&b.node_name));

    tracing::debug!(
        node_groups = remote_by_node.len(),
        "unified projects: returning response"
    );

    Ok(ResponseJson(ApiResponse::success(UnifiedProjectsResponse {
        local: local_projects,
        remote_by_node,
    })))
}

pub async fn get_project(
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(project)))
}

pub async fn get_project_branches(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitBranch>>>, ApiError> {
    let branches = deployment.git().get_all_branches(&project.git_repo_path)?;
    Ok(ResponseJson(ApiResponse::success(branches)))
}

pub async fn link_project_to_existing_remote(
    Path(project_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<LinkToExistingRequest>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let client = deployment.remote_client()?;

    let remote_project = client.get_project(payload.remote_project_id).await?;

    let updated_project =
        apply_remote_project_link(&deployment, project_id, remote_project).await?;

    Ok(ResponseJson(ApiResponse::success(updated_project)))
}

pub async fn create_and_link_remote_project(
    Path(project_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateRemoteProjectRequest>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let repo_name = payload.name.trim().to_string();
    if repo_name.trim().is_empty() {
        return Err(ApiError::Conflict(
            "Remote project name cannot be empty.".to_string(),
        ));
    }

    let client = deployment.remote_client()?;

    let remote_project = client
        .create_project(&CreateRemoteProjectPayload {
            organization_id: payload.organization_id,
            name: repo_name,
            metadata: None,
        })
        .await?;

    let updated_project =
        apply_remote_project_link(&deployment, project_id, remote_project).await?;

    Ok(ResponseJson(ApiResponse::success(updated_project)))
}

pub async fn unlink_project(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let pool = &deployment.db().pool;

    if let Some(remote_project_id) = project.remote_project_id {
        let mut tx = pool.begin().await?;

        Task::clear_shared_task_ids_for_remote_project(&mut *tx, remote_project_id).await?;

        Project::set_remote_project_id_tx(&mut *tx, project.id, None).await?;

        tx.commit().await?;

        // Notify the hive about the unlink if we're connected as a node
        if let Some(ctx) = deployment.node_runner_context() {
            use services::services::hive_client::UnlinkProjectMessage;

            if ctx.is_connected().await {
                let unlink_msg = UnlinkProjectMessage {
                    project_id: remote_project_id,
                };

                if let Err(e) = ctx.send_unlink_project(unlink_msg).await {
                    tracing::warn!(
                        project_id = %project.id,
                        remote_project_id = %remote_project_id,
                        error = %e,
                        "failed to send unlink_project to hive"
                    );
                } else {
                    tracing::info!(
                        project_id = %project.id,
                        remote_project_id = %remote_project_id,
                        "sent unlink_project to hive"
                    );
                }
            }
        }
    }

    let updated_project = Project::find_by_id(pool, project.id)
        .await?
        .ok_or(ProjectError::ProjectNotFound)?;

    Ok(ResponseJson(ApiResponse::success(updated_project)))
}

pub async fn get_remote_project_by_id(
    State(deployment): State<DeploymentImpl>,
    Path(remote_project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<RemoteProject>>, ApiError> {
    let client = deployment.remote_client()?;

    let remote_project = client.get_project(remote_project_id).await?;

    Ok(ResponseJson(ApiResponse::success(remote_project)))
}

pub async fn get_project_remote_members(
    State(deployment): State<DeploymentImpl>,
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<RemoteProjectMembersResponse>>, ApiError> {
    let remote_project_id = project.remote_project_id.ok_or_else(|| {
        ApiError::Conflict("Project is not linked to a remote project".to_string())
    })?;

    let client = deployment.remote_client()?;

    let remote_project = client.get_project(remote_project_id).await?;
    let members = client
        .list_members(remote_project.organization_id)
        .await?
        .members;

    Ok(ResponseJson(ApiResponse::success(
        RemoteProjectMembersResponse {
            organization_id: remote_project.organization_id,
            members,
        },
    )))
}

async fn apply_remote_project_link(
    deployment: &DeploymentImpl,
    project_id: Uuid,
    remote_project: RemoteProject,
) -> Result<Project, ApiError> {
    let pool = &deployment.db().pool;

    // First get the project to get git_repo_path for the hive notification
    let project = Project::find_by_id(pool, project_id)
        .await?
        .ok_or(ProjectError::ProjectNotFound)?;

    Project::set_remote_project_id(pool, project_id, Some(remote_project.id)).await?;

    let updated_project = Project::find_by_id(pool, project_id)
        .await?
        .ok_or(ProjectError::ProjectNotFound)?;

    let current_profile = deployment.auth_context().cached_profile().await;
    let current_user_id = current_profile.as_ref().map(|p| p.user_id);
    link_shared_tasks_to_project(pool, current_user_id, project_id, remote_project.id).await?;

    // Notify the hive about the link if we're connected as a node
    if let Some(ctx) = deployment.node_runner_context() {
        use services::services::hive_client::LinkProjectMessage;

        if ctx.is_connected().await {
            // Get the current branch from git (use as default branch)
            let default_branch = deployment
                .git()
                .get_current_branch(&project.git_repo_path)
                .unwrap_or_else(|_| "main".to_string());

            let link_msg = LinkProjectMessage {
                project_id: remote_project.id,
                local_project_id: project_id,
                git_repo_path: project.git_repo_path.to_string_lossy().to_string(),
                default_branch,
            };

            if let Err(e) = ctx.send_link_project(link_msg).await {
                tracing::warn!(
                    project_id = %project_id,
                    remote_project_id = %remote_project.id,
                    error = %e,
                    "failed to send link_project to hive"
                );
            } else {
                tracing::info!(
                    project_id = %project_id,
                    remote_project_id = %remote_project.id,
                    "sent link_project to hive"
                );
            }
        }
    }

    deployment
        .track_if_analytics_allowed(
            "project_linked_to_remote",
            serde_json::json!({
                "project_id": project_id.to_string(),
            }),
        )
        .await;

    Ok(updated_project)
}

pub async fn create_project(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let id = Uuid::new_v4();
    let CreateProject {
        name,
        git_repo_path,
        setup_script,
        dev_script,
        cleanup_script,
        copy_files,
        use_existing_repo,
    } = payload;
    tracing::debug!("Creating project '{}'", name);

    // Validate and setup git repository
    let path = std::path::absolute(expand_tilde(&git_repo_path))?;
    // Check if git repo path is already used by another project
    match Project::find_by_git_repo_path(&deployment.db().pool, path.to_string_lossy().as_ref())
        .await
    {
        Ok(Some(_)) => {
            return Ok(ResponseJson(ApiResponse::error(
                "A project with this git repository path already exists",
            )));
        }
        Ok(None) => {
            // Path is available, continue
        }
        Err(e) => {
            return Err(ProjectError::GitRepoCheckFailed(e.to_string()).into());
        }
    }

    if use_existing_repo {
        // For existing repos, validate that the path exists and is a git repository
        if !path.exists() {
            return Ok(ResponseJson(ApiResponse::error(
                "The specified path does not exist",
            )));
        }

        if !path.is_dir() {
            return Ok(ResponseJson(ApiResponse::error(
                "The specified path is not a directory",
            )));
        }

        if !path.join(".git").exists() {
            return Ok(ResponseJson(ApiResponse::error(
                "The specified directory is not a git repository",
            )));
        }

        // Ensure existing repo has a main branch if it's empty
        if let Err(e) = deployment.git().ensure_main_branch_exists(&path) {
            tracing::error!("Failed to ensure main branch exists: {}", e);
            return Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to ensure main branch exists: {}",
                e
            ))));
        }
    } else {
        // For new repos, create directory and initialize git

        // Create directory if it doesn't exist
        if !path.exists()
            && let Err(e) = std::fs::create_dir_all(&path)
        {
            tracing::error!("Failed to create directory: {}", e);
            return Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to create directory: {}",
                e
            ))));
        }

        // Check if it's already a git repo, if not initialize it
        if !path.join(".git").exists()
            && let Err(e) = deployment.git().initialize_repo_with_main_branch(&path)
        {
            tracing::error!("Failed to initialize git repository: {}", e);
            return Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to initialize git repository: {}",
                e
            ))));
        }
    }

    match Project::create(
        &deployment.db().pool,
        &CreateProject {
            name,
            git_repo_path: path.to_string_lossy().to_string(),
            use_existing_repo,
            setup_script,
            dev_script,
            cleanup_script,
            copy_files,
        },
        id,
    )
    .await
    {
        Ok(project) => {
            // Track project creation event
            deployment
                .track_if_analytics_allowed(
                    "project_created",
                    serde_json::json!({
                        "project_id": project.id.to_string(),
                        "use_existing_repo": use_existing_repo,
                        "has_setup_script": project.setup_script.is_some(),
                        "has_dev_script": project.dev_script.is_some(),
                        "trigger": "manual",
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(project)))
        }
        Err(e) => Err(ProjectError::CreateFailed(e.to_string()).into()),
    }
}

pub async fn update_project(
    Extension(existing_project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    // Destructure payload to handle field updates.
    // This allows us to treat `None` from the payload as an explicit `null` to clear a field,
    // as the frontend currently sends all fields on update.
    let UpdateProject {
        name,
        git_repo_path,
        setup_script,
        dev_script,
        cleanup_script,
        copy_files,
    } = payload;
    // If git_repo_path is being changed, check if the new path is already used by another project
    let git_repo_path = if let Some(new_git_repo_path) = git_repo_path.map(|s| expand_tilde(&s))
        && new_git_repo_path != existing_project.git_repo_path
    {
        match Project::find_by_git_repo_path_excluding_id(
            &deployment.db().pool,
            new_git_repo_path.to_string_lossy().as_ref(),
            existing_project.id,
        )
        .await
        {
            Ok(Some(_)) => {
                return Ok(ResponseJson(ApiResponse::error(
                    "A project with this git repository path already exists",
                )));
            }
            Ok(None) => new_git_repo_path,
            Err(e) => {
                tracing::error!("Failed to check for existing git repo path: {}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    } else {
        existing_project.git_repo_path
    };

    match Project::update(
        &deployment.db().pool,
        existing_project.id,
        name.unwrap_or(existing_project.name),
        git_repo_path.to_string_lossy().to_string(),
        setup_script,
        dev_script,
        cleanup_script,
        copy_files,
    )
    .await
    {
        Ok(project) => Ok(ResponseJson(ApiResponse::success(project))),
        Err(e) => {
            tracing::error!("Failed to update project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn delete_project(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    match Project::delete(&deployment.db().pool, project.id).await {
        Ok(rows_affected) => {
            if rows_affected == 0 {
                Err(StatusCode::NOT_FOUND)
            } else {
                deployment
                    .track_if_analytics_allowed(
                        "project_deleted",
                        serde_json::json!({
                            "project_id": project.id.to_string(),
                        }),
                    )
                    .await;

                Ok(ResponseJson(ApiResponse::success(())))
            }
        }
        Err(e) => {
            tracing::error!("Failed to delete project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[derive(serde::Deserialize)]
pub struct OpenEditorRequest {
    editor_type: Option<String>,
}

#[derive(Debug, serde::Serialize, ts_rs::TS)]
pub struct OpenEditorResponse {
    pub url: Option<String>,
}

pub async fn open_project_in_editor(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<Option<OpenEditorRequest>>,
) -> Result<ResponseJson<ApiResponse<OpenEditorResponse>>, ApiError> {
    let path = project.git_repo_path;

    let editor_config = {
        let config = deployment.config().read().await;
        let editor_type_str = payload.as_ref().and_then(|req| req.editor_type.as_deref());
        config.editor.with_override(editor_type_str)
    };

    match editor_config.open_file(&path).await {
        Ok(url) => {
            tracing::info!(
                "Opened editor for project {} at path: {}{}",
                project.id,
                path.to_string_lossy(),
                if url.is_some() { " (remote mode)" } else { "" }
            );

            deployment
                .track_if_analytics_allowed(
                    "project_editor_opened",
                    serde_json::json!({
                        "project_id": project.id.to_string(),
                        "editor_type": payload.as_ref().and_then(|req| req.editor_type.as_ref()),
                        "remote_mode": url.is_some(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(OpenEditorResponse {
                url,
            })))
        }
        Err(e) => {
            tracing::error!("Failed to open editor for project {}: {:?}", project.id, e);
            Err(ApiError::EditorOpen(e))
        }
    }
}

pub async fn search_project_files(
    State(deployment): State<DeploymentImpl>,
    Extension(project): Extension<Project>,
    Query(search_query): Query<SearchQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<SearchResult>>>, StatusCode> {
    let query = search_query.q.trim();
    let mode = search_query.mode;

    if query.is_empty() {
        return Ok(ResponseJson(ApiResponse::error(
            "Query parameter 'q' is required and cannot be empty",
        )));
    }

    let repo_path = &project.git_repo_path;
    let file_search_cache = deployment.file_search_cache();

    // Try cache first
    match file_search_cache
        .search(repo_path, query, mode.clone())
        .await
    {
        Ok(results) => {
            tracing::debug!(
                "Cache hit for repo {:?}, query: {}, mode: {:?}",
                repo_path,
                query,
                mode
            );
            Ok(ResponseJson(ApiResponse::success(results)))
        }
        Err(CacheError::Miss) => {
            // Cache miss - fall back to filesystem search
            tracing::debug!(
                "Cache miss for repo {:?}, query: {}, mode: {:?}",
                repo_path,
                query,
                mode
            );
            match search_files_in_repo(&project.git_repo_path.to_string_lossy(), query, mode).await
            {
                Ok(results) => Ok(ResponseJson(ApiResponse::success(results))),
                Err(e) => {
                    tracing::error!("Failed to search files: {}", e);
                    Err(StatusCode::INTERNAL_SERVER_ERROR)
                }
            }
        }
        Err(CacheError::BuildError(e)) => {
            tracing::error!("Cache build error for repo {:?}: {}", repo_path, e);
            // Fall back to filesystem search
            match search_files_in_repo(&project.git_repo_path.to_string_lossy(), query, mode).await
            {
                Ok(results) => Ok(ResponseJson(ApiResponse::success(results))),
                Err(e) => {
                    tracing::error!("Failed to search files: {}", e);
                    Err(StatusCode::INTERNAL_SERVER_ERROR)
                }
            }
        }
    }
}

async fn search_files_in_repo(
    repo_path: &str,
    query: &str,
    mode: SearchMode,
) -> Result<Vec<SearchResult>, Box<dyn std::error::Error + Send + Sync>> {
    let repo_path = StdPath::new(repo_path);

    if !repo_path.exists() {
        return Err("Repository path does not exist".into());
    }

    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    // Configure walker based on mode
    let walker = match mode {
        SearchMode::Settings => {
            // Settings mode: Include ignored files but exclude performance killers
            WalkBuilder::new(repo_path)
                .git_ignore(false) // Include ignored files like .env
                .git_global(false)
                .git_exclude(false)
                .hidden(false)
                .filter_entry(|entry| {
                    let name = entry.file_name().to_string_lossy();
                    // Always exclude .git directories and performance killers
                    name != ".git"
                        && name != "node_modules"
                        && name != "target"
                        && name != "dist"
                        && name != "build"
                })
                .build()
        }
        SearchMode::TaskForm => {
            // Task form mode: Respect gitignore (cleaner results)
            WalkBuilder::new(repo_path)
                .git_ignore(true) // Respect .gitignore
                .git_global(true) // Respect global .gitignore
                .git_exclude(true) // Respect .git/info/exclude
                .hidden(false) // Still show hidden files like .env (if not gitignored)
                .filter_entry(|entry| {
                    let name = entry.file_name().to_string_lossy();
                    name != ".git"
                })
                .build()
        }
    };

    for result in walker {
        let entry = result?;
        let path = entry.path();

        // Skip the root directory itself
        if path == repo_path {
            continue;
        }

        let relative_path = path.strip_prefix(repo_path)?;
        let relative_path_str = relative_path.to_string_lossy().to_lowercase();

        let file_name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        // Check for matches
        if file_name.contains(&query_lower) {
            results.push(SearchResult {
                path: relative_path.to_string_lossy().to_string(),
                is_file: path.is_file(),
                match_type: SearchMatchType::FileName,
            });
        } else if relative_path_str.contains(&query_lower) {
            // Check if it's a directory name match or full path match
            let match_type = if path
                .parent()
                .and_then(|p| p.file_name())
                .map(|name| name.to_string_lossy().to_lowercase())
                .unwrap_or_default()
                .contains(&query_lower)
            {
                SearchMatchType::DirectoryName
            } else {
                SearchMatchType::FullPath
            };

            results.push(SearchResult {
                path: relative_path.to_string_lossy().to_string(),
                is_file: path.is_file(),
                match_type,
            });
        }
    }

    // Apply git history-based ranking
    let file_ranker = FileRanker::new();
    match file_ranker.get_stats(repo_path).await {
        Ok(stats) => {
            // Re-rank results using git history
            file_ranker.rerank(&mut results, &stats);
        }
        Err(e) => {
            tracing::warn!(
                "Failed to get git stats for ranking, using basic sort: {}",
                e
            );
            // Fallback to basic priority sorting
            results.sort_by(|a, b| {
                let priority = |match_type: &SearchMatchType| match match_type {
                    SearchMatchType::FileName => 0,
                    SearchMatchType::DirectoryName => 1,
                    SearchMatchType::FullPath => 2,
                };

                priority(&a.match_type)
                    .cmp(&priority(&b.match_type))
                    .then_with(|| a.path.cmp(&b.path))
            });
        }
    }

    // Limit to top 10 results
    results.truncate(10);

    Ok(results)
}

pub async fn scan_project_config(
    Json(payload): Json<ScanConfigRequest>,
) -> Result<ResponseJson<ApiResponse<ScanConfigResponse>>, ApiError> {
    let repo_path = std::path::absolute(expand_tilde(&payload.repo_path))?;

    if !repo_path.exists() {
        return Ok(ResponseJson(ApiResponse::error(
            "Repository path does not exist",
        )));
    }

    match ProjectDetector::scan_repo(&repo_path) {
        Ok(suggestions) => Ok(ResponseJson(ApiResponse::success(ScanConfigResponse {
            suggestions,
        }))),
        Err(e) => {
            tracing::error!("Failed to scan project config: {}", e);
            Err(ApiError::BadRequest(format!(
                "Failed to scan project: {}",
                e
            )))
        }
    }
}

// ============================================================================
// File Browser Endpoints for Main Project
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ListProjectFilesQuery {
    /// Relative path within the project (optional, defaults to root)
    path: Option<String>,
}

/// List files and directories within a project's git repository
pub async fn list_project_files(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListProjectFilesQuery>,
) -> Result<ResponseJson<ApiResponse<DirectoryListResponse>>, ApiError> {
    match deployment
        .filesystem()
        .list_directory_within(&project.git_repo_path, query.path.as_deref())
        .await
    {
        Ok(response) => Ok(ResponseJson(ApiResponse::success(response))),
        Err(FilesystemError::DirectoryDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("Directory does not exist")))
        }
        Err(FilesystemError::PathIsNotDirectory) => {
            Ok(ResponseJson(ApiResponse::error("Path is not a directory")))
        }
        Err(FilesystemError::PathTraversalNotAllowed) => Ok(ResponseJson(ApiResponse::error(
            "Path traversal not allowed",
        ))),
        Err(FilesystemError::Io(e)) => {
            tracing::error!("Failed to list project directory: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to list directory: {}",
                e
            ))))
        }
        Err(e) => {
            tracing::error!("Unexpected error listing project: {}", e);
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

/// Read file content from a project's git repository
pub async fn read_project_file(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Path((_project_id, file_path)): Path<(Uuid, String)>,
) -> Result<ResponseJson<ApiResponse<FileContentResponse>>, ApiError> {
    match deployment
        .filesystem()
        .read_file_within(&project.git_repo_path, &file_path, None)
        .await
    {
        Ok(response) => Ok(ResponseJson(ApiResponse::success(response))),
        Err(FilesystemError::FileDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("File does not exist")))
        }
        Err(FilesystemError::PathIsNotFile) => {
            Ok(ResponseJson(ApiResponse::error("Path is not a file")))
        }
        Err(FilesystemError::PathTraversalNotAllowed) => Ok(ResponseJson(ApiResponse::error(
            "Path traversal not allowed",
        ))),
        Err(FilesystemError::FileIsBinary) => Ok(ResponseJson(ApiResponse::error(
            "Cannot display binary file",
        ))),
        Err(FilesystemError::FileTooLarge {
            max_bytes,
            actual_bytes,
        }) => Ok(ResponseJson(ApiResponse::error(&format!(
            "File too large ({} bytes, max {} bytes)",
            actual_bytes, max_bytes
        )))),
        Err(FilesystemError::Io(e)) => {
            tracing::error!("Failed to read project file: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to read file: {}",
                e
            ))))
        }
        Err(e) => {
            tracing::error!("Unexpected error reading project file: {}", e);
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

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
        .route(
            "/link",
            post(link_project_to_existing_remote).delete(unlink_project),
        )
        .route("/link/create", post(create_and_link_remote_project))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_middleware,
        ));

    // File content route needs to be outside the middleware-wrapped router
    // because it uses a wildcard path parameter
    let project_files_router = Router::new()
        .route("/{id}/files/{*file_path}", get(read_project_file))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_middleware,
        ));

    let projects_router = Router::new()
        .route("/", get(get_projects).post(create_project))
        .route("/scan-config", post(scan_project_config))
        .nest("/{id}", project_id_router)
        .merge(project_files_router);

    Router::new()
        .nest("/projects", projects_router)
        .route("/unified-projects", get(get_unified_projects))
        .route(
            "/remote-projects/{remote_project_id}",
            get(get_remote_project_by_id),
        )
}
