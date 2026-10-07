use api_types::{
    CreateWorkspaceRequest, PullRequestStatus, UpsertPullRequestRequest,
    Workspace as RemoteWorkspace,
};
use axum::{
    Extension, Json, Router,
    extract::{Path as AxumPath, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{delete, post},
};
use db::models::{merge::MergeStatus, pull_request::PullRequest, workspace::Workspace};
use deployment::Deployment;
use serde::Deserialize;
use services::services::{
    diff_stream,
    remote_client::{RemoteClient, RemoteClientError},
    remote_sync,
};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_workspace_middleware};

#[derive(Debug, Deserialize)]
pub struct LinkWorkspaceRequest {
    pub project_id: Uuid,
    pub issue_id: Uuid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RemoteWorkspaceSyncAction {
    Create,
    Update,
}

fn classify_remote_workspace_sync(
    existing_workspace: Option<&RemoteWorkspace>,
    project_id: Uuid,
    issue_id: Uuid,
) -> Result<RemoteWorkspaceSyncAction, ApiError> {
    let Some(existing_workspace) = existing_workspace else {
        return Ok(RemoteWorkspaceSyncAction::Create);
    };

    if existing_workspace.project_id == project_id && existing_workspace.issue_id == Some(issue_id)
    {
        return Ok(RemoteWorkspaceSyncAction::Update);
    }

    Err(ApiError::Conflict(
        "This workspace is already linked to another issue.".to_string(),
    ))
}

pub async fn sync_workspace_to_issue(
    deployment: &DeploymentImpl,
    client: &RemoteClient,
    workspace: &Workspace,
    project_id: Uuid,
    issue_id: Uuid,
) -> Result<(), ApiError> {
    let existing_workspace = match client.get_workspace_by_local_id(workspace.id).await {
        Ok(workspace) => Some(workspace),
        Err(RemoteClientError::Http { status: 404, .. }) => None,
        Err(error) => return Err(error.into()),
    };

    let stats =
        diff_stream::compute_diff_stats(&deployment.db().pool, deployment.git(), workspace).await;
    let files_changed = stats.as_ref().map(|s| s.files_changed as i32);
    let lines_added = stats.as_ref().map(|s| s.lines_added as i32);
    let lines_removed = stats.as_ref().map(|s| s.lines_removed as i32);

    match classify_remote_workspace_sync(existing_workspace.as_ref(), project_id, issue_id)? {
        RemoteWorkspaceSyncAction::Create => {
            client
                .create_workspace(CreateWorkspaceRequest {
                    project_id,
                    local_workspace_id: workspace.id,
                    issue_id,
                    name: workspace.name.clone(),
                    archived: Some(workspace.archived),
                    files_changed,
                    lines_added,
                    lines_removed,
                })
                .await?;
        }
        RemoteWorkspaceSyncAction::Update => {
            client
                .update_workspace(
                    workspace.id,
                    Some(workspace.name.clone()),
                    Some(workspace.archived),
                    files_changed,
                    lines_added,
                    lines_removed,
                )
                .await?;
        }
    }

    Ok(())
}

pub async fn link_workspace(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<LinkWorkspaceRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let client = deployment.remote_client()?;
    sync_workspace_to_issue(
        &deployment,
        &client,
        &workspace,
        payload.project_id,
        payload.issue_id,
    )
    .await?;

    {
        let pool = deployment.db().pool.clone();
        let ws_id = workspace.id;
        let client = client.clone();
        tokio::spawn(async move {
            let pull_requests = match PullRequest::find_by_workspace_id(&pool, ws_id).await {
                Ok(prs) => prs,
                Err(e) => {
                    tracing::error!(
                        "Failed to fetch PRs for workspace {} during link: {}",
                        ws_id,
                        e
                    );
                    return;
                }
            };
            for pr in pull_requests {
                let pr_status = match pr.pr_status {
                    MergeStatus::Open => PullRequestStatus::Open,
                    MergeStatus::Merged => PullRequestStatus::Merged,
                    MergeStatus::Closed => PullRequestStatus::Closed,
                    MergeStatus::Unknown => continue,
                };
                remote_sync::sync_pr_to_remote(
                    &client,
                    UpsertPullRequestRequest {
                        url: pr.pr_url,
                        number: pr.pr_number as i32,
                        status: pr_status,
                        merged_at: pr.merged_at,
                        merge_commit_sha: pr.merge_commit_sha,
                        target_branch_name: pr.target_branch_name,
                        local_workspace_id: ws_id,
                    },
                )
                .await;
            }
        });
    }

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn unlink_workspace(
    AxumPath(workspace_id): AxumPath<uuid::Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let client = deployment.remote_client()?;

    match client.delete_workspace(workspace_id).await {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(RemoteClientError::Http { status: 404, .. }) => {
            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(e) => Err(e.into()),
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let post_router = Router::new()
        .route("/", post(link_workspace))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_workspace_middleware,
        ));

    let delete_router = Router::new().route("/", delete(unlink_workspace));

    post_router.merge(delete_router)
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::*;

    fn make_remote_workspace(project_id: Uuid, issue_id: Option<Uuid>) -> RemoteWorkspace {
        RemoteWorkspace {
            id: Uuid::new_v4(),
            project_id,
            owner_user_id: Uuid::new_v4(),
            issue_id,
            local_workspace_id: Some(Uuid::new_v4()),
            name: Some("Workspace".to_string()),
            archived: false,
            files_changed: None,
            lines_added: None,
            lines_removed: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn classify_remote_workspace_sync_creates_when_workspace_is_missing() {
        let action = classify_remote_workspace_sync(None, Uuid::new_v4(), Uuid::new_v4()).unwrap();

        assert_eq!(action, RemoteWorkspaceSyncAction::Create);
    }

    #[test]
    fn classify_remote_workspace_sync_updates_when_issue_matches() {
        let project_id = Uuid::new_v4();
        let issue_id = Uuid::new_v4();
        let existing_workspace = make_remote_workspace(project_id, Some(issue_id));

        let action =
            classify_remote_workspace_sync(Some(&existing_workspace), project_id, issue_id)
                .unwrap();

        assert_eq!(action, RemoteWorkspaceSyncAction::Update);
    }

    #[test]
    fn classify_remote_workspace_sync_conflicts_when_issue_differs() {
        let project_id = Uuid::new_v4();
        let existing_workspace = make_remote_workspace(project_id, Some(Uuid::new_v4()));

        let result =
            classify_remote_workspace_sync(Some(&existing_workspace), project_id, Uuid::new_v4());

        assert!(
            matches!(result, Err(ApiError::Conflict(message)) if message == "This workspace is already linked to another issue.")
        );
    }
}
