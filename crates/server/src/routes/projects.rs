use std::collections::HashMap;

use axum::{
    Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::get,
};
use db::models::{
    project::Project,
    repo::Repo,
    scratch::{Scratch, ScratchPayload, ScratchType},
};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

fn normalize_project_name(name: &str) -> String {
    name.trim().to_ascii_lowercase()
}

async fn list_synthetic_projects(deployment: &DeploymentImpl) -> Result<Vec<Project>, ApiError> {
    let scratches = Scratch::find_all(&deployment.db().pool).await?;
    let mut synthetic_projects = Vec::new();

    for scratch in scratches {
        let repo_ids = match scratch.payload {
            ScratchPayload::ProjectRepoDefaults(data) => data
                .repos
                .into_iter()
                .map(|repo| repo.repo_id)
                .collect::<Vec<_>>(),
            _ => continue,
        };

        if repo_ids.is_empty() {
            continue;
        }

        let repos = Repo::find_by_ids(&deployment.db().pool, &repo_ids).await?;
        let Some(primary_repo) = repos.first() else {
            continue;
        };

        synthetic_projects.push(Project {
            id: scratch.id,
            name: primary_repo.display_name.clone(),
            default_agent_working_dir: primary_repo.default_working_dir.clone(),
            remote_project_id: None,
            created_at: scratch.created_at,
            updated_at: scratch.updated_at,
        });
    }

    synthetic_projects.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(synthetic_projects)
}

async fn find_exact_synthetic_project(
    deployment: &DeploymentImpl,
    project_id: Uuid,
) -> Result<Option<Project>, ApiError> {
    let Some(scratch) = Scratch::find_by_id(
        &deployment.db().pool,
        project_id,
        &ScratchType::ProjectRepoDefaults,
    )
    .await?
    else {
        return Ok(None);
    };

    let repo_ids = match scratch.payload {
        ScratchPayload::ProjectRepoDefaults(data) => data
            .repos
            .into_iter()
            .map(|repo| repo.repo_id)
            .collect::<Vec<_>>(),
        _ => return Ok(None),
    };
    if repo_ids.is_empty() {
        return Ok(None);
    }

    let repos = Repo::find_by_ids(&deployment.db().pool, &repo_ids).await?;
    let Some(primary_repo) = repos.first() else {
        return Ok(None);
    };

    Ok(Some(Project {
        id: scratch.id,
        name: primary_repo.display_name.clone(),
        default_agent_working_dir: primary_repo.default_working_dir.clone(),
        remote_project_id: None,
        created_at: scratch.created_at,
        updated_at: scratch.updated_at,
    }))
}

async fn find_named_synthetic_project(
    deployment: &DeploymentImpl,
    project_name: &str,
) -> Result<Option<Project>, ApiError> {
    let synthetic_projects = list_synthetic_projects(deployment).await?;
    let target_name = normalize_project_name(project_name);
    Ok(synthetic_projects
        .into_iter()
        .find(|project| normalize_project_name(&project.name) == target_name))
}

fn enrich_with_synthetic_project(project: &mut Project, synthetic_project: &Project) {
    if project.default_agent_working_dir.is_none() {
        project.default_agent_working_dir = synthetic_project.default_agent_working_dir.clone();
    }
}

async fn list_projects(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Project>>>, ApiError> {
    let mut projects = Project::find_all(&deployment.db().pool).await?;
    let synthetic_projects = list_synthetic_projects(&deployment).await?;
    let synthetic_by_name = synthetic_projects
        .iter()
        .map(|project| (normalize_project_name(&project.name), project.clone()))
        .collect::<HashMap<_, _>>();

    for project in &mut projects {
        if let Some(synthetic_project) =
            synthetic_by_name.get(&normalize_project_name(&project.name))
        {
            enrich_with_synthetic_project(project, synthetic_project);
        }
    }

    Ok(ResponseJson(ApiResponse::success(projects)))
}

async fn get_project(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let project = match Project::find_by_id(&deployment.db().pool, project_id).await {
        Ok(mut project) => {
            if let Some(synthetic_project) =
                find_named_synthetic_project(&deployment, &project.name).await?
            {
                enrich_with_synthetic_project(&mut project, &synthetic_project);
            }
            project
        }
        Err(sqlx::Error::RowNotFound) => find_exact_synthetic_project(&deployment, project_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?,
        Err(error) => return Err(error.into()),
    };

    Ok(ResponseJson(ApiResponse::success(project)))
}

pub fn router() -> Router<DeploymentImpl> {
    let inner = Router::new()
        .route("/", get(list_projects))
        .route("/{project_id}", get(get_project));

    Router::new().nest("/projects", inner)
}
