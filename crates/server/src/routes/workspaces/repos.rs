use axum::{Extension, Json, extract::State, response::Json as ResponseJson};
use db::models::{
    requests::WorkspaceRepoInput,
    workspace::{Workspace, WorkspaceError},
    workspace_repo::{RepoWithTargetBranch, WorkspaceRepo},
};
use deployment::Deployment;
use services::services::container::ContainerService;
use utils::response::ApiResponse;

use super::{AddWorkspaceRepoRequest, AddWorkspaceRepoResponse};
use crate::{DeploymentImpl, error::ApiError};

pub async fn get_workspace_repos(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<RepoWithTargetBranch>>>, ApiError> {
    let pool = &deployment.db().pool;
    let repos =
        WorkspaceRepo::find_repos_with_target_branch_for_workspace(pool, workspace.id).await?;
    Ok(ResponseJson(ApiResponse::success(repos)))
}

#[axum::debug_handler]
pub async fn add_workspace_repo(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<AddWorkspaceRepoRequest>,
) -> Result<ResponseJson<ApiResponse<AddWorkspaceRepoResponse>>, ApiError> {
    let mut managed_workspace = deployment
        .workspace_manager()
        .load_managed_workspace(workspace)
        .await?;

    let repo_input = WorkspaceRepoInput {
        repo_id: payload.repo_id,
        target_branch: payload.target_branch,
    };

    managed_workspace
        .add_repository(&repo_input, deployment.git())
        .await
        .map_err(ApiError::from)?;

    deployment
        .container()
        .ensure_container_exists(&managed_workspace.workspace)
        .await?;

    let workspace = Workspace::find_by_id(&deployment.db().pool, managed_workspace.workspace.id)
        .await?
        .ok_or(WorkspaceError::WorkspaceNotFound)?;
    let repo = managed_workspace
        .repos
        .iter()
        .find(|repo_with_target| repo_with_target.repo.id == repo_input.repo_id)
        .cloned()
        .ok_or_else(|| {
            ApiError::Conflict("Repository already attached to workspace".to_string())
        })?;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_repo_added",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
                "repo_id": repo.repo.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(
        AddWorkspaceRepoResponse { workspace, repo },
    )))
}
