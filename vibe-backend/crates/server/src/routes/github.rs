use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{delete, get, post, put},
};
use db::models::github_connection::{
    CreateGitHubConnection, GitHubConnection, GitHubConnectionWithRepos, GitHubRepository,
    LinkGitHubRepository, UpdateGitHubConnection,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

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

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        // Workspace-level GitHub connection endpoints
        .route("/settings/github", get(get_workspace_github_connection))
        .route("/settings/github", post(create_workspace_github_connection))
        .route("/settings/github", put(update_workspace_github_connection))
        .route("/settings/github", delete(delete_workspace_github_connection))
        // Workspace-level repository endpoints
        .route("/settings/github/repos", get(get_workspace_repositories))
        .route("/settings/github/repos/available", get(get_available_github_repos))
        .route("/settings/github/repos", post(link_workspace_repository))
        .route("/settings/github/repos/{repo_id}", delete(unlink_workspace_repository))
        .with_state(deployment.clone())
}

/// Get workspace-level GitHub connection (with linked repositories)
pub async fn get_workspace_github_connection(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Option<GitHubConnectionWithRepos>>>, ApiError> {
    let connection = GitHubConnection::find_workspace_connection(&deployment.db().pool).await?;

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

/// Create a workspace-level GitHub connection
pub async fn create_workspace_github_connection(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateGitHubConnection>,
) -> Result<ResponseJson<ApiResponse<GitHubConnection>>, ApiError> {
    // Check if workspace connection already exists
    let existing = GitHubConnection::find_workspace_connection(&deployment.db().pool).await?;
    if existing.is_some() {
        return Err(ApiError::BadRequest(
            "Workspace GitHub connection already exists. Use PUT to update.".to_string(),
        ));
    }

    let connection =
        GitHubConnection::create_workspace_connection(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workspace_github_connection_created",
            serde_json::json!({}),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(connection)))
}

/// Update the workspace-level GitHub connection
pub async fn update_workspace_github_connection(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateGitHubConnection>,
) -> Result<ResponseJson<ApiResponse<GitHubConnection>>, ApiError> {
    let existing = GitHubConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace GitHub connection not found".to_string()))?;

    let updated = GitHubConnection::update(&deployment.db().pool, existing.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workspace_github_connection_updated",
            serde_json::json!({}),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated)))
}

/// Delete the workspace-level GitHub connection
pub async fn delete_workspace_github_connection(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected =
        GitHubConnection::delete_workspace_connection(&deployment.db().pool).await?;
    if rows_affected == 0 {
        return Err(ApiError::NotFound(
            "Workspace GitHub connection not found".to_string(),
        ));
    }

    deployment
        .track_if_analytics_allowed(
            "workspace_github_connection_deleted",
            serde_json::json!({}),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Get linked GitHub repositories for workspace connection
pub async fn get_workspace_repositories(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubRepository>>>, ApiError> {
    let connection = GitHubConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace GitHub connection not found".to_string()))?;

    let repositories =
        GitHubRepository::find_by_connection_id(&deployment.db().pool, connection.id).await?;

    Ok(ResponseJson(ApiResponse::success(repositories)))
}

/// Fetch available GitHub repositories from the user's account
pub async fn get_available_github_repos(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubRepoInfo>>>, ApiError> {
    let connection = GitHubConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace GitHub connection not found".to_string()))?;

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
        .map_err(|e| ApiError::BadRequest(format!("Failed to parse repos: {}", e)))?;

    Ok(ResponseJson(ApiResponse::success(repos)))
}

/// Link a GitHub repository to workspace connection
pub async fn link_workspace_repository(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<LinkGitHubRepository>,
) -> Result<ResponseJson<ApiResponse<GitHubRepository>>, ApiError> {
    let connection = GitHubConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace GitHub connection not found".to_string()))?;

    let repository = GitHubRepository::link(&deployment.db().pool, connection.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workspace_github_repository_linked",
            serde_json::json!({
                "repo_full_name": payload.repo_full_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(repository)))
}

/// Unlink a GitHub repository from workspace connection
pub async fn unlink_workspace_repository(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = GitHubRepository::unlink(&deployment.db().pool, repo_id).await?;
    if rows_affected == 0 {
        return Err(ApiError::NotFound("GitHub repository not found".to_string()));
    }

    deployment
        .track_if_analytics_allowed(
            "workspace_github_repository_unlinked",
            serde_json::json!({
                "repo_id": repo_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}
