//! GitHub integration API endpoints.
//!
//! Provides endpoints for managing GitHub Project links and triggering synchronization.

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{delete, get, post},
};
use db::models::{
    github_issue_mapping::GitHubIssueMapping,
    github_project_link::{CreateGitHubProjectLink, GitHubProjectLink},
    project::Project,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::github::{
    GitHubProjectsService, GitHubSyncService,
    projects::GitHubProject,
    sync::SyncResult,
};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_project_middleware};

/// Request to create a GitHub project link
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CreateGitHubLinkRequest {
    pub github_project_id: String,
    pub github_owner: String,
    pub github_repo: Option<String>,
}

/// Response for GitHub project link with mapping count
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitHubLinkResponse {
    #[serde(flatten)]
    pub link: GitHubProjectLink,
    pub issue_count: usize,
}

/// List available GitHub Projects for the authenticated user
pub async fn list_available_projects(
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubProject>>>, ApiError> {
    let projects_service = GitHubProjectsService::new();

    // Check if gh CLI is available
    projects_service.check_available().map_err(|e| {
        ApiError::ServiceUnavailable(format!("GitHub CLI not available: {}", e))
    })?;

    // Get the current user's login
    let viewer_login = projects_service.get_viewer_login().map_err(|e| {
        ApiError::ServiceUnavailable(format!("Failed to get GitHub user: {}", e))
    })?;

    // Get projects for the current user
    let projects = projects_service.list_user_projects(&viewer_login).map_err(|e| {
        ApiError::InternalServer(format!("Failed to list GitHub projects: {}", e))
    })?;

    Ok(ResponseJson(ApiResponse::success(projects)))
}

/// List GitHub Projects for an organization
pub async fn list_org_projects(
    State(_deployment): State<DeploymentImpl>,
    Path(org): Path<String>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubProject>>>, ApiError> {
    let projects_service = GitHubProjectsService::new();

    projects_service.check_available().map_err(|e| {
        ApiError::ServiceUnavailable(format!("GitHub CLI not available: {}", e))
    })?;

    let projects = projects_service.list_org_projects(&org).map_err(|e| {
        ApiError::InternalServer(format!("Failed to list organization projects: {}", e))
    })?;

    Ok(ResponseJson(ApiResponse::success(projects)))
}

/// Get GitHub project links for a Vibe project
pub async fn get_github_links(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubLinkResponse>>>, ApiError> {
    let links = GitHubProjectLink::find_by_project_id(&deployment.db().pool, project.id).await?;

    let mut responses = Vec::new();
    for link in links {
        let mappings = GitHubIssueMapping::find_by_link_id(&deployment.db().pool, link.id).await?;
        responses.push(GitHubLinkResponse {
            link,
            issue_count: mappings.len(),
        });
    }

    Ok(ResponseJson(ApiResponse::success(responses)))
}

/// Create a new GitHub project link
pub async fn create_github_link(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateGitHubLinkRequest>,
) -> Result<ResponseJson<ApiResponse<GitHubProjectLink>>, ApiError> {
    let data = CreateGitHubProjectLink {
        project_id: project.id,
        github_project_id: payload.github_project_id,
        github_owner: payload.github_owner,
        github_repo: payload.github_repo,
    };

    let link = GitHubProjectLink::create(&deployment.db().pool, &data).await?;

    deployment
        .track_if_analytics_allowed(
            "github_project_linked",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "github_project_id": link.github_project_id,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(link)))
}

/// Delete a GitHub project link
pub async fn delete_github_link(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Path(link_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Verify the link belongs to this project
    let link = GitHubProjectLink::find_by_id(&deployment.db().pool, link_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub link not found".to_string()))?;

    if link.project_id != project.id {
        return Err(ApiError::Forbidden(
            "Link does not belong to this project".to_string(),
        ));
    }

    GitHubProjectLink::delete(&deployment.db().pool, link_id).await?;

    deployment
        .track_if_analytics_allowed(
            "github_project_unlinked",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "github_project_id": link.github_project_id,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Toggle sync enabled status for a GitHub link
pub async fn toggle_github_link_sync(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Path(link_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<GitHubProjectLink>>, ApiError> {
    // Verify the link belongs to this project
    let link = GitHubProjectLink::find_by_id(&deployment.db().pool, link_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub link not found".to_string()))?;

    if link.project_id != project.id {
        return Err(ApiError::Forbidden(
            "Link does not belong to this project".to_string(),
        ));
    }

    GitHubProjectLink::update_sync_enabled(&deployment.db().pool, link_id, !link.sync_enabled)
        .await?;

    let updated_link = GitHubProjectLink::find_by_id(&deployment.db().pool, link_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub link not found".to_string()))?;

    Ok(ResponseJson(ApiResponse::success(updated_link)))
}

/// Trigger manual sync for a GitHub link
pub async fn sync_github_link(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Path(link_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<SyncResult>>, ApiError> {
    // Verify the link belongs to this project
    let link = GitHubProjectLink::find_by_id(&deployment.db().pool, link_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub link not found".to_string()))?;

    if link.project_id != project.id {
        return Err(ApiError::Forbidden(
            "Link does not belong to this project".to_string(),
        ));
    }

    let sync_service = GitHubSyncService::new();

    sync_service.check_available().map_err(|e| {
        ApiError::ServiceUnavailable(format!("GitHub CLI not available: {}", e))
    })?;

    let result = sync_service
        .sync_from_github(&deployment.db().pool, &link, project.id)
        .await
        .map_err(|e| ApiError::InternalServer(format!("Sync failed: {}", e)))?;

    deployment
        .track_if_analytics_allowed(
            "github_sync_completed",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "github_project_id": link.github_project_id,
                "items_synced": result.items_synced,
                "items_created": result.items_created,
                "items_updated": result.items_updated,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(result)))
}

/// Get issue mappings for a GitHub link
pub async fn get_github_link_mappings(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Path(link_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubIssueMapping>>>, ApiError> {
    // Verify the link belongs to this project
    let link = GitHubProjectLink::find_by_id(&deployment.db().pool, link_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub link not found".to_string()))?;

    if link.project_id != project.id {
        return Err(ApiError::Forbidden(
            "Link does not belong to this project".to_string(),
        ));
    }

    let mappings = GitHubIssueMapping::find_by_link_id(&deployment.db().pool, link_id).await?;

    Ok(ResponseJson(ApiResponse::success(mappings)))
}

/// Check GitHub CLI availability and authentication status
pub async fn check_github_status(
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<GitHubStatusResponse>>, ApiError> {
    let projects_service = GitHubProjectsService::new();

    match projects_service.check_available() {
        Ok(()) => {
            match projects_service.get_viewer_login() {
                Ok(login) => Ok(ResponseJson(ApiResponse::success(GitHubStatusResponse {
                    available: true,
                    authenticated: true,
                    user_login: Some(login),
                    error: None,
                }))),
                Err(e) => Ok(ResponseJson(ApiResponse::success(GitHubStatusResponse {
                    available: true,
                    authenticated: false,
                    user_login: None,
                    error: Some(e.to_string()),
                }))),
            }
        }
        Err(e) => Ok(ResponseJson(ApiResponse::success(GitHubStatusResponse {
            available: false,
            authenticated: false,
            user_login: None,
            error: Some(e.to_string()),
        }))),
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitHubStatusResponse {
    pub available: bool,
    pub authenticated: bool,
    pub user_login: Option<String>,
    pub error: Option<String>,
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let project_github_router = Router::new()
        .route("/github-links", get(get_github_links).post(create_github_link))
        .route(
            "/github-links/{link_id}",
            delete(delete_github_link),
        )
        .route(
            "/github-links/{link_id}/toggle-sync",
            post(toggle_github_link_sync),
        )
        .route(
            "/github-links/{link_id}/sync",
            post(sync_github_link),
        )
        .route(
            "/github-links/{link_id}/mappings",
            get(get_github_link_mappings),
        )
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_middleware,
        ));

    Router::new()
        .route("/github/status", get(check_github_status))
        .route("/github/projects", get(list_available_projects))
        .route("/github/organizations/{org}/projects", get(list_org_projects))
        .nest("/projects/{id}", project_github_router)
}
