use std::path::Path;

use db::models::project::ProjectRemoteMetadata;

use crate::services::{git::GitService, github_service::GitHubService};

/// Compute remote metadata for a given repository path, including GitHub repo ID enrichment
pub async fn compute_remote_metadata(git: &GitService, repo_path: &Path) -> ProjectRemoteMetadata {
    let mut metadata = match git.get_remote_metadata(repo_path) {
        Ok(m) => m,
        Err(err) => {
            tracing::warn!(
                "Failed to read git remotes for project '{}': {}",
                repo_path.display(),
                err
            );
            ProjectRemoteMetadata::default()
        }
    };

    if metadata.github_repo_id.is_some() {
        return metadata;
    }

    let (Some(owner), Some(name)) = (&metadata.github_repo_owner, &metadata.github_repo_name)
    else {
        return metadata;
    };

    let client = match GitHubService::new() {
        Ok(client) => client,
        Err(err) => {
            tracing::warn!("Failed to construct GitHub client: {err}");
            return metadata;
        }
    };

    match client.fetch_repository_id(owner, name).await {
        Ok(id) => metadata.github_repo_id = Some(id),
        Err(err) => {
            tracing::warn!("Failed to fetch repository id for {owner}/{name}: {err}");
        }
    }

    metadata
}
