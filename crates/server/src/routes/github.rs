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
        github_service::GitHubService,
        gitea_service::GiteaService,
        git_platform::{GitPlatformService, GitPlatformError, RepositoryInfo},
        config::{GitPlatformType, GitPlatformConfig},
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

// Alias for backward compatibility and platform-agnostic naming
pub type CreateProjectFromGitPlatform = CreateProjectFromGitHub;

#[derive(serde::Deserialize)]
pub struct RepositoryQuery {
    pub page: Option<u8>,
}

/// Helper function to create a platform service based on configuration
fn create_platform_service(
    config: &GitPlatformConfig,
) -> Result<Box<dyn GitPlatformService>, StatusCode> {
    let token = config.token().ok_or_else(|| {
        tracing::error!("Git platform token not configured");
        StatusCode::UNAUTHORIZED
    })?;

    match config.platform_type {
        GitPlatformType::GitHub => {
            GitHubService::new(&token)
                .map(|service| Box::new(service) as Box<dyn GitPlatformService>)
                .map_err(|e| {
                    tracing::error!("Failed to create GitHub service: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })
        }
        GitPlatformType::Gitea => {
            let gitea_url = config.gitea_url.as_ref().ok_or_else(|| {
                tracing::error!("Gitea URL not configured");
                StatusCode::BAD_REQUEST
            })?;
            GiteaService::new(&token, gitea_url)
                .map(|service| Box::new(service) as Box<dyn GitPlatformService>)
                .map_err(|e| {
                    tracing::error!("Failed to create Gitea service: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })
        }
    }
}

/// List repositories for the authenticated user from their configured Git platform
pub async fn list_repositories(
    State(app_state): State<AppState>,
    Query(params): Query<RepositoryQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<RepositoryInfo>>>, StatusCode> {
    let page = params.page.unwrap_or(1);

    // Get Git platform configuration
    let platform_config = {
        let config = app_state.get_config().read().await;
        config.git_platform.clone()
    };

    // Check if platform is configured
    if platform_config.token().is_none() {
        return Ok(ResponseJson(ApiResponse::error(
            "Git platform token not configured. Please authenticate first.",
        )));
    }

    // Create platform service
    let platform_service = create_platform_service(&platform_config)?;

    // List repositories
    match platform_service.list_repositories(page).await {
        Ok(repositories) => {
            let platform_name = match platform_config.platform_type {
                GitPlatformType::GitHub => "GitHub",
                GitPlatformType::Gitea => "Gitea",
            };
            tracing::info!(
                "Retrieved {} repositories from {} (page {})",
                repositories.len(),
                platform_name,
                page
            );
            Ok(ResponseJson(ApiResponse::success(repositories)))
        }
        Err(GitPlatformError::TokenInvalid) => Ok(ResponseJson(ApiResponse::error(
            "Git platform token is invalid or expired. Please re-authenticate.",
        ))),
        Err(e) => {
            tracing::error!("Failed to list repositories: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to retrieve repositories: {}",
                e
            ))))
        }
    }
}

/// Create a project from a Git platform repository (GitHub or Gitea)
pub async fn create_project_from_github(
    State(app_state): State<AppState>,
    Json(payload): Json<CreateProjectFromGitHub>,
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    // Get platform configuration
    let platform_config = {
        let config = app_state.get_config().read().await;
        config.git_platform.clone()
    };

    let platform_name = match platform_config.platform_type {
        GitPlatformType::GitHub => "GitHub",
        GitPlatformType::Gitea => "Gitea",
    };

    tracing::debug!("Creating project '{}' from {} repository", payload.name, platform_name);

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

    // Get Git platform token
    let platform_token = platform_config.token();

    // Clone the repository
    match GitService::clone_repository(&payload.clone_url, &target_path, platform_token.as_deref()) {
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
            let source = match platform_config.platform_type {
                GitPlatformType::GitHub => "github",
                GitPlatformType::Gitea => "gitea",
            };

            app_state
                .track_analytics_event(
                    "project_created",
                    Some(serde_json::json!({
                        "project_id": project.id.to_string(),
                        "repository_id": payload.repository_id,
                        "clone_url": payload.clone_url,
                        "has_setup_script": has_setup_script,
                        "has_dev_script": has_dev_script,
                        "source": source,
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
