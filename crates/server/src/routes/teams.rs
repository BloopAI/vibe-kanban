use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{delete, get, post},
};
use db::models::github_connection::{
    CreateGitHubConnection, GitHubConnection, GitHubConnectionWithRepos, GitHubRepository,
    LinkGitHubRepository, UpdateGitHubConnection,
};
use db::models::task::{Task, TaskWithAttemptStatus};
use db::models::team::{CreateTeam, Team, TeamProject, TeamProjectAssignment, UpdateTeam};
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

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let team_router = Router::new()
        .route("/", get(get_team).put(update_team).delete(delete_team))
        .route("/issues", get(get_team_issues))
        .route("/migrate-tasks", post(migrate_tasks_to_team))
        .route("/projects", get(get_team_projects).post(assign_project_to_team))
        .route("/projects/{project_id}", delete(remove_project_from_team))
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
        .route("/github/repos/{repo_id}", delete(unlink_github_repository))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    let inner = Router::new()
        .route("/", get(get_teams).post(create_team))
        .route("/validate-storage-path", post(validate_storage_path))
        .nest("/{team_id}", team_router);

    Router::new().nest("/teams", inner)
}
