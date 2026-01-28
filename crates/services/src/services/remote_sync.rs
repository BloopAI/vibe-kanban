use tracing::{debug, error};
use utils::api::pull_requests::PullRequestStatus;
use uuid::Uuid;

use super::{diff_stream::DiffStats, remote_client::RemoteClient};

/// Syncs workspace data to the remote server.
/// First checks if the workspace exists on remote, then updates if it does.
pub async fn sync_workspace_to_remote(
    client: &RemoteClient,
    workspace_id: Uuid,
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
    match client
        .update_workspace(
            workspace_id,
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
        Err(e) => {
            error!("Failed to sync workspace {} to remote: {}", workspace_id, e);
        }
    }
}

/// Syncs PR data to the remote server.
/// First checks if the workspace exists on remote, then upserts the PR if it does.
pub async fn sync_pr_to_remote(
    client: &RemoteClient,
    url: String,
    number: i32,
    status: PullRequestStatus,
    merged_at: Option<chrono::DateTime<chrono::Utc>>,
    merge_commit_sha: Option<String>,
    target_branch_name: String,
    workspace_id: Uuid,
) {
    // First check if workspace exists on remote
    match client.workspace_exists(workspace_id).await {
        Ok(false) => {
            debug!(
                "PR #{} workspace {} not found on remote, skipping sync",
                number, workspace_id
            );
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

    // Workspace exists, proceed with PR upsert
    match client
        .upsert_pull_request(
            url,
            number,
            status,
            merged_at,
            merge_commit_sha,
            target_branch_name,
            workspace_id,
        )
        .await
    {
        Ok(()) => {
            debug!("Synced PR #{} to remote", number);
        }
        Err(e) => {
            error!("Failed to sync PR #{} to remote: {}", number, e);
        }
    }
}
