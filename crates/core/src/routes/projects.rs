use std::{collections::HashMap, path::Path};

use anyhow::anyhow;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
    Extension, Json, Router,
};
use db::models::project::{
    CreateProject, Project, ProjectWithBranch, SearchMatchType, SearchResult, UpdateProject,
};
use deployment::{Deployment, DeploymentError};
use ignore::WalkBuilder;
use services::services::{
    config::{EditorConfig, EditorType},
    git::{GitBranch, GitService},
};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{middleware::load_project_middleware, DeploymentImpl};

pub async fn get_projects(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Project>>>, DeploymentError> {
    let projects = Project::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(projects)))
}

pub async fn get_project(
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<Project>>, DeploymentError> {
    Ok(ResponseJson(ApiResponse::success(project)))
}

pub async fn get_project_with_branch(
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<ProjectWithBranch>>, DeploymentError> {
    let current_branch = GitService::new()
        .get_current_branch(&project.git_repo_path)
        .ok();
    let project_with_branch = ProjectWithBranch::from_project(project, current_branch);
    Ok(ResponseJson(ApiResponse::success(project_with_branch)))
}

pub async fn get_project_branches(
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<Vec<GitBranch>>>, DeploymentError> {
    let branches = GitService::new().get_all_branches(&project.git_repo_path)?;
    Ok(ResponseJson(ApiResponse::success(branches)))
}

pub async fn create_project(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, DeploymentError> {
    let id = Uuid::new_v4();

    tracing::debug!("Creating project '{}'", payload.name);

    // Check if git repo path is already used by another project
    match Project::find_by_git_repo_path(&deployment.db().pool, &payload.git_repo_path).await {
        Ok(Some(_)) => {
            return Ok(ResponseJson(ApiResponse::error(
                "A project with this git repository path already exists",
            )));
        }
        Ok(None) => {
            // Path is available, continue
        }
        Err(e) => {
            return Err(DeploymentError::Other(anyhow!(
                "Failed to check for existing git repo path: {}",
                e
            )));
        }
    }

    // Validate and setup git repository
    let path = std::path::Path::new(&payload.git_repo_path);

    if payload.use_existing_repo {
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
    } else {
        // For new repos, create directory and initialize git

        // Create directory if it doesn't exist
        if !path.exists() {
            if let Err(e) = std::fs::create_dir_all(path) {
                tracing::error!("Failed to create directory: {}", e);
                return Ok(ResponseJson(ApiResponse::error(&format!(
                    "Failed to create directory: {}",
                    e
                ))));
            }
        }

        // Check if it's already a git repo, if not initialize it
        if !path.join(".git").exists() {
            match std::process::Command::new("git")
                .arg("init")
                .current_dir(path)
                .output()
            {
                Ok(output) => {
                    if !output.status.success() {
                        let error_msg = String::from_utf8_lossy(&output.stderr);
                        tracing::error!("Git init failed: {}", error_msg);
                        return Ok(ResponseJson(ApiResponse::error(&format!(
                            "Git init failed: {}",
                            error_msg
                        ))));
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to run git init: {}", e);
                    return Ok(ResponseJson(ApiResponse::error(&format!(
                        "Failed to run git init: {}",
                        e
                    ))));
                }
            }
        }
    }

    match Project::create(&deployment.db().pool, &payload, id).await {
        Ok(project) => {
            // Track project creation event
            deployment
                .track_if_analytics_allowed(
                    "project_created",
                    serde_json::json!({
                        "project_id": project.id.to_string(),
                        "use_existing_repo": payload.use_existing_repo,
                        "has_setup_script": payload.setup_script.is_some(),
                        "has_dev_script": payload.dev_script.is_some(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(project)))
        }
        Err(e) => {
            return Err(DeploymentError::Other(anyhow!(
                "Failed to create project: {}",
                e
            )));
        }
    }
}

pub async fn update_project(
    Extension(existing_project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    // If git_repo_path is being changed, check if the new path is already used by another project
    if let Some(new_git_repo_path) = &payload.git_repo_path {
        if new_git_repo_path != &existing_project.git_repo_path.to_string_lossy() {
            match Project::find_by_git_repo_path_excluding_id(
                &deployment.db().pool,
                new_git_repo_path,
                existing_project.id,
            )
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
                    tracing::error!("Failed to check for existing git repo path: {}", e);
                    return Err(StatusCode::INTERNAL_SERVER_ERROR);
                }
            }
        }
    }

    // Destructure payload to handle field updates.
    // This allows us to treat `None` from the payload as an explicit `null` to clear a field,
    // as the frontend currently sends all fields on update.
    let UpdateProject {
        name,
        git_repo_path,
        setup_script,
        dev_script,
        cleanup_script,
    } = payload;

    let name = name.unwrap_or(existing_project.name);
    let git_repo_path =
        git_repo_path.unwrap_or(existing_project.git_repo_path.to_string_lossy().to_string());

    match Project::update(
        &deployment.db().pool,
        existing_project.id,
        name,
        git_repo_path,
        setup_script,
        dev_script,
        cleanup_script,
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

pub async fn open_project_in_editor(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<Option<OpenEditorRequest>>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    let path = project.git_repo_path.to_string_lossy();

    let editor_config = {
        let config = deployment.config().read().await;
        let editor_type_str = payload.as_ref().and_then(|req| req.editor_type.as_deref());
        config.editor.with_override(editor_type_str)
    };

    match editor_config.open_file(&path) {
        Ok(_) => {
            tracing::info!("Opened editor for project {} at path: {}", project.id, path);
            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(e) => {
            tracing::error!("Failed to open editor for project {}: {}", project.id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn search_project_files(
    Extension(project): Extension<Project>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<ResponseJson<ApiResponse<Vec<SearchResult>>>, StatusCode> {
    let query = match params.get("q") {
        Some(q) if !q.trim().is_empty() => q.trim(),
        _ => {
            return Ok(ResponseJson(ApiResponse::error(
                "Query parameter 'q' is required and cannot be empty",
            )));
        }
    };

    // Search files in the project repository
    match search_files_in_repo(&project.git_repo_path.to_string_lossy(), query).await {
        Ok(results) => Ok(ResponseJson(ApiResponse::success(results))),
        Err(e) => {
            tracing::error!("Failed to search files: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn search_files_in_repo(
    repo_path: &str,
    query: &str,
) -> Result<Vec<SearchResult>, Box<dyn std::error::Error + Send + Sync>> {
    let repo_path = Path::new(repo_path);

    if !repo_path.exists() {
        return Err("Repository path does not exist".into());
    }

    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    // Use ignore::WalkBuilder to respect gitignore files
    let walker = WalkBuilder::new(repo_path)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .hidden(false)
        .build();

    for result in walker {
        let entry = result?;
        let path = entry.path();

        // Skip the root directory itself
        if path == repo_path {
            continue;
        }

        let relative_path = path.strip_prefix(repo_path)?;

        // Skip .git directory and its contents
        if relative_path
            .components()
            .any(|component| component.as_os_str() == ".git")
        {
            continue;
        }
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

    // Sort results by priority: FileName > DirectoryName > FullPath
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

    // Limit to top 10 results
    results.truncate(10);

    Ok(results)
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let project_id_router = Router::new()
        .route(
            "/",
            get(get_project).put(update_project).delete(delete_project),
        )
        .route("/with-branch", get(get_project_with_branch))
        .route("/branches", get(get_project_branches))
        .route("/search", get(search_project_files))
        .route("/open-editor", post(open_project_in_editor))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_middleware,
        ));

    let projects_router = Router::new()
        .route("/", get(get_projects).post(create_project))
        .nest("/{id}", project_id_router);

    Router::new().nest("/projects", projects_router)
}
