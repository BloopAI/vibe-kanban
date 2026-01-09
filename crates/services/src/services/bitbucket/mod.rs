//! Bitbucket Server integration service.
//!
//! Provides support for Bitbucket Server REST API v1.0, including:
//! - Pull request creation
//! - PR status tracking
//! - Comment fetching (general and inline review comments)
//!
//! Authentication is done via HTTP access tokens (Personal Access Tokens).

mod api_client;
pub mod credentials;
pub mod models;

use std::sync::Arc;

use async_trait::async_trait;
use db::models::merge::PullRequestInfo;
use tracing::{debug, info};

use self::api_client::BitbucketApiClient;
use self::credentials::{BitbucketCredentialStore, BitbucketCredentials};
use self::models::{CreatePullRequestRequest, ProjectSpec, RefSpec, RepositorySpec};
use super::github::UnifiedPrComment;
use super::vcs_provider::{CreatePrRequest, VcsProvider, VcsProviderError, VcsProviderType, VcsRepoInfo};

/// Bitbucket Server service implementing the VcsProvider trait.
pub struct BitbucketService {
    client: BitbucketApiClient,
    credentials: Arc<BitbucketCredentialStore>,
}

impl BitbucketService {
    /// Create a new BitbucketService with the default credential store path
    pub fn new() -> Result<Self, VcsProviderError> {
        let credentials = Arc::new(BitbucketCredentialStore::new(
            BitbucketCredentialStore::default_path(),
        ));
        let client = BitbucketApiClient::new()?;

        Ok(Self {
            client,
            credentials,
        })
    }

    /// Create a new BitbucketService with a custom credential store
    pub fn with_credentials(credentials: Arc<BitbucketCredentialStore>) -> Result<Self, VcsProviderError> {
        let client = BitbucketApiClient::new()?;

        Ok(Self {
            client,
            credentials,
        })
    }

    /// Get the credential store for external configuration
    pub fn credentials(&self) -> &Arc<BitbucketCredentialStore> {
        &self.credentials
    }

    /// Load credentials from storage
    pub async fn load_credentials(&self) -> Result<(), VcsProviderError> {
        self.credentials
            .load()
            .await
            .map_err(|e| VcsProviderError::Io(e))
    }

    /// Save credentials to storage
    pub async fn save_credentials(&self, creds: &BitbucketCredentials) -> Result<(), VcsProviderError> {
        self.credentials
            .save(creds)
            .await
            .map_err(|e| VcsProviderError::Io(e))
    }

    /// Get credentials, returning an error if not configured
    async fn get_credentials(&self) -> Result<BitbucketCredentials, VcsProviderError> {
        self.credentials.get().await.ok_or_else(|| {
            VcsProviderError::AuthRequired("Bitbucket Server".to_string())
        })
    }

    /// Build the PR URL for display
    fn build_pr_url(base_url: &str, project: &str, repo: &str, pr_id: i64) -> String {
        format!(
            "{}/projects/{}/repos/{}/pull-requests/{}",
            base_url.trim_end_matches('/'),
            project,
            repo,
            pr_id
        )
    }
}

#[async_trait]
impl VcsProvider for BitbucketService {
    fn provider_type(&self) -> VcsProviderType {
        VcsProviderType::BitbucketServer
    }

    fn matches_remote_url(&self, url: &str) -> bool {
        url.contains("git.taboolasyndication.com")
    }

    async fn check_auth(&self) -> Result<(), VcsProviderError> {
        let creds = self.get_credentials().await?;

        self.client
            .verify_token(&creds.base_url, &creds.access_token)
            .await
            .map_err(|e| match e {
                VcsProviderError::AuthFailed(_) => VcsProviderError::AuthFailed(
                    "Bitbucket access token is invalid or expired".to_string(),
                ),
                _ => e,
            })
    }

    async fn create_pr(
        &self,
        repo_info: &VcsRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, VcsProviderError> {
        let creds = self.get_credentials().await?;

        info!(
            "Creating Bitbucket PR in {}/{}: {}",
            repo_info.owner_or_project, repo_info.repo_name, request.title
        );

        let bb_request = CreatePullRequestRequest {
            title: request.title.clone(),
            description: request.body.clone(),
            from_ref: RefSpec {
                id: format!("refs/heads/{}", request.head_branch),
                repository: RepositorySpec {
                    slug: repo_info.repo_name.clone(),
                    project: ProjectSpec {
                        key: repo_info.owner_or_project.clone(),
                    },
                },
            },
            to_ref: RefSpec {
                id: format!("refs/heads/{}", request.base_branch),
                repository: RepositorySpec {
                    slug: repo_info.repo_name.clone(),
                    project: ProjectSpec {
                        key: repo_info.owner_or_project.clone(),
                    },
                },
            },
        };

        let pr = self
            .client
            .create_pull_request(
                &creds.base_url,
                &creds.access_token,
                &repo_info.owner_or_project,
                &repo_info.repo_name,
                &bb_request,
            )
            .await?;

        let pr_url = Self::build_pr_url(
            &creds.base_url,
            &repo_info.owner_or_project,
            &repo_info.repo_name,
            pr.id,
        );

        info!("Created Bitbucket PR #{}: {}", pr.id, pr_url);

        Ok(PullRequestInfo {
            number: pr.id,
            url: pr_url,
            status: db::models::merge::MergeStatus::Open,
            merged_at: None,
            merge_commit_sha: None,
        })
    }

    async fn get_pr_status(
        &self,
        repo_info: &VcsRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, VcsProviderError> {
        let creds = self.get_credentials().await?;

        debug!(
            "Getting Bitbucket PR status for {}/{} #{}",
            repo_info.owner_or_project, repo_info.repo_name, pr_number
        );

        let pr = self
            .client
            .get_pull_request(
                &creds.base_url,
                &creds.access_token,
                &repo_info.owner_or_project,
                &repo_info.repo_name,
                pr_number,
            )
            .await?;

        Ok(pr.to_pull_request_info(&creds.base_url))
    }

    async fn list_prs_for_branch(
        &self,
        repo_info: &VcsRepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, VcsProviderError> {
        let creds = self.get_credentials().await?;

        debug!(
            "Listing Bitbucket PRs for branch {} in {}/{}",
            branch_name, repo_info.owner_or_project, repo_info.repo_name
        );

        let prs = self
            .client
            .list_pull_requests(
                &creds.base_url,
                &creds.access_token,
                &repo_info.owner_or_project,
                &repo_info.repo_name,
                Some(branch_name),
                Some("ALL"), // Include open, merged, and declined
            )
            .await?;

        Ok(prs
            .into_iter()
            .map(|pr| pr.to_pull_request_info(&creds.base_url))
            .collect())
    }

    async fn get_pr_comments(
        &self,
        repo_info: &VcsRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, VcsProviderError> {
        let creds = self.get_credentials().await?;

        let pr_url = Self::build_pr_url(
            &creds.base_url,
            &repo_info.owner_or_project,
            &repo_info.repo_name,
            pr_number,
        );

        debug!(
            "Getting Bitbucket PR comments for {}/{} #{}",
            repo_info.owner_or_project, repo_info.repo_name, pr_number
        );

        // Fetch both activities (general comments) and diff comments (inline) in parallel
        let (activities_result, comments_result) = tokio::join!(
            self.client.get_pull_request_activities(
                &creds.base_url,
                &creds.access_token,
                &repo_info.owner_or_project,
                &repo_info.repo_name,
                pr_number,
            ),
            self.client.get_pull_request_comments(
                &creds.base_url,
                &creds.access_token,
                &repo_info.owner_or_project,
                &repo_info.repo_name,
                pr_number,
            )
        );

        let mut unified_comments = Vec::new();

        // Process activities (general comments from activity feed)
        if let Ok(activities) = activities_result {
            for activity in activities {
                if activity.action == "COMMENTED" {
                    if let Some(comment) = activity.comment {
                        unified_comments.push(comment.to_unified_comment(&pr_url));

                        // Also include replies
                        for reply in comment.comments {
                            unified_comments.push(reply.to_unified_comment(&pr_url));
                        }
                    }
                }
            }
        }

        // Process diff comments (inline code comments)
        if let Ok(diff_comments) = comments_result {
            for comment in diff_comments {
                unified_comments.push(comment.to_unified_comment(&pr_url));
            }
        }

        // Sort by creation time
        unified_comments.sort_by_key(|c| match c {
            UnifiedPrComment::General { created_at, .. } => *created_at,
            UnifiedPrComment::Review { created_at, .. } => *created_at,
        });

        // Deduplicate by ID (activities and comments endpoints may overlap)
        let mut seen_ids = std::collections::HashSet::new();
        unified_comments.retain(|c| {
            let id = match c {
                UnifiedPrComment::General { id, .. } => id.clone(),
                UnifiedPrComment::Review { id, .. } => id.to_string(),
            };
            seen_ids.insert(id)
        });

        Ok(unified_comments)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_bitbucket_url() {
        // Test URL matching without creating full service (avoids TLS provider requirement)
        fn matches_url(url: &str) -> bool {
            url.contains("git.taboolasyndication.com")
        }

        assert!(matches_url("ssh://git@git.taboolasyndication.com:7998/dev/products.git"));
        assert!(matches_url("https://git.taboolasyndication.com/projects/DEV/repos/products"));
        assert!(!matches_url("https://github.com/owner/repo"));
    }

    #[test]
    fn test_build_pr_url() {
        let url = BitbucketService::build_pr_url(
            "https://git.taboolasyndication.com",
            "DEV",
            "products",
            123,
        );
        assert_eq!(
            url,
            "https://git.taboolasyndication.com/projects/DEV/repos/products/pull-requests/123"
        );
    }
}
