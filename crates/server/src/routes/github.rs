#![cfg(feature = "cloud")]

use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
};
use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{
        ApiResponse,
        project::{CreateProject, Project},
    },
    services::{
        GitHubServiceError,
        git_service::GitService,
        github_service::{GitHubService, RepositoryInfo},
    },
};

#[derive(Debug, Deserialize, TS)]
pub struct CreateProjectFromGitHub {
    pub repository_id: i64,
    pub name: String,
    pub clone_url: String,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct RepositoryQuery {
    pub page: Option<u8>,
}

/// List GitHub repositories for the authenticated user
pub async fn list_repositories(
    State(app_state): State<AppState>,
    Query(params): Query<RepositoryQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<RepositoryInfo>>>, StatusCode> {
    let page = params.page.unwrap_or(1);

    // Get GitHub configuration
    let github_config = {
        let config = app_state.get_config().read().await;
        config.github.clone()
    };

    // Check if GitHub is configured
    if github_config.token.is_none() {
        return Ok(ResponseJson(ApiResponse::error(
            "GitHub token not configured. Please authenticate with GitHub first.",
        )));
    }

    // Create GitHub service with token
    let github_token = github_config.token.as_deref().unwrap();
    let github_service = match GitHubService::new(github_token) {
        Ok(service) => service,
        Err(e) => {
            tracing::error!("Failed to create GitHub service: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // List repositories
    match github_service.list_repositories(page).await {
        Ok(repositories) => {
            tracing::info!(
                "Retrieved {} repositories from GitHub (page {})",
                repositories.len(),
                page
            );
            Ok(ResponseJson(ApiResponse::success(repositories)))
        }
        Err(GitHubServiceError::TokenInvalid) => Ok(ResponseJson(ApiResponse::error(
            "GitHub token is invalid or expired. Please re-authenticate with GitHub.",
        ))),
        Err(e) => {
            tracing::error!("Failed to list GitHub repositories: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to retrieve repositories: {}",
                e
            ))))
        }
    }
}

/// Create a project from a GitHub repository
pub async fn create_project_from_github(
    State(app_state): State<AppState>,
    Json(payload): Json<CreateProjectFromGitHub>,
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    tracing::debug!("Creating project '{}' from GitHub repository", payload.name);

    // Get workspace path
    let workspace_path = match app_state.get_workspace_path().await {
        Ok(path) => path,
        Err(e) => {
            tracing::error!("Failed to get workspace path: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let target_path = workspace_path.join(&payload.name);

    // Check if project directory already exists
    if target_path.exists() {
        return Ok(ResponseJson(ApiResponse::error(
            "A project with this name already exists in the workspace",
        )));
    }

    // Check if git repo path is already used by another project
    match Project::find_by_git_repo_path(&app_state.db_pool, &target_path.to_string_lossy()).await {
        Ok(Some(_)) => {
            return Ok(ResponseJson(ApiResponse::error(
                "A project with this git repository path already exists",
            )));
        }
        Ok(None) => {
            // Path is available, continue
        }
        Err(e) => {
            tracing::error!("Failed to check for existing git repo path: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Get GitHub token
    let github_token = {
        let config = app_state.get_config().read().await;
        config.github.token.clone()
    };

    // Clone the repository
    match GitService::clone_repository(&payload.clone_url, &target_path, github_token.as_deref()) {
        Ok(_) => {
            tracing::info!(
                "Successfully cloned repository {} to {}",
                payload.clone_url,
                target_path.display()
            );
        }
        Err(e) => {
            tracing::error!("Failed to clone repository: {}", e);
            return Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to clone repository: {}",
                e
            ))));
        }
    }

    // Create project record in database
    let has_setup_script = payload.setup_script.is_some();
    let has_dev_script = payload.dev_script.is_some();
    let project_data = CreateProject {
        name: payload.name.clone(),
        git_repo_path: target_path.to_string_lossy().to_string(),
        use_existing_repo: true, // Since we just cloned it
        setup_script: payload.setup_script,
        dev_script: payload.dev_script,
        cleanup_script: payload.cleanup_script,
    };

    let project_id = Uuid::new_v4();
    match Project::create(&app_state.db_pool, &project_data, project_id).await {
        Ok(project) => {
            // Track project creation event
            app_state
                .track_analytics_event(
                    "project_created",
                    Some(serde_json::json!({
                        "project_id": project.id.to_string(),
                        "repository_id": payload.repository_id,
                        "clone_url": payload.clone_url,
                        "has_setup_script": has_setup_script,
                        "has_dev_script": has_dev_script,
                        "trigger": "github",
                    })),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(project)))
        }
        Err(e) => {
            tracing::error!("Failed to create project: {}", e);

            // Clean up cloned repository if project creation failed
            if target_path.exists() {
                if let Err(cleanup_err) = std::fs::remove_dir_all(&target_path) {
                    tracing::error!("Failed to cleanup cloned repository: {}", cleanup_err);
                }
            }

            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Create router for GitHub-related endpoints (only registered in cloud mode)
pub fn github_router() -> Router<AppState> {
    Router::new()
        .route("/github/repositories", get(list_repositories))
        .route("/projects/from-github", post(create_project_from_github))
}
