use std::time::Duration;

use async_trait::async_trait;
use backon::{ExponentialBuilder, Retryable};
use db::models::merge::{MergeStatus, PullRequestInfo};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::services::git_platform::{
    CreatePrRequest, GitPlatformError, GitPlatformService, RepoInfo, RepositoryInfo,
};

#[derive(Debug, Clone)]
pub struct GiteaService {
    client: Client,
    token: String,
    base_url: String, // e.g., "https://gitea.example.com"
}

impl GiteaService {
    /// Create a new Gitea service with authentication
    pub fn new(token: &str, base_url: &str) -> Result<Self, GitPlatformError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| GitPlatformError::Http(format!("Failed to create HTTP client: {e}")))?;

        let base_url = base_url.trim_end_matches('/').to_string();

        Ok(Self {
            client,
            token: token.to_string(),
            base_url,
        })
    }

    /// Build authorization header value
    fn auth_header(&self) -> String {
        format!("token {}", self.token)
    }

    /// Convert Gitea PR response to PullRequestInfo
    fn map_pull_request(pr: GiteaPullRequest) -> PullRequestInfo {
        let state = if pr.merged {
            MergeStatus::Merged
        } else {
            match pr.state.as_str() {
                "open" => MergeStatus::Open,
                "closed" => MergeStatus::Closed,
                _ => MergeStatus::Unknown,
            }
        };

        PullRequestInfo {
            number: pr.number,
            url: pr.html_url,
            status: state,
            merged_at: pr.merged_at.map(|dt| dt.and_utc()),
            merge_commit_sha: pr.merge_commit_sha,
        }
    }
}

#[async_trait]
impl GitPlatformService for GiteaService {
    async fn check_token(&self) -> Result<(), GitPlatformError> {
        let url = format!("{}/api/v1/user", self.base_url);

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| GitPlatformError::Http(format!("Failed to check token: {e}")))?;

        match response.status() {
            StatusCode::OK => Ok(()),
            StatusCode::UNAUTHORIZED => Err(GitPlatformError::TokenInvalid),
            StatusCode::FORBIDDEN => Err(GitPlatformError::InsufficientPermissions),
            status => Err(GitPlatformError::Http(format!(
                "Token check failed with status: {status}"
            ))),
        }
    }

    async fn create_pr(
        &self,
        repo_info: &RepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitPlatformError> {
        (|| async { self.create_pr_internal(repo_info, request).await })
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|e| e.should_retry())
            .notify(|err: &GitPlatformError, dur: Duration| {
                tracing::warn!(
                    "Gitea API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

    async fn update_pr_status(
        &self,
        repo_info: &RepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, GitPlatformError> {
        (|| async {
            let url = format!(
                "{}/api/v1/repos/{}/{}/pulls/{}",
                self.base_url, repo_info.owner, repo_info.repo_name, pr_number
            );

            let response = self
                .client
                .get(&url)
                .header("Authorization", self.auth_header())
                .send()
                .await
                .map_err(|e| {
                    GitPlatformError::PullRequest(format!("Failed to get PR #{pr_number}: {e}"))
                })?;

            match response.status() {
                StatusCode::OK => {
                    let pr: GiteaPullRequest = response.json().await.map_err(|e| {
                        GitPlatformError::Parse(format!("Failed to parse PR response: {e}"))
                    })?;
                    Ok(Self::map_pull_request(pr))
                }
                StatusCode::UNAUTHORIZED => Err(GitPlatformError::TokenInvalid),
                StatusCode::FORBIDDEN => Err(GitPlatformError::InsufficientPermissions),
                StatusCode::NOT_FOUND => Err(GitPlatformError::RepoNotFoundOrNoAccess),
                status => Err(GitPlatformError::PullRequest(format!(
                    "Failed to get PR #{pr_number} with status: {status}"
                ))),
            }
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|err| err.should_retry())
        .notify(|err: &GitPlatformError, dur: Duration| {
            tracing::warn!(
                "Gitea API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn list_all_prs_for_branch(
        &self,
        repo_info: &RepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitPlatformError> {
        (|| async {
            self.list_all_prs_for_branch_internal(repo_info, branch_name)
                .await
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e| e.should_retry())
        .notify(|err: &GitPlatformError, dur: Duration| {
            tracing::warn!(
                "Gitea API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    #[cfg(feature = "cloud")]
    async fn list_repositories(&self, page: u8) -> Result<Vec<RepositoryInfo>, GitPlatformError> {
        (|| async { self.list_repositories_internal(page).await })
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|err| err.should_retry())
            .notify(|err: &GitPlatformError, dur: Duration| {
                tracing::warn!(
                    "Gitea API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

    fn parse_repo_url(&self, remote_url: &str) -> Result<RepoInfo, GitPlatformError> {
        RepoInfo::from_gitea_url(remote_url, &self.base_url)
    }
}

impl GiteaService {
    async fn create_pr_internal(
        &self,
        repo_info: &RepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitPlatformError> {
        // Verify repository access
        let repo_url = format!(
            "{}/api/v1/repos/{}/{}",
            self.base_url, repo_info.owner, repo_info.repo_name
        );

        let repo_response = self
            .client
            .get(&repo_url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| {
                GitPlatformError::Repository(format!(
                    "Cannot access repository {}/{}: {}",
                    repo_info.owner, repo_info.repo_name, e
                ))
            })?;

        if !repo_response.status().is_success() {
            return Err(match repo_response.status() {
                StatusCode::UNAUTHORIZED => GitPlatformError::TokenInvalid,
                StatusCode::FORBIDDEN => GitPlatformError::InsufficientPermissions,
                StatusCode::NOT_FOUND => GitPlatformError::RepoNotFoundOrNoAccess,
                status => GitPlatformError::Repository(format!(
                    "Cannot access repository {}/{}: {}",
                    repo_info.owner, repo_info.repo_name, status
                )),
            });
        }

        // Check if the base branch exists
        let base_branch_url = format!(
            "{}/api/v1/repos/{}/{}/branches/{}",
            self.base_url, repo_info.owner, repo_info.repo_name, request.base_branch
        );

        let base_response = self
            .client
            .get(&base_branch_url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| {
                GitPlatformError::Branch(format!("Failed to check base branch: {e}"))
            })?;

        if !base_response.status().is_success() {
            let hint = if request.base_branch != "main" {
                " Perhaps you meant to use main as your base branch instead?"
            } else {
                ""
            };
            return Err(GitPlatformError::Branch(format!(
                "Base branch '{}' does not exist{}",
                request.base_branch, hint
            )));
        }

        // Check if the head branch exists
        let head_branch_url = format!(
            "{}/api/v1/repos/{}/{}/branches/{}",
            self.base_url, repo_info.owner, repo_info.repo_name, request.head_branch
        );

        let head_response = self
            .client
            .get(&head_branch_url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| {
                GitPlatformError::Branch(format!("Failed to check head branch: {e}"))
            })?;

        if !head_response.status().is_success() {
            return Err(GitPlatformError::Branch(format!(
                "Head branch '{}' does not exist",
                request.head_branch
            )));
        }

        // Create the pull request
        let pr_url = format!(
            "{}/api/v1/repos/{}/{}/pulls",
            self.base_url, repo_info.owner, repo_info.repo_name
        );

        let pr_body = serde_json::json!({
            "title": request.title,
            "body": request.body.as_deref().unwrap_or(""),
            "head": request.head_branch,
            "base": request.base_branch,
        });

        let pr_response = self
            .client
            .post(&pr_url)
            .header("Authorization", self.auth_header())
            .header("Content-Type", "application/json")
            .json(&pr_body)
            .send()
            .await
            .map_err(|e| {
                GitPlatformError::PullRequest(format!("Failed to create PR: {e}"))
            })?;

        match pr_response.status() {
            StatusCode::CREATED => {
                let pr: GiteaPullRequest = pr_response.json().await.map_err(|e| {
                    GitPlatformError::Parse(format!("Failed to parse PR response: {e}"))
                })?;

                info!(
                    "Created Gitea PR #{} for branch {} in {}/{}",
                    pr.number, request.head_branch, repo_info.owner, repo_info.repo_name
                );

                Ok(Self::map_pull_request(pr))
            }
            StatusCode::UNAUTHORIZED => Err(GitPlatformError::TokenInvalid),
            StatusCode::FORBIDDEN => Err(GitPlatformError::InsufficientPermissions),
            StatusCode::NOT_FOUND => Err(GitPlatformError::RepoNotFoundOrNoAccess),
            status => {
                let error_text = pr_response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unknown error".to_string());
                Err(GitPlatformError::PullRequest(format!(
                    "Failed to create PR for '{} -> {}': {} - {}",
                    request.head_branch, request.base_branch, status, error_text
                )))
            }
        }
    }

    async fn list_all_prs_for_branch_internal(
        &self,
        repo_info: &RepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitPlatformError> {
        let url = format!(
            "{}/api/v1/repos/{}/{}/pulls?state=all&limit=100",
            self.base_url, repo_info.owner, repo_info.repo_name
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| {
                GitPlatformError::PullRequest(format!(
                    "Failed to list PRs for branch '{branch_name}': {e}"
                ))
            })?;

        match response.status() {
            StatusCode::OK => {
                let all_prs: Vec<GiteaPullRequest> = response.json().await.map_err(|e| {
                    GitPlatformError::Parse(format!("Failed to parse PRs response: {e}"))
                })?;

                // Filter by head branch
                let prs: Vec<PullRequestInfo> = all_prs
                    .into_iter()
                    .filter(|pr| {
                        pr.head
                            .as_ref()
                            .map(|h| h.ref_field == branch_name)
                            .unwrap_or(false)
                    })
                    .map(Self::map_pull_request)
                    .collect();

                Ok(prs)
            }
            StatusCode::UNAUTHORIZED => Err(GitPlatformError::TokenInvalid),
            StatusCode::FORBIDDEN => Err(GitPlatformError::InsufficientPermissions),
            StatusCode::NOT_FOUND => Err(GitPlatformError::RepoNotFoundOrNoAccess),
            status => Err(GitPlatformError::PullRequest(format!(
                "Failed to list PRs with status: {status}"
            ))),
        }
    }

    #[cfg(feature = "cloud")]
    async fn list_repositories_internal(
        &self,
        page: u8,
    ) -> Result<Vec<RepositoryInfo>, GitPlatformError> {
        let url = format!(
            "{}/api/v1/user/repos?page={}&limit=50",
            self.base_url, page
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| {
                GitPlatformError::Repository(format!("Failed to list repositories: {e}"))
            })?;

        match response.status() {
            StatusCode::OK => {
                let repos: Vec<GiteaRepository> = response.json().await.map_err(|e| {
                    GitPlatformError::Parse(format!("Failed to parse repositories response: {e}"))
                })?;

                let repositories: Vec<RepositoryInfo> = repos
                    .into_iter()
                    .map(|repo| RepositoryInfo {
                        id: repo.id,
                        name: repo.name,
                        full_name: repo.full_name,
                        owner: repo.owner.login,
                        description: repo.description,
                        clone_url: repo.clone_url,
                        ssh_url: repo.ssh_url,
                        default_branch: repo.default_branch.unwrap_or_else(|| "main".to_string()),
                        private: repo.private,
                    })
                    .collect();

                tracing::info!(
                    "Retrieved {} repositories from Gitea (page {})",
                    repositories.len(),
                    page
                );
                Ok(repositories)
            }
            StatusCode::UNAUTHORIZED => Err(GitPlatformError::TokenInvalid),
            StatusCode::FORBIDDEN => Err(GitPlatformError::InsufficientPermissions),
            status => Err(GitPlatformError::Repository(format!(
                "Failed to list repositories with status: {status}"
            ))),
        }
    }
}

// Gitea API response structures
#[derive(Debug, Deserialize, Serialize)]
struct GiteaPullRequest {
    number: i64,
    html_url: String,
    state: String,
    merged: bool,
    merged_at: Option<chrono::NaiveDateTime>,
    merge_commit_sha: Option<String>,
    head: Option<GiteaPRRef>,
}

#[derive(Debug, Deserialize, Serialize)]
struct GiteaPRRef {
    #[serde(rename = "ref")]
    ref_field: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct GiteaRepository {
    id: i64,
    name: String,
    full_name: String,
    owner: GiteaUser,
    description: Option<String>,
    clone_url: String,
    ssh_url: String,
    default_branch: Option<String>,
    private: bool,
}

#[derive(Debug, Deserialize, Serialize)]
struct GiteaUser {
    login: String,
}
