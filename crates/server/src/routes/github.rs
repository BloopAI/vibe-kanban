//! GitHub integration routes for importing issues and other GitHub operations.

use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use chrono::{DateTime, Utc};
use db::models::repo::Repo;
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::git_host::github::{GhCli, GhCliError, GitHubIssue};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Query parameters for listing GitHub issues.
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct ListGitHubIssuesQuery {
    /// The repository ID to fetch issues from.
    pub repo_id: Uuid,
    /// Issue state filter: "open", "closed", or "all" (default: "open").
    pub state: Option<String>,
    /// Maximum number of issues to return (default: 100).
    pub limit: Option<u32>,
}

/// Query parameters for getting GitHub repo info.
#[derive(Debug, Deserialize)]
pub struct GetGitHubRepoInfoQuery {
    /// The repository ID to get info for.
    pub repo_id: Uuid,
}

/// A GitHub issue response for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitHubIssueResponse {
    pub number: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub labels: Vec<String>,
}

impl From<GitHubIssue> for GitHubIssueResponse {
    fn from(issue: GitHubIssue) -> Self {
        Self {
            number: issue.number,
            title: issue.title,
            body: issue.body,
            state: issue.state,
            url: issue.url,
            created_at: issue.created_at,
            labels: issue.labels,
        }
    }
}

/// GitHub repository info response.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitHubRepoInfoResponse {
    pub owner: String,
    pub repo_name: String,
}

/// List GitHub issues for a repository.
///
/// GET /api/github/issues?repo_id={uuid}&state={open|closed|all}&limit={n}
pub async fn list_github_issues(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListGitHubIssuesQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubIssueResponse>>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get the repository
    let repo = Repo::find_by_id(pool, query.repo_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Repository not found".to_string()))?;

    // Get repo info (owner/name) from the local repo path
    let gh_cli = GhCli::new();
    let repo_info = gh_cli
        .get_repo_info(&repo.path)
        .map_err(gh_cli_to_api_error)?;

    // Fetch issues
    let issues = gh_cli
        .list_issues(
            &repo_info.owner,
            &repo_info.repo_name,
            query.state.as_deref(),
            query.limit,
        )
        .map_err(gh_cli_to_api_error)?;

    let response: Vec<GitHubIssueResponse> = issues.into_iter().map(Into::into).collect();

    Ok(ResponseJson(ApiResponse::success(response)))
}

/// Get GitHub repository info (owner/name) for a repository.
///
/// GET /api/github/repo-info?repo_id={uuid}
pub async fn get_github_repo_info(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<GetGitHubRepoInfoQuery>,
) -> Result<ResponseJson<ApiResponse<GitHubRepoInfoResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get the repository
    let repo = Repo::find_by_id(pool, query.repo_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Repository not found".to_string()))?;

    // Get repo info from the local repo path
    let gh_cli = GhCli::new();
    let repo_info = gh_cli
        .get_repo_info(&repo.path)
        .map_err(gh_cli_to_api_error)?;

    Ok(ResponseJson(ApiResponse::success(GitHubRepoInfoResponse {
        owner: repo_info.owner,
        repo_name: repo_info.repo_name,
    })))
}

/// Convert GhCliError to ApiError.
fn gh_cli_to_api_error(err: GhCliError) -> ApiError {
    match err {
        GhCliError::NotAvailable => ApiError::BadRequest(
            "GitHub CLI (gh) is not installed. Please install it from https://cli.github.com/"
                .to_string(),
        ),
        GhCliError::AuthFailed(msg) => ApiError::BadRequest(format!(
            "GitHub authentication failed. Please run 'gh auth login' to authenticate. Error: {}",
            msg
        )),
        GhCliError::CommandFailed(msg) => {
            ApiError::BadRequest(format!("GitHub CLI error: {}", msg))
        }
        GhCliError::UnexpectedOutput(msg) => {
            ApiError::BadRequest(format!("Unexpected GitHub CLI output: {}", msg))
        }
    }
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/github/issues", get(list_github_issues))
        .route("/github/repo-info", get(get_github_repo_info))
}
