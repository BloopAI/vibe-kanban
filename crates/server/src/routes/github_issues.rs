use axum::{
    Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    repo::Repo,
    task::{CreateTask, Task, TaskStatus},
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::git_host::github::{GhCli, GitHubIssue};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ListIssuesQuery {
    #[serde(default = "default_state")]
    pub state: String,
}

fn default_state() -> String {
    "open".to_string()
}

/// GET /api/projects/{project_id}/repos/{repo_id}/github-issues
pub async fn list_github_issues(
    State(deployment): State<DeploymentImpl>,
    Path((_project_id, repo_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<ListIssuesQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<GitHubIssue>>>, ApiError> {
    // Find the repo
    let repo = Repo::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest(format!("Repository {repo_id} not found")))?;

    // Create GitHub CLI and get repo info
    let gh_cli = GhCli::new();
    let repo_info = gh_cli.get_repo_info(&repo.path).map_err(|e| {
        ApiError::BadRequest(format!(
            "Repository is not a GitHub repository or remote not configured: {e}"
        ))
    })?;

    // Fetch issues using GitHub CLI
    let issues: Vec<GitHubIssue> = gh_cli
        .list_issues(&repo_info.owner, &repo_info.repo_name, &query.state)
        .map_err(|e| ApiError::BadRequest(format!("Failed to fetch issues: {e}")))?;

    tracing::info!(
        "Fetched {} GitHub issues for repo {}",
        issues.len(),
        repo_id
    );

    Ok(ResponseJson(ApiResponse::success(issues)))
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct GitHubIssueToImport {
    #[ts(type = "number")]
    pub number: i64,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct ImportGitHubIssuesRequest {
    pub repo_id: Uuid,
    pub issues: Vec<GitHubIssueToImport>,
}

#[derive(Debug, Serialize, TS)]
pub struct ImportGitHubIssuesResponse {
    pub created_count: u64,
    pub task_ids: Vec<Uuid>,
}

/// POST /api/projects/{project_id}/import-github-issues
pub async fn import_github_issues(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<ImportGitHubIssuesRequest>,
) -> Result<ResponseJson<ApiResponse<ImportGitHubIssuesResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    let mut task_ids = Vec::with_capacity(payload.issues.len());

    for issue in &payload.issues {
        let task_id = Uuid::new_v4();

        let create_task = CreateTask {
            project_id,
            title: issue.title.clone(),
            description: issue.body.clone(),
            status: Some(TaskStatus::Todo),
            parent_workspace_id: None,
            image_ids: None,
            shared_task_id: None,
            github_issue_number: Some(issue.number),
            github_issue_url: Some(issue.url.clone()),
        };

        let task = Task::create(pool, &create_task, task_id).await?;
        task_ids.push(task.id);
    }

    let created_count = task_ids.len() as u64;

    tracing::info!(
        "Imported {} GitHub issues as tasks for project {}",
        created_count,
        project_id
    );

    deployment
        .track_if_analytics_allowed(
            "github_issues_imported",
            serde_json::json!({
                "project_id": project_id.to_string(),
                "count": created_count,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(ImportGitHubIssuesResponse {
        created_count,
        task_ids,
    })))
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/projects/{project_id}/repos/{repo_id}/github-issues",
            get(list_github_issues),
        )
        .route(
            "/projects/{project_id}/import-github-issues",
            post(import_github_issues),
        )
}
