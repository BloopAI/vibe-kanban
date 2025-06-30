use std::collections::HashMap;

use axum::{
    extract::{Extension, Path, Query},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::get,
    Json, Router,
};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::models::{
    project::{
        CreateProject, GitBranch, Project, ProjectWithBranch, SearchMatchType, SearchResult,
        UpdateProject,
    },
    ApiResponse,
};

pub async fn get_projects(
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<Vec<Project>>>, StatusCode> {
    match Project::find_all(&pool).await {
        Ok(projects) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(projects),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to fetch projects: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_project(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    match Project::find_by_id(&pool, id).await {
        Ok(Some(project)) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(project),
            message: None,
        })),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to fetch project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_project_with_branch(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<ProjectWithBranch>>, StatusCode> {
    match Project::find_by_id(&pool, id).await {
        Ok(Some(project)) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(project.with_branch_info()),
            message: None,
        })),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to fetch project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_project_branches(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<Vec<GitBranch>>>, StatusCode> {
    match Project::find_by_id(&pool, id).await {
        Ok(Some(project)) => match project.get_all_branches() {
            Ok(branches) => Ok(ResponseJson(ApiResponse {
                success: true,
                data: Some(branches),
                message: None,
            })),
            Err(e) => {
                tracing::error!("Failed to get branches for project {}: {}", id, e);
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        },
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to fetch project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn create_project(
    Extension(pool): Extension<SqlitePool>,
    Json(payload): Json<CreateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    let id = Uuid::new_v4();

    tracing::debug!("Creating project '{}'", payload.name);

    // Check if git repo path is already used by another project
    match Project::find_by_git_repo_path(&pool, &payload.git_repo_path).await {
        Ok(Some(_)) => {
            return Ok(ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some("A project with this git repository path already exists".to_string()),
            }));
        }
        Ok(None) => {
            // Path is available, continue
        }
        Err(e) => {
            tracing::error!("Failed to check for existing git repo path: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Validate and setup git repository
    let path = std::path::Path::new(&payload.git_repo_path);

    if payload.use_existing_repo {
        // For existing repos, validate that the path exists and is a git repository
        if !path.exists() {
            return Ok(ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some("The specified path does not exist".to_string()),
            }));
        }

        if !path.is_dir() {
            return Ok(ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some("The specified path is not a directory".to_string()),
            }));
        }

        if !path.join(".git").exists() {
            return Ok(ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some("The specified directory is not a git repository".to_string()),
            }));
        }
    } else {
        // For new repos, create directory and initialize git

        // Create directory if it doesn't exist
        if !path.exists() {
            if let Err(e) = std::fs::create_dir_all(path) {
                tracing::error!("Failed to create directory: {}", e);
                return Ok(ResponseJson(ApiResponse {
                    success: false,
                    data: None,
                    message: Some(format!("Failed to create directory: {}", e)),
                }));
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
                        return Ok(ResponseJson(ApiResponse {
                            success: false,
                            data: None,
                            message: Some(format!("Git init failed: {}", error_msg)),
                        }));
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to run git init: {}", e);
                    return Ok(ResponseJson(ApiResponse {
                        success: false,
                        data: None,
                        message: Some(format!("Failed to run git init: {}", e)),
                    }));
                }
            }
        }
    }

    match Project::create(&pool, &payload, id).await {
        Ok(project) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(project),
            message: Some("Project created successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to create project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn update_project(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<SqlitePool>,
    Json(payload): Json<UpdateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    // Check if project exists first
    let existing_project = match Project::find_by_id(&pool, id).await {
        Ok(Some(project)) => project,
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check project existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // If git_repo_path is being changed, check if the new path is already used by another project
    if let Some(new_git_repo_path) = &payload.git_repo_path {
        if new_git_repo_path != &existing_project.git_repo_path {
            match Project::find_by_git_repo_path_excluding_id(&pool, new_git_repo_path, id).await {
                Ok(Some(_)) => {
                    return Ok(ResponseJson(ApiResponse {
                        success: false,
                        data: None,
                        message: Some(
                            "A project with this git repository path already exists".to_string(),
                        ),
                    }));
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

    // Use existing values if not provided in update
    let name = payload.name.unwrap_or(existing_project.name);
    let git_repo_path = payload
        .git_repo_path
        .unwrap_or(existing_project.git_repo_path.clone());
    let setup_script = payload.setup_script.or(existing_project.setup_script);
    let dev_script = payload.dev_script.or(existing_project.dev_script);

    match Project::update(&pool, id, name, git_repo_path, setup_script, dev_script).await {
        Ok(project) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(project),
            message: Some("Project updated successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to update project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn delete_project(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    match Project::delete(&pool, id).await {
        Ok(rows_affected) => {
            if rows_affected == 0 {
                Err(StatusCode::NOT_FOUND)
            } else {
                Ok(ResponseJson(ApiResponse {
                    success: true,
                    data: None,
                    message: Some("Project deleted successfully".to_string()),
                }))
            }
        }
        Err(e) => {
            tracing::error!("Failed to delete project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn search_project_files(
    Path(id): Path<Uuid>,
    Query(params): Query<HashMap<String, String>>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<Vec<SearchResult>>>, StatusCode> {
    let query = match params.get("q") {
        Some(q) if !q.trim().is_empty() => q.trim(),
        _ => {
            return Ok(ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some("Query parameter 'q' is required and cannot be empty".to_string()),
            }));
        }
    };

    // Check if project exists
    let project = match Project::find_by_id(&pool, id).await {
        Ok(Some(project)) => project,
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to fetch project: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Search files in the project repository
    match search_files_in_repo(&project.git_repo_path, query).await {
        Ok(results) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(results),
            message: None,
        })),
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
    use std::path::Path;

    use ignore::WalkBuilder;

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
        use SearchMatchType::*;
        let priority = |match_type: &SearchMatchType| match match_type {
            FileName => 0,
            DirectoryName => 1,
            FullPath => 2,
        };

        priority(&a.match_type)
            .cmp(&priority(&b.match_type))
            .then_with(|| a.path.cmp(&b.path))
    });

    // Limit to top 10 results
    results.truncate(10);

    Ok(results)
}

pub fn projects_router() -> Router {
    Router::new()
        .route("/projects", get(get_projects).post(create_project))
        .route(
            "/projects/:id",
            get(get_project).put(update_project).delete(delete_project),
        )
        .route("/projects/:id/with-branch", get(get_project_with_branch))
        .route("/projects/:id/branches", get(get_project_branches))
        .route("/projects/:id/search", get(search_project_files))
}
