use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{delete, get, post},
};
use base64::Engine as _;
use db::models::github_connection::{
    ConfigureMultiFolderSync, CreateGitHubConnection, GitHubConnection,
    GitHubConnectionWithRepos, GitHubRepoSyncConfig, GitHubRepository, LinkGitHubRepository,
    UpdateGitHubConnection,
};
use db::models::task::{Task, TaskWithAttemptStatus};
use db::models::team::{CreateTeam, Team, TeamProject, TeamProjectAssignment, UpdateTeam};
use db::models::team_member::{
    CreateTeamInvitation, CreateTeamMember, TeamInvitation, TeamInvitationWithTeam,
    TeamMember, UpdateTeamMemberRole,
};
use serde::{Deserialize, Serialize};
use services::services::document_storage::DocumentStorageService;
use ts_rs::TS;
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_team_middleware};

/// Request to migrate tasks from a project to a team
#[derive(Debug, Deserialize, TS)]
pub struct MigrateTasksRequest {
    /// The project ID to migrate tasks from
    pub project_id: Uuid,
}

/// Response for task migration
#[derive(Debug, serde::Serialize, TS)]
pub struct MigrateTasksResponse {
    /// Number of tasks migrated
    pub migrated_count: usize,
    /// List of migrated task IDs
    pub task_ids: Vec<Uuid>,
}

/// Request to validate a storage path
#[derive(Debug, Deserialize, TS)]
pub struct ValidateStoragePathRequest {
    /// The path to validate
    pub path: String,
}

/// Response for storage path validation
#[derive(Debug, Serialize, TS)]
pub struct ValidateStoragePathResponse {
    /// Whether the path is valid
    pub valid: bool,
    /// Error message if invalid
    pub error: Option<String>,
}

// ============================================================================
// GitHub Sync Types
// ============================================================================

/// A GitHub repository from the API (not yet linked)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubRepoInfo {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub default_branch: Option<String>,
    pub private: bool,
    pub description: Option<String>,
}

/// Request to configure sync for a repository
#[derive(Debug, Deserialize, TS)]
pub struct ConfigureSyncRequest {
    /// Path in the repo where documents will be synced (e.g., "docs/team-notes")
    pub sync_path: String,
    /// The folder ID in vibe-kanban to sync
    pub sync_folder_id: String,
}

/// Request to push documents to GitHub
#[derive(Debug, Deserialize, TS)]
pub struct PushDocumentsRequest {
    /// Commit message for the push
    pub commit_message: Option<String>,
}

/// Response for push/pull operations
#[derive(Debug, Serialize, TS)]
pub struct SyncOperationResponse {
    /// Number of files synced
    pub files_synced: usize,
    /// List of file paths that were synced
    pub synced_files: Vec<String>,
    /// Any warnings or notes
    pub message: Option<String>,
}

/// Get all teams
pub async fn get_teams(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Team>>>, ApiError> {
    let teams = Team::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(teams)))
}

/// Get a single team by ID
pub async fn get_team(
    Extension(team): Extension<Team>,
) -> Result<ResponseJson<ApiResponse<Team>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(team)))
}

/// Create a new team
pub async fn create_team(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTeam>,
) -> Result<ResponseJson<ApiResponse<Team>>, ApiError> {
    let team = Team::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "team_created",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "team_name": team.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(team)))
}

/// Update an existing team
pub async fn update_team(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTeam>,
) -> Result<ResponseJson<ApiResponse<Team>>, ApiError> {
    let updated_team = Team::update(&deployment.db().pool, team.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "team_updated",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "team_name": updated_team.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_team)))
}

/// Delete a team
pub async fn delete_team(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = Team::delete(&deployment.db().pool, team.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "team_deleted",
                serde_json::json!({
                    "team_id": team.id.to_string(),
                }),
            )
            .await;
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

/// Get all project IDs assigned to a team
pub async fn get_team_projects(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Uuid>>>, ApiError> {
    let project_ids = Team::get_projects(&deployment.db().pool, team.id).await?;
    Ok(ResponseJson(ApiResponse::success(project_ids)))
}

/// Assign a project to a team
pub async fn assign_project_to_team(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<TeamProjectAssignment>,
) -> Result<ResponseJson<ApiResponse<TeamProject>>, ApiError> {
    let team_project =
        Team::assign_project(&deployment.db().pool, team.id, payload.project_id).await?;

    deployment
        .track_if_analytics_allowed(
            "team_project_assigned",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "project_id": payload.project_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(team_project)))
}

/// Remove a project from a team
pub async fn remove_project_from_team(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, project_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = Team::remove_project(&deployment.db().pool, team.id, project_id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "team_project_removed",
                serde_json::json!({
                    "team_id": team.id.to_string(),
                    "project_id": project_id.to_string(),
                }),
            )
            .await;
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

/// Get all issues/tasks for a team
pub async fn get_team_issues(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskWithAttemptStatus>>>, ApiError> {
    let tasks = Task::find_by_team_id_with_attempt_status(&deployment.db().pool, team.id).await?;
    Ok(ResponseJson(ApiResponse::success(tasks)))
}

/// Migrate tasks from a project to a team
/// This converts project tasks into team issues with auto-assigned issue numbers
pub async fn migrate_tasks_to_team(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<MigrateTasksRequest>,
) -> Result<ResponseJson<ApiResponse<MigrateTasksResponse>>, ApiError> {
    let migrated_tasks = Task::migrate_project_tasks_to_team(
        &deployment.db().pool,
        payload.project_id,
        team.id,
    )
    .await?;

    let task_ids: Vec<Uuid> = migrated_tasks.iter().map(|t| t.id).collect();
    let migrated_count = task_ids.len();

    deployment
        .track_if_analytics_allowed(
            "tasks_migrated_to_team",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "project_id": payload.project_id.to_string(),
                "migrated_count": migrated_count,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(MigrateTasksResponse {
        migrated_count,
        task_ids,
    })))
}

/// Validate a storage path for document storage
pub async fn validate_storage_path(
    Json(payload): Json<ValidateStoragePathRequest>,
) -> Result<ResponseJson<ApiResponse<ValidateStoragePathResponse>>, ApiError> {
    match DocumentStorageService::validate_storage_path(&payload.path).await {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(
            ValidateStoragePathResponse {
                valid: true,
                error: None,
            },
        ))),
        Err(e) => Ok(ResponseJson(ApiResponse::success(
            ValidateStoragePathResponse {
                valid: false,
                error: Some(e.to_string()),
            },
        ))),
    }
}

// ============================================================================
// GitHub Connection Routes
// ============================================================================

/// Get GitHub connection for a team (with linked repositories)
pub async fn get_github_connection(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Option<GitHubConnectionWithRepos>>>, ApiError> {
    let connection = GitHubConnection::find_by_team_id(&deployment.db().pool, team.id).await?;

    match connection {
        Some(conn) => {
            let repositories =
                GitHubRepository::find_by_connection_id(&deployment.db().pool, conn.id).await?;
            Ok(ResponseJson(ApiResponse::success(Some(
                GitHubConnectionWithRepos {
                    connection: conn,
                    repositories,
                },
            ))))
        }
        None => Ok(ResponseJson(ApiResponse::success(None))),
    }
}

/// Create a new GitHub connection for a team
pub async fn create_github_connection(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateGitHubConnection>,
) -> Result<ResponseJson<ApiResponse<GitHubConnection>>, ApiError> {
    // Check if connection already exists
    let existing = GitHubConnection::find_by_team_id(&deployment.db().pool, team.id).await?;
    if existing.is_some() {
        return Err(ApiError::BadRequest(
            "GitHub connection already exists for this team. Use PUT to update.".to_string(),
        ));
    }

    let connection = GitHubConnection::create(&deployment.db().pool, team.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "github_connection_created",
            serde_json::json!({
                "team_id": team.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(connection)))
}

/// Update an existing GitHub connection
pub async fn update_github_connection(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateGitHubConnection>,
) -> Result<ResponseJson<ApiResponse<GitHubConnection>>, ApiError> {
    let existing = GitHubConnection::find_by_team_id(&deployment.db().pool, team.id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?;

    let updated = GitHubConnection::update(&deployment.db().pool, existing.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "github_connection_updated",
            serde_json::json!({
                "team_id": team.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated)))
}

/// Delete a GitHub connection for a team
pub async fn delete_github_connection(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = GitHubConnection::delete_by_team_id(&deployment.db().pool, team.id).await?;
    if rows_affected == 0 {
        return Err(ApiError::NotFound("GitHub connection not found".to_string()));
    }

    deployment
        .track_if_analytics_allowed(
            "github_connection_deleted",
            serde_json::json!({
                "team_id": team.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Get linked GitHub repositories for a team's connection
pub async fn get_github_repositories(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubRepository>>>, ApiError> {
    let connection = GitHubConnection::find_by_team_id(&deployment.db().pool, team.id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?;

    let repositories =
        GitHubRepository::find_by_connection_id(&deployment.db().pool, connection.id).await?;

    Ok(ResponseJson(ApiResponse::success(repositories)))
}

/// Link a GitHub repository to a team's connection
pub async fn link_github_repository(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<LinkGitHubRepository>,
) -> Result<ResponseJson<ApiResponse<GitHubRepository>>, ApiError> {
    let connection = GitHubConnection::find_by_team_id(&deployment.db().pool, team.id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?;

    let repository = GitHubRepository::link(&deployment.db().pool, connection.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "github_repository_linked",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "repo_full_name": payload.repo_full_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(repository)))
}

/// Unlink a GitHub repository from a team's connection
pub async fn unlink_github_repository(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, repo_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = GitHubRepository::unlink(&deployment.db().pool, repo_id).await?;
    if rows_affected == 0 {
        return Err(ApiError::NotFound("GitHub repository not found".to_string()));
    }

    deployment
        .track_if_analytics_allowed(
            "github_repository_unlinked",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "repo_id": repo_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

// ============================================================================
// GitHub Sync Routes
// ============================================================================

/// Fetch available GitHub repositories from the user's account
pub async fn get_available_github_repos(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubRepoInfo>>>, ApiError> {
    let connection = GitHubConnection::find_by_team_id(&deployment.db().pool, team.id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?;

    // Fetch repos from GitHub API
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/user/repos")
        .header("Authorization", format!("Bearer {}", connection.access_token))
        .header("User-Agent", "vibe-kanban")
        .query(&[("per_page", "100"), ("sort", "updated")])
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to fetch repos: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ApiError::BadRequest(format!(
            "GitHub API error ({}): {}",
            status, body
        )));
    }

    let repos: Vec<GitHubRepoInfo> = response
        .json()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Invalid response from GitHub: {}", e)))?;

    Ok(ResponseJson(ApiResponse::success(repos)))
}

/// Configure sync settings for a linked repository
pub async fn configure_repo_sync(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, repo_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ConfigureSyncRequest>,
) -> Result<ResponseJson<ApiResponse<GitHubRepository>>, ApiError> {
    // Verify the repo belongs to this team's connection
    let connection = GitHubConnection::find_by_team_id(&deployment.db().pool, team.id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?;

    let repo = GitHubRepository::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Repository not found".to_string()))?;

    if repo.connection_id != connection.id {
        return Err(ApiError::BadRequest(
            "Repository does not belong to this team".to_string(),
        ));
    }

    // Update sync configuration
    let updated = GitHubRepository::configure_sync(
        &deployment.db().pool,
        repo_id,
        &payload.sync_path,
        &payload.sync_folder_id,
    )
    .await?;

    deployment
        .track_if_analytics_allowed(
            "github_sync_configured",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "repo_id": repo_id.to_string(),
                "sync_path": payload.sync_path,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated)))
}

/// Clear sync configuration for a repository
pub async fn clear_repo_sync(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, repo_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<GitHubRepository>>, ApiError> {
    // Verify the repo belongs to this team's connection
    let connection = GitHubConnection::find_by_team_id(&deployment.db().pool, team.id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?;

    let repo = GitHubRepository::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Repository not found".to_string()))?;

    if repo.connection_id != connection.id {
        return Err(ApiError::BadRequest(
            "Repository does not belong to this team".to_string(),
        ));
    }

    let updated = GitHubRepository::clear_sync(&deployment.db().pool, repo_id).await?;

    Ok(ResponseJson(ApiResponse::success(updated)))
}

/// Push documents from a folder to GitHub repository
pub async fn push_documents_to_github(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, repo_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<PushDocumentsRequest>,
) -> Result<ResponseJson<ApiResponse<SyncOperationResponse>>, ApiError> {
    use db::models::document::{Document, DocumentFolder};
    use services::services::document_storage::DocumentStorageService;
    use utils::assets::asset_dir;

    // Get connection (try team-level first, then fall back to workspace-level)
    let connection = match GitHubConnection::find_by_team_id(&deployment.db().pool, team.id).await? {
        Some(conn) => conn,
        None => GitHubConnection::find_workspace_connection(&deployment.db().pool)
            .await?
            .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?,
    };

    let repo = GitHubRepository::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Repository not found".to_string()))?;

    // Verify repository belongs to this connection
    if repo.connection_id != connection.id {
        return Err(ApiError::BadRequest(
            "Repository does not belong to this connection".to_string(),
        ));
    }

    // Get multi-folder sync configs (new approach)
    let sync_configs = GitHubRepoSyncConfig::find_by_repo_id(&deployment.db().pool, repo_id).await?;

    // Build list of (folder_id, github_path) pairs
    let folder_sync_list: Vec<(Option<Uuid>, String)> = if !sync_configs.is_empty() {
        // Use multi-folder sync configs
        let mut list = Vec::new();
        for config in &sync_configs {
            let folder_id = if config.folder_id == "root" {
                None
            } else {
                Uuid::parse_str(&config.folder_id).ok()
            };
            // Use github_path or fall back to folder name
            let github_path = if let Some(ref path) = config.github_path {
                if !path.is_empty() {
                    path.clone()
                } else {
                    // Empty github_path: use folder name
                    if let Some(fid) = folder_id {
                        if let Ok(Some(folder)) = DocumentFolder::find_by_id(&deployment.db().pool, fid).await {
                            folder.name.clone()
                        } else {
                            "docs".to_string()
                        }
                    } else {
                        "docs".to_string() // root folder
                    }
                }
            } else {
                // Null github_path: use folder name
                if let Some(fid) = folder_id {
                    if let Ok(Some(folder)) = DocumentFolder::find_by_id(&deployment.db().pool, fid).await {
                        folder.name.clone()
                    } else {
                        "docs".to_string()
                    }
                } else {
                    "docs".to_string() // root folder
                }
            };
            list.push((folder_id, github_path));
        }
        list
    } else {
        // Fall back to legacy single-folder sync
        let sync_path = repo
            .sync_path
            .as_ref()
            .ok_or_else(|| ApiError::BadRequest("Sync not configured for this repository".to_string()))?;

        let sync_folder_id = repo
            .sync_folder_id
            .as_ref()
            .ok_or_else(|| ApiError::BadRequest("Sync folder not configured".to_string()))?;

        let folder_id = if sync_folder_id == "root" {
            None
        } else {
            Uuid::parse_str(sync_folder_id).ok()
        };
        vec![(folder_id, sync_path.clone())]
    };

    let storage = DocumentStorageService::new(asset_dir());
    let client = reqwest::Client::new();
    let mut synced_files = Vec::new();
    let mut total_docs = 0;

    for (folder_id, github_path) in folder_sync_list {
        // Get documents from the folder
        let mut folder_docs = Document::find_by_folder(&deployment.db().pool, team.id, folder_id).await?;
        total_docs += folder_docs.len();

        // Load content from filesystem for documents that have file_path
        for doc in &mut folder_docs {
            if let Some(ref file_path) = doc.file_path {
                if doc.content.is_none() {
                    match storage.read_document(file_path).await {
                        Ok(content) => doc.content = Some(content),
                        Err(e) => {
                            tracing::warn!("Failed to read document content from {}: {}", file_path, e);
                        }
                    }
                }
            }
        }

        // Build set of local document filenames (using original filenames)
        let local_filenames: std::collections::HashSet<String> = folder_docs
            .iter()
            .map(|d| {
                if let Some(ref fp) = d.file_path {
                    std::path::Path::new(fp)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| format!("{}.{}", d.title.replace(" ", "-"), d.file_type))
                } else {
                    format!("{}.{}", d.title.replace(" ", "-"), d.file_type)
                }
            })
            .collect();

        // List existing files on GitHub to detect deletions
        let list_response = client
            .get(format!(
                "https://api.github.com/repos/{}/contents/{}",
                repo.repo_full_name, github_path
            ))
            .header("Authorization", format!("Bearer {}", connection.access_token))
            .header("User-Agent", "vibe-kanban")
            .query(&[("ref", repo.default_branch.as_deref().unwrap_or("main"))])
            .send()
            .await;

        // Delete files that exist on GitHub but not locally
        if let Ok(resp) = list_response {
            if resp.status().is_success() {
                if let Ok(files) = resp.json::<Vec<serde_json::Value>>().await {
                    for file in files {
                        let file_name = file.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        let file_type = file.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        let file_sha = file.get("sha").and_then(|s| s.as_str());

                        // Only process files (not directories)
                        if file_type != "file" {
                            continue;
                        }

                        // If file doesn't exist locally, delete it from GitHub
                        if !local_filenames.contains(file_name) {
                            if let Some(sha) = file_sha {
                                let delete_path = format!("{}/{}", github_path, file_name);
                                let delete_body = serde_json::json!({
                                    "message": format!("Delete {}", file_name),
                                    "sha": sha,
                                    "branch": repo.default_branch.clone().unwrap_or_else(|| "main".to_string())
                                });

                                let delete_response = client
                                    .delete(format!(
                                        "https://api.github.com/repos/{}/contents/{}",
                                        repo.repo_full_name, delete_path
                                    ))
                                    .header("Authorization", format!("Bearer {}", connection.access_token))
                                    .header("User-Agent", "vibe-kanban")
                                    .json(&delete_body)
                                    .send()
                                    .await;

                                if let Ok(del_resp) = delete_response {
                                    if del_resp.status().is_success() {
                                        tracing::info!("Deleted {} from GitHub", delete_path);
                                        synced_files.push(format!("DELETED: {}", delete_path));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        for doc in &folder_docs {
            // Determine the filename - use original from file_path or construct from title + file_type
            let filename = if let Some(ref fp) = doc.file_path {
                // Extract filename from file_path
                std::path::Path::new(fp)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("{}.{}", doc.title.replace(" ", "-"), doc.file_type))
            } else {
                // Construct from title and file_type
                format!("{}.{}", doc.title.replace(" ", "-"), doc.file_type)
            };

            let github_file_path = format!("{}/{}", github_path, filename);

            // Get file content as bytes - either from filesystem or from content field
            let file_bytes: Vec<u8> = if let Some(ref fp) = doc.file_path {
                // Read from filesystem (works for binary files like PDFs)
                match tokio::fs::read(fp).await {
                    Ok(bytes) => bytes,
                    Err(e) => {
                        tracing::warn!("Failed to read file {}: {}", fp, e);
                        // Fall back to content field if available
                        doc.content.clone().unwrap_or_default().into_bytes()
                    }
                }
            } else {
                // Use content field
                doc.content.clone().unwrap_or_default().into_bytes()
            };

            // Skip empty files
            if file_bytes.is_empty() {
                tracing::warn!("Skipping empty file: {}", github_file_path);
                continue;
            }

            // Create or update file via GitHub API
            // First, try to get the file SHA if it exists
            let get_response = client
                .get(format!(
                    "https://api.github.com/repos/{}/contents/{}",
                    repo.repo_full_name, github_file_path
                ))
                .header("Authorization", format!("Bearer {}", connection.access_token))
                .header("User-Agent", "vibe-kanban")
                .send()
                .await;

            let sha = if let Ok(resp) = get_response {
                if resp.status().is_success() {
                    resp.json::<serde_json::Value>()
                        .await
                        .ok()
                        .and_then(|v| v.get("sha").and_then(|s| s.as_str()).map(|s| s.to_string()))
                } else {
                    None
                }
            } else {
                None
            };

            // Prepare the request body with base64 encoded content
            let mut body = serde_json::json!({
                "message": payload.commit_message.clone().unwrap_or_else(|| format!("Update {}", filename)),
                "content": base64::engine::general_purpose::STANDARD.encode(&file_bytes),
                "branch": repo.default_branch.clone().unwrap_or_else(|| "main".to_string())
            });

            if let Some(sha) = sha {
                body["sha"] = serde_json::Value::String(sha);
            }

            let put_response = client
                .put(format!(
                    "https://api.github.com/repos/{}/contents/{}",
                    repo.repo_full_name, github_file_path
                ))
                .header("Authorization", format!("Bearer {}", connection.access_token))
                .header("User-Agent", "vibe-kanban")
                .json(&body)
                .send()
                .await
                .map_err(|e| ApiError::BadRequest(format!("Failed to push file: {}", e)))?;

            if put_response.status().is_success() {
                synced_files.push(github_file_path);
            } else {
                let error = put_response.text().await.unwrap_or_default();
                tracing::warn!("Failed to push {}: {}", filename, error);
            }
        }
    }

    // Update last synced timestamp
    GitHubRepository::update_last_synced(&deployment.db().pool, repo_id).await?;

    deployment
        .track_if_analytics_allowed(
            "github_documents_pushed",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "repo_id": repo_id.to_string(),
                "files_count": synced_files.len(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(SyncOperationResponse {
        files_synced: synced_files.len(),
        synced_files,
        message: Some(format!("Pushed {} documents to GitHub", total_docs)),
    })))
}

/// Pull documents from GitHub repository to a folder
pub async fn pull_documents_from_github(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, repo_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<SyncOperationResponse>>, ApiError> {
    use db::models::document::{CreateDocument, Document, DocumentFolder, UpdateDocument};

    // Get connection (try team-level first, then fall back to workspace-level)
    let connection = match GitHubConnection::find_by_team_id(&deployment.db().pool, team.id).await? {
        Some(conn) => conn,
        None => GitHubConnection::find_workspace_connection(&deployment.db().pool)
            .await?
            .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?,
    };

    let repo = GitHubRepository::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Repository not found".to_string()))?;

    // Verify repository belongs to this connection
    if repo.connection_id != connection.id {
        return Err(ApiError::BadRequest(
            "Repository does not belong to this connection".to_string(),
        ));
    }

    // Get multi-folder sync configs (new approach)
    let sync_configs = GitHubRepoSyncConfig::find_by_repo_id(&deployment.db().pool, repo_id).await?;

    // Build list of (folder_id, github_path) pairs
    let folder_sync_list: Vec<(Option<Uuid>, String)> = if !sync_configs.is_empty() {
        // Use multi-folder sync configs
        let mut list = Vec::new();
        for config in &sync_configs {
            let folder_id = if config.folder_id == "root" {
                None
            } else {
                Uuid::parse_str(&config.folder_id).ok()
            };
            // Use github_path or fall back to folder name
            let github_path = if let Some(ref path) = config.github_path {
                if !path.is_empty() {
                    path.clone()
                } else {
                    // Empty github_path: use folder name
                    if let Some(fid) = folder_id {
                        if let Ok(Some(folder)) = DocumentFolder::find_by_id(&deployment.db().pool, fid).await {
                            folder.name.clone()
                        } else {
                            "docs".to_string()
                        }
                    } else {
                        "docs".to_string() // root folder
                    }
                }
            } else {
                // Null github_path: use folder name
                if let Some(fid) = folder_id {
                    if let Ok(Some(folder)) = DocumentFolder::find_by_id(&deployment.db().pool, fid).await {
                        folder.name.clone()
                    } else {
                        "docs".to_string()
                    }
                } else {
                    "docs".to_string() // root folder
                }
            };
            list.push((folder_id, github_path));
        }
        list
    } else {
        // Fall back to legacy single-folder sync
        let sync_path = repo
            .sync_path
            .as_ref()
            .ok_or_else(|| ApiError::BadRequest("Sync not configured for this repository".to_string()))?;

        let sync_folder_id = repo
            .sync_folder_id
            .as_ref()
            .ok_or_else(|| ApiError::BadRequest("Sync folder not configured".to_string()))?;

        let folder_id = if sync_folder_id == "root" {
            None
        } else {
            Uuid::parse_str(sync_folder_id).ok()
        };
        vec![(folder_id, sync_path.clone())]
    };

    let client = reqwest::Client::new();
    let mut synced_files = Vec::new();

    for (folder_id, github_path) in folder_sync_list {
        // List files in the sync path
        let list_response = client
            .get(format!(
                "https://api.github.com/repos/{}/contents/{}",
                repo.repo_full_name, github_path
            ))
            .header("Authorization", format!("Bearer {}", connection.access_token))
            .header("User-Agent", "vibe-kanban")
            .query(&[("ref", repo.default_branch.as_deref().unwrap_or("main"))])
            .send()
            .await
            .map_err(|e| ApiError::BadRequest(format!("Failed to list files: {}", e)))?;

        if !list_response.status().is_success() {
            if list_response.status() == reqwest::StatusCode::NOT_FOUND {
                // Skip this folder if the path doesn't exist
                tracing::info!("Sync path {} does not exist in repository, skipping", github_path);
                continue;
            }
            let error = list_response.text().await.unwrap_or_default();
            return Err(ApiError::BadRequest(format!("Failed to list files: {}", error)));
        }

        let files: Vec<serde_json::Value> = list_response
            .json()
            .await
            .map_err(|e| ApiError::BadRequest(format!("Invalid response: {}", e)))?;

        // Build set of GitHub filenames (normalized for comparison)
        let normalize_filename = |name: &str| -> String {
            name.trim_end_matches(".md")
                .to_lowercase()
                .replace("-", " ")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        };
        let github_filenames: std::collections::HashSet<String> = files
            .iter()
            .filter_map(|f| {
                let name = f.get("name").and_then(|n| n.as_str())?;
                let ftype = f.get("type").and_then(|t| t.as_str())?;
                if ftype == "file" && name.ends_with(".md") {
                    Some(normalize_filename(name))
                } else {
                    None
                }
            })
            .collect();

        // Delete local documents that don't exist on GitHub
        let local_docs = Document::find_by_folder(&deployment.db().pool, team.id, folder_id).await?;
        for doc in &local_docs {
            let normalized_doc_title = doc.title.to_lowercase()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            if !github_filenames.contains(&normalized_doc_title) {
                // Document doesn't exist on GitHub, delete it locally
                Document::delete(&deployment.db().pool, doc.id).await?;
                tracing::info!("Deleted local document '{}' (not on GitHub)", doc.title);
                synced_files.push(format!("DELETED: {}", doc.title));
            }
        }

        for file in files {
            let file_name = file.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let file_type = file.get("type").and_then(|t| t.as_str()).unwrap_or("");
            let download_url = file.get("download_url").and_then(|u| u.as_str());

            // Only process markdown files
            if file_type != "file" || !file_name.ends_with(".md") {
                continue;
            }

            if let Some(url) = download_url {
                // Download file content
                let content_response = client
                    .get(url)
                    .header("User-Agent", "vibe-kanban")
                    .send()
                    .await;

                if let Ok(resp) = content_response {
                    if resp.status().is_success() {
                        if let Ok(content) = resp.text().await {
                            // Create document title from filename
                            let title = file_name
                                .trim_end_matches(".md")
                                .replace("-", " ")
                                .split_whitespace()
                                .map(|w| {
                                    let mut chars = w.chars();
                                    match chars.next() {
                                        Some(c) => c.to_uppercase().chain(chars).collect(),
                                        None => String::new(),
                                    }
                                })
                                .collect::<Vec<String>>()
                                .join(" ");

                            // Check if document already exists in this folder
                            // Use normalized comparison to match regardless of case/spacing
                            let existing_docs = Document::find_by_folder(&deployment.db().pool, team.id, folder_id).await?;
                            let normalize_title = |t: &str| -> String {
                                t.to_lowercase()
                                    .chars()
                                    .filter(|c| c.is_alphanumeric() || c.is_whitespace())
                                    .collect::<String>()
                                    .split_whitespace()
                                    .collect::<Vec<_>>()
                                    .join(" ")
                            };
                            let normalized_title = normalize_title(&title);
                            let existing = existing_docs.into_iter().find(|d| normalize_title(&d.title) == normalized_title);

                            if let Some(doc) = existing {
                                // Update existing document
                                let update = UpdateDocument {
                                    folder_id: None,
                                    title: None,
                                    content: Some(content),
                                    icon: None,
                                    is_pinned: None,
                                    is_archived: None,
                                    position: None,
                                };
                                Document::update(&deployment.db().pool, doc.id, &update).await?;
                            } else {
                                // Create new document
                                let create = CreateDocument {
                                    team_id: team.id,
                                    folder_id,
                                    title: title.clone(),
                                    content: Some(content),
                                    file_type: Some("markdown".to_string()),
                                    icon: None,
                                };
                                Document::create(&deployment.db().pool, &create).await?;
                            }

                            synced_files.push(format!("{}/{}", github_path, file_name));
                        }
                    }
                }
            }
        }
    }

    // Update last synced timestamp
    GitHubRepository::update_last_synced(&deployment.db().pool, repo_id).await?;

    deployment
        .track_if_analytics_allowed(
            "github_documents_pulled",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "repo_id": repo_id.to_string(),
                "files_count": synced_files.len(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(SyncOperationResponse {
        files_synced: synced_files.len(),
        synced_files,
        message: Some("Pulled documents from GitHub".to_string()),
    })))
}

/// Get sync configurations for a repository
pub async fn get_repo_sync_configs(
    Extension(_team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, repo_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubRepoSyncConfig>>>, ApiError> {
    // Try workspace-level connection first, fall back to team-level
    let connection = GitHubConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?;

    let repo = GitHubRepository::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Repository not found".to_string()))?;

    if repo.connection_id != connection.id {
        return Err(ApiError::BadRequest(
            "Repository does not belong to this workspace".to_string(),
        ));
    }

    let configs = GitHubRepoSyncConfig::find_by_repo_id(&deployment.db().pool, repo_id).await?;
    Ok(ResponseJson(ApiResponse::success(configs)))
}

/// Configure multi-folder sync for a repository
pub async fn configure_multi_folder_sync(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, repo_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ConfigureMultiFolderSync>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubRepoSyncConfig>>>, ApiError> {
    // Try workspace-level connection first
    let connection = GitHubConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?;

    let repo = GitHubRepository::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Repository not found".to_string()))?;

    if repo.connection_id != connection.id {
        return Err(ApiError::BadRequest(
            "Repository does not belong to this workspace".to_string(),
        ));
    }

    // Clear existing configs and add new ones
    GitHubRepoSyncConfig::delete_by_repo_id(&deployment.db().pool, repo_id).await?;

    let mut configs = Vec::new();
    for folder_config in payload.folder_configs {
        let config = GitHubRepoSyncConfig::upsert(
            &deployment.db().pool,
            repo_id,
            &folder_config.folder_id,
            folder_config.github_path.as_deref(),
        )
        .await?;
        configs.push(config);
    }

    deployment
        .track_if_analytics_allowed(
            "github_multi_folder_sync_configured",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "repo_id": repo_id.to_string(),
                "folder_count": configs.len(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(configs)))
}

/// Clear all sync configurations for a repository
pub async fn clear_multi_folder_sync(
    Extension(_team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, repo_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Try workspace-level connection first
    let connection = GitHubConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub connection not found".to_string()))?;

    let repo = GitHubRepository::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Repository not found".to_string()))?;

    if repo.connection_id != connection.id {
        return Err(ApiError::BadRequest(
            "Repository does not belong to this workspace".to_string(),
        ));
    }

    GitHubRepoSyncConfig::delete_by_repo_id(&deployment.db().pool, repo_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

// ============================================================================
// Team Members Routes
// ============================================================================

/// Get all members of a team
pub async fn get_team_members(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TeamMember>>>, ApiError> {
    let members = TeamMember::find_by_team(&deployment.db().pool, team.id).await?;
    Ok(ResponseJson(ApiResponse::success(members)))
}

/// Add a member directly to a team (without invitation)
pub async fn add_team_member(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTeamMember>,
) -> Result<ResponseJson<ApiResponse<TeamMember>>, ApiError> {
    // Check if member already exists
    let existing = TeamMember::find_by_team_and_email(&deployment.db().pool, team.id, &payload.email).await?;
    if existing.is_some() {
        return Err(ApiError::BadRequest("Member with this email already exists in the team".to_string()));
    }

    let member = TeamMember::create(&deployment.db().pool, team.id, &payload, None).await?;

    deployment
        .track_if_analytics_allowed(
            "team_member_added",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "member_email": payload.email,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(member)))
}

/// Update a team member's role
pub async fn update_team_member_role(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, member_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateTeamMemberRole>,
) -> Result<ResponseJson<ApiResponse<TeamMember>>, ApiError> {
    // Verify the member belongs to this team
    let existing = TeamMember::find_by_id(&deployment.db().pool, member_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Team member not found".to_string()))?;

    if existing.team_id != team.id {
        return Err(ApiError::BadRequest("Member does not belong to this team".to_string()));
    }

    let updated = TeamMember::update_role(&deployment.db().pool, member_id, payload.role).await?;

    deployment
        .track_if_analytics_allowed(
            "team_member_role_updated",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "member_id": member_id.to_string(),
                "new_role": payload.role.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated)))
}

/// Remove a member from a team
pub async fn remove_team_member(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, member_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Verify the member belongs to this team
    let existing = TeamMember::find_by_id(&deployment.db().pool, member_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Team member not found".to_string()))?;

    if existing.team_id != team.id {
        return Err(ApiError::BadRequest("Member does not belong to this team".to_string()));
    }

    let rows_affected = TeamMember::delete(&deployment.db().pool, member_id).await?;
    if rows_affected == 0 {
        return Err(ApiError::NotFound("Team member not found".to_string()));
    }

    deployment
        .track_if_analytics_allowed(
            "team_member_removed",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "member_id": member_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

// ============================================================================
// Team Invitations Routes
// ============================================================================

/// Get all pending invitations for a team
pub async fn get_team_invitations(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TeamInvitation>>>, ApiError> {
    let invitations = TeamInvitation::find_pending_by_team(&deployment.db().pool, team.id).await?;
    Ok(ResponseJson(ApiResponse::success(invitations)))
}

/// Create an invitation for a team
pub async fn create_team_invitation(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTeamInvitation>,
) -> Result<ResponseJson<ApiResponse<TeamInvitation>>, ApiError> {
    // Check if member already exists
    let existing_member = TeamMember::find_by_team_and_email(&deployment.db().pool, team.id, &payload.email).await?;
    if existing_member.is_some() {
        return Err(ApiError::BadRequest("User is already a member of this team".to_string()));
    }

    let invitation = TeamInvitation::create(&deployment.db().pool, team.id, &payload, None).await?;

    deployment
        .track_if_analytics_allowed(
            "team_invitation_created",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "invited_email": payload.email,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(invitation)))
}

/// Cancel/delete an invitation
pub async fn delete_team_invitation(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, invitation_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Verify the invitation belongs to this team
    let existing = TeamInvitation::find_by_id(&deployment.db().pool, invitation_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Invitation not found".to_string()))?;

    if existing.team_id != team.id {
        return Err(ApiError::BadRequest("Invitation does not belong to this team".to_string()));
    }

    let rows_affected = TeamInvitation::delete(&deployment.db().pool, invitation_id).await?;
    if rows_affected == 0 {
        return Err(ApiError::NotFound("Invitation not found".to_string()));
    }

    deployment
        .track_if_analytics_allowed(
            "team_invitation_cancelled",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "invitation_id": invitation_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

// ============================================================================
// User Invitations Routes (for the invitee)
// ============================================================================

/// Get my pending invitations (by email - for now, we'll use a query param)
pub async fn get_my_invitations(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(params): axum::extract::Query<MyInvitationsQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TeamInvitationWithTeam>>>, ApiError> {
    let invitations = TeamInvitation::find_pending_by_email(&deployment.db().pool, &params.email).await?;
    Ok(ResponseJson(ApiResponse::success(invitations)))
}

#[derive(Debug, Deserialize)]
pub struct MyInvitationsQuery {
    pub email: String,
}

/// Accept an invitation
pub async fn accept_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(invitation_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<TeamMember>>, ApiError> {
    let member = TeamInvitation::accept(&deployment.db().pool, invitation_id)
        .await
        .map_err(|_| ApiError::BadRequest("Invitation not found, already accepted, or expired".to_string()))?;

    deployment
        .track_if_analytics_allowed(
            "team_invitation_accepted",
            serde_json::json!({
                "invitation_id": invitation_id.to_string(),
                "team_id": member.team_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(member)))
}

/// Decline an invitation
pub async fn decline_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(invitation_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    TeamInvitation::decline(&deployment.db().pool, invitation_id).await?;

    deployment
        .track_if_analytics_allowed(
            "team_invitation_declined",
            serde_json::json!({
                "invitation_id": invitation_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let team_router = Router::new()
        .route("/", get(get_team).put(update_team).delete(delete_team))
        .route("/issues", get(get_team_issues))
        .route("/migrate-tasks", post(migrate_tasks_to_team))
        .route("/projects", get(get_team_projects).post(assign_project_to_team))
        .route("/projects/{project_id}", delete(remove_project_from_team))
        // Team members routes
        .route("/members", get(get_team_members).post(add_team_member))
        .route(
            "/members/{member_id}",
            axum::routing::patch(update_team_member_role).delete(remove_team_member),
        )
        // Team invitations routes
        .route(
            "/invitations",
            get(get_team_invitations).post(create_team_invitation),
        )
        .route("/invitations/{invitation_id}", delete(delete_team_invitation))
        // GitHub connection routes
        .route(
            "/github",
            get(get_github_connection)
                .post(create_github_connection)
                .put(update_github_connection)
                .delete(delete_github_connection),
        )
        .route(
            "/github/repos",
            get(get_github_repositories).post(link_github_repository),
        )
        // GitHub sync routes - must come before {repo_id} routes
        .route("/github/repos/available", get(get_available_github_repos))
        .route("/github/repos/{repo_id}", delete(unlink_github_repository))
        .route(
            "/github/repos/{repo_id}/sync",
            post(configure_repo_sync).delete(clear_repo_sync),
        )
        .route(
            "/github/repos/{repo_id}/sync-configs",
            get(get_repo_sync_configs).post(configure_multi_folder_sync).delete(clear_multi_folder_sync),
        )
        .route(
            "/github/repos/{repo_id}/push",
            post(push_documents_to_github),
        )
        .route(
            "/github/repos/{repo_id}/pull",
            post(pull_documents_from_github),
        )
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    let inner = Router::new()
        .route("/", get(get_teams).post(create_team))
        .route("/validate-storage-path", post(validate_storage_path))
        .nest("/{team_id}", team_router);

    // User invitation routes (not under a specific team)
    // Note: using /team-invitations to avoid conflict with /invitations used by organizations
    let invitations_router = Router::new()
        .route("/", get(get_my_invitations))
        .route("/{invitation_id}/accept", post(accept_invitation))
        .route("/{invitation_id}/decline", post(decline_invitation));

    Router::new()
        .nest("/teams", inner)
        .nest("/team-invitations", invitations_router)
}
