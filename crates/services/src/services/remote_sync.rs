use std::collections::HashSet;

use api_types::{PullRequestStatus, UpsertPullRequestRequest};
use db::models::{
    merge::{Merge, MergeStatus},
    workspace::Workspace,
};
use git::GitService;
use sqlx::SqlitePool;
use tracing::{debug, error};
use uuid::Uuid;

use super::{
    diff_stream::{self, DiffStats},
    remote_client::{RemoteClient, RemoteClientError},
};

async fn update_workspace_on_remote(
    client: &RemoteClient,
    workspace_id: Uuid,
    name: Option<Option<String>>,
    archived: Option<bool>,
    stats: Option<&DiffStats>,
) {
    match client
        .update_workspace(
            workspace_id,
            name,
            archived,
            stats.map(|s| s.files_changed as i32),
            stats.map(|s| s.lines_added as i32),
            stats.map(|s| s.lines_removed as i32),
        )
        .await
    {
        Ok(()) => {
            debug!("Synced workspace {} to remote", workspace_id);
        }
        Err(RemoteClientError::Auth) => {
            debug!("Workspace {} sync skipped: not authenticated", workspace_id);
        }
        Err(RemoteClientError::Http { status: 404, .. }) => {
            debug!(
                "Workspace {} disappeared from remote before update, skipping sync",
                workspace_id
            );
        }
        Err(e) => {
            error!("Failed to sync workspace {} to remote: {}", workspace_id, e);
        }
    }
}

/// Syncs workspace data to the remote server.
/// First checks if the workspace exists on remote, then updates if it does.
pub async fn sync_workspace_to_remote(
    client: &RemoteClient,
    workspace_id: Uuid,
    name: Option<Option<String>>,
    archived: Option<bool>,
    stats: Option<&DiffStats>,
) {
    // First check if workspace exists on remote
    match client.workspace_exists(workspace_id).await {
        Ok(false) => {
            debug!(
                "Workspace {} not found on remote, skipping sync",
                workspace_id
            );
            return;
        }
        Err(RemoteClientError::Auth) => {
            debug!("Workspace {} sync skipped: not authenticated", workspace_id);
            return;
        }
        Err(e) => {
            error!(
                "Failed to check workspace {} existence on remote: {}",
                workspace_id, e
            );
            return;
        }
        Ok(true) => {}
    }

    // Workspace exists, proceed with update
    update_workspace_on_remote(client, workspace_id, name, archived, stats).await;
}

async fn upsert_pr_on_remote(client: &RemoteClient, request: UpsertPullRequestRequest) {
    let number = request.number;
    let workspace_id = request.local_workspace_id;

    // Workspace exists, proceed with PR upsert
    match client.upsert_pull_request(request).await {
        Ok(()) => {
            debug!("Synced PR #{} to remote", number);
        }
        Err(RemoteClientError::Auth) => {
            debug!("PR #{} sync skipped: not authenticated", number);
        }
        Err(RemoteClientError::Http { status: 404, .. }) => {
            debug!(
                "PR #{} workspace {} not found on remote, skipping sync",
                number, workspace_id
            );
        }
        Err(e) => {
            error!("Failed to sync PR #{} to remote: {}", number, e);
        }
    }
}

/// Syncs PR data to the remote server.
/// First checks if the workspace exists on remote, then upserts the PR if it does.
pub async fn sync_pr_to_remote(client: &RemoteClient, request: UpsertPullRequestRequest) {
    // First check if workspace exists on remote
    match client.workspace_exists(request.local_workspace_id).await {
        Ok(false) => {
            debug!(
                "PR #{} workspace {} not found on remote, skipping sync",
                request.number, request.local_workspace_id
            );
            return;
        }
        Err(RemoteClientError::Auth) => {
            debug!("PR #{} sync skipped: not authenticated", request.number);
            return;
        }
        Err(e) => {
            error!(
                "Failed to check workspace {} existence on remote: {}",
                request.local_workspace_id, e
            );
            return;
        }
        Ok(true) => {}
    }

    upsert_pr_on_remote(client, request).await;
}

fn map_pr_status(status: &MergeStatus) -> PullRequestStatus {
    match status {
        MergeStatus::Open => PullRequestStatus::Open,
        MergeStatus::Merged => PullRequestStatus::Merged,
        MergeStatus::Closed => PullRequestStatus::Closed,
        MergeStatus::Unknown => PullRequestStatus::Open,
    }
}

/// Syncs all linked workspaces and their PRs to the remote server.
/// Used after login to catch up on any changes made while logged out.
pub async fn sync_all_linked_workspaces(
    client: &RemoteClient,
    pool: &SqlitePool,
    git: &GitService,
) {
    // Sync workspace stats
    let workspaces = match Workspace::fetch_all(pool).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("Failed to fetch workspaces for post-login sync: {}", e);
            return;
        }
    };

    let mut linked_workspace_ids = HashSet::new();

    for workspace in &workspaces {
        match client.workspace_exists(workspace.id).await {
            Ok(true) => {
                linked_workspace_ids.insert(workspace.id);
            }
            Ok(false) => {
                debug!(
                    "Workspace {} not found on remote, skipping post-login sync",
                    workspace.id
                );
                continue;
            }
            Err(RemoteClientError::Auth) => {
                debug!("Post-login workspace sync skipped: not authenticated");
                return;
            }
            Err(e) => {
                error!(
                    "Failed to check workspace {} existence on remote during post-login sync: {}",
                    workspace.id, e
                );
                continue;
            }
        }

        let stats = diff_stream::compute_diff_stats(pool, git, workspace).await;
        update_workspace_on_remote(
            client,
            workspace.id,
            workspace.name.clone().map(Some),
            Some(workspace.archived),
            stats.as_ref(),
        )
        .await;
    }

    if linked_workspace_ids.is_empty() {
        debug!("Post-login workspace sync completed: no linked workspaces found");
        return;
    }

    // Sync all PR data
    let pr_merges = match Merge::find_all_pr(pool).await {
        Ok(prs) => prs,
        Err(e) => {
            error!("Failed to fetch PR merges for post-login sync: {}", e);
            return;
        }
    };

    for pr_merge in pr_merges {
        if !linked_workspace_ids.contains(&pr_merge.workspace_id) {
            continue;
        }

        upsert_pr_on_remote(
            client,
            UpsertPullRequestRequest {
                url: pr_merge.pr_info.url,
                number: pr_merge.pr_info.number as i32,
                status: map_pr_status(&pr_merge.pr_info.status),
                merged_at: pr_merge.pr_info.merged_at,
                merge_commit_sha: pr_merge.pr_info.merge_commit_sha,
                target_branch_name: pr_merge.target_branch_name,
                local_workspace_id: pr_merge.workspace_id,
            },
        )
        .await;
    }

    debug!("Post-login workspace sync completed");
}
