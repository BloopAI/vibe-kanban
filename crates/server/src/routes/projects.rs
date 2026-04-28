use axum::{
    Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{get, put},
};
use db::models::{
    project::{CreateProject, Project, UpdateProject},
    project_repo::{ProjectRepo, ProjectRepoInput, ProjectRepoWithRepo},
};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize, TS)]
pub struct SetProjectReposRequest {
    pub repos: Vec<ProjectRepoInput>,
}

pub async fn list_projects(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Project>>>, ApiError> {
    let projects = Project::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(projects)))
}

pub async fn create_project(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(payload): ResponseJson<CreateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest(
            "Project name cannot be empty".to_string(),
        ));
    }
    let project = Project::create(&deployment.db().pool, name).await?;
    Ok(ResponseJson(ApiResponse::success(project)))
}

pub async fn get_project(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let project = Project::find_by_id(&deployment.db().pool, project_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Project not found".to_string()))?;
    Ok(ResponseJson(ApiResponse::success(project)))
}

pub async fn update_project(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    ResponseJson(payload): ResponseJson<UpdateProject>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let Some(name) = payload.name else {
        let project = Project::find_by_id(&deployment.db().pool, project_id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("Project not found".to_string()))?;
        return Ok(ResponseJson(ApiResponse::success(project)));
    };
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ApiError::BadRequest(
            "Project name cannot be empty".to_string(),
        ));
    }
    let project = Project::update_name(&deployment.db().pool, project_id, trimmed).await?;
    Ok(ResponseJson(ApiResponse::success(project)))
}

pub async fn delete_project(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    Project::delete(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn list_project_repos(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<ProjectRepoWithRepo>>>, ApiError> {
    let repos = ProjectRepo::list_for_project(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(ApiResponse::success(repos)))
}

pub async fn set_project_repos(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    ResponseJson(payload): ResponseJson<SetProjectReposRequest>,
) -> Result<ResponseJson<ApiResponse<Vec<ProjectRepoWithRepo>>>, ApiError> {
    // Ensure the project exists before mutating links.
    Project::find_by_id(&deployment.db().pool, project_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Project not found".to_string()))?;

    ProjectRepo::replace_for_project(&deployment.db().pool, project_id, &payload.repos).await?;
    let repos = ProjectRepo::list_for_project(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(ApiResponse::success(repos)))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route(
            "/projects/{project_id}",
            get(get_project).put(update_project).delete(delete_project),
        )
        .route(
            "/projects/{project_id}/repos",
            put(set_project_repos).get(list_project_repos),
        )
}
