use std::{collections::HashMap, path::Path};

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    http::StatusCode,
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::project::{
    CreateProject, Project, ProjectError, SearchMatchType, SearchResult, UpdateProject,
};
use deployment::Deployment;
use ignore::WalkBuilder;
use services::services::{file_ranker::FileRanker, git::GitBranch};
use utils::{path::expand_tilde, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_project_middleware};

pub async fn get_projects(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Project>>>, ApiError> {
    let projects = Project::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(projects)))
}

pub async fn get_project(
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(project)))
}

pub async fn get_project_branches(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitBranch>>>, ApiError> {
    let branches = deployment.git().get_all_branches(&project.git_repo_path)?;
    Ok(ResponseJson(ApiResponse::success(branches)))
}

pub async fn create_project(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let id = Uuid::new_v4();
    let CreateProject {
        name,
        git_repo_path,
        setup_script,
        dev_script,
        cleanup_script,
        copy_files,
        use_existing_repo,
    } = payload;
    tracing::debug!("Creating project '{}'", name);

    // Validate and setup git repository
    // Expand tilde in git repo path if present
    let path = expand_tilde(&git_repo_path);
    // Check if git repo path is already used by another project
    match Project::find_by_git_repo_path(&deployment.db().pool, path.to_string_lossy().as_ref())
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
            return Err(ProjectError::GitRepoCheckFailed(e.to_string()).into());
        }
    }

    if use_existing_repo {
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

        // Ensure existing repo has a main branch if it's empty
        if let Err(e) = deployment.git().ensure_main_branch_exists(&path) {
            tracing::error!("Failed to ensure main branch exists: {}", e);
            return Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to ensure main branch exists: {}",
                e
            ))));
        }
    } else {
        // For new repos, create directory and initialize git

        // Create directory if it doesn't exist
        if !path.exists()
            && let Err(e) = std::fs::create_dir_all(&path)
        {
            tracing::error!("Failed to create directory: {}", e);
            return Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to create directory: {}",
                e
            ))));
        }

        // Check if it's already a git repo, if not initialize it
        if !path.join(".git").exists()
            && let Err(e) = deployment.git().initialize_repo_with_main_branch(&path)
        {
            tracing::error!("Failed to initialize git repository: {}", e);
            return Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to initialize git repository: {}",
                e
            ))));
        }
    }

    match Project::create(
        &deployment.db().pool,
        &CreateProject {
            name,
            git_repo_path: path.to_string_lossy().to_string(),
            use_existing_repo,
            setup_script,
            dev_script,
            cleanup_script,
            copy_files,
        },
        id,
    )
    .await
    {
        Ok(project) => {
            // Track project creation event
            deployment
                .track_if_analytics_allowed(
                    "project_created",
                    serde_json::json!({
                        "project_id": project.id.to_string(),
                        "use_existing_repo": use_existing_repo,
                        "has_setup_script": project.setup_script.is_some(),
                        "has_dev_script": project.dev_script.is_some(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(project)))
        }
        Err(e) => Err(ProjectError::CreateFailed(e.to_string()).into()),
    }
}

pub async fn update_project(
    Extension(existing_project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    // Destructure payload to handle field updates.
    // This allows us to treat `None` from the payload as an explicit `null` to clear a field,
    // as the frontend currently sends all fields on update.
    let UpdateProject {
        name,
        git_repo_path,
        setup_script,
        dev_script,
        cleanup_script,
        copy_files,
    } = payload;
    // If git_repo_path is being changed, check if the new path is already used by another project
    let git_repo_path = if let Some(new_git_repo_path) = git_repo_path.map(|s| expand_tilde(&s))
        && new_git_repo_path != existing_project.git_repo_path
    {
        match Project::find_by_git_repo_path_excluding_id(
            &deployment.db().pool,
            new_git_repo_path.to_string_lossy().as_ref(),
            existing_project.id,
        )
        .await
        {
            Ok(Some(_)) => {
                return Ok(ResponseJson(ApiResponse::error(
                    "A project with this git repository path already exists",
                )));
            }
            Ok(None) => new_git_repo_path,
            Err(e) => {
                tracing::error!("Failed to check for existing git repo path: {}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    } else {
        existing_project.git_repo_path
    };

    match Project::update(
        &deployment.db().pool,
        existing_project.id,
        name.unwrap_or(existing_project.name),
        git_repo_path.to_string_lossy().to_string(),
        setup_script,
        dev_script,
        cleanup_script,
        copy_files,
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

    // We intentionally do NOT respect gitignore here because this search is
    // used to help users pick files like ".env" or local config files that are
    // commonly gitignored but still need to be copied into the worktree.
    // Include hidden files as well.
    let walker = WalkBuilder::new(repo_path)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
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

    // Apply git history-based ranking
    let file_ranker = FileRanker::new();
    match file_ranker.get_stats(repo_path).await {
        Ok(stats) => {
            // Re-rank results using git history
            file_ranker.rerank(&mut results, &stats);
        }
        Err(e) => {
            tracing::warn!(
                "Failed to get git stats for ranking, using basic sort: {}",
                e
            );
            // Fallback to basic priority sorting
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
        }
    }

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
