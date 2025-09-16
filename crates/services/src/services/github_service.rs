use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use db::models::merge::{MergeStatus, PullRequestInfo};
use octocrab::{Octocrab, OctocrabBuilder};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::info;
use ts_rs::TS;

use crate::services::git::GitServiceError;

#[derive(Debug, Error, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum GitHubServiceError {
    #[ts(skip)]
    #[serde(skip)]
    #[error(transparent)]
    Client(octocrab::Error),
    #[ts(skip)]
    #[error("Authentication error: {0}")]
    Auth(String),
    #[ts(skip)]
    #[error("Repository error: {0}")]
    Repository(String),
    #[ts(skip)]
    #[error("Pull request error: {0}")]
    PullRequest(String),
    #[ts(skip)]
    #[error("Branch error: {0}")]
    Branch(String),
    #[error("GitHub token is invalid or expired.")]
    TokenInvalid,
    #[error("Insufficient permissions")]
    InsufficientPermissions,
    #[error("GitHub repository not found or no access")]
    RepoNotFoundOrNoAccess,
    #[ts(skip)]
    #[serde(skip)]
    #[error(transparent)]
    GitService(GitServiceError),
}

impl From<octocrab::Error> for GitHubServiceError {
    fn from(err: octocrab::Error) -> Self {
        match &err {
            octocrab::Error::GitHub { source, .. } => {
                let status = source.status_code.as_u16();
                let msg = source.message.to_ascii_lowercase();
                if status == 401 || msg.contains("bad credentials") || msg.contains("token expired")
                {
                    GitHubServiceError::TokenInvalid
                } else if status == 403 {
                    GitHubServiceError::InsufficientPermissions
                } else {
                    GitHubServiceError::Client(err)
                }
            }
            _ => GitHubServiceError::Client(err),
        }
    }
}
impl From<GitServiceError> for GitHubServiceError {
    fn from(error: GitServiceError) -> Self {
        if let GitServiceError::Git(err) = error {
            if err
                .message()
                .contains("too many redirects or authentication replays")
            {
                Self::TokenInvalid
            } else if err.message().contains("status code: 403") {
                Self::InsufficientPermissions
            } else if err.message().contains("status code: 404") {
                Self::RepoNotFoundOrNoAccess
            } else {
                Self::GitService(GitServiceError::Git(err))
            }
        } else {
            Self::GitService(error)
        }
    }
}

impl GitHubServiceError {
    pub fn is_api_data(&self) -> bool {
        matches!(
            self,
            GitHubServiceError::TokenInvalid
                | GitHubServiceError::InsufficientPermissions
                | GitHubServiceError::RepoNotFoundOrNoAccess
        )
    }
}

#[derive(Debug, Clone)]
pub struct GitHubRepoInfo {
    pub owner: String,
    pub repo_name: String,
}
impl GitHubRepoInfo {
    pub fn from_pr_url(pr_url: &str) -> Result<Self, sqlx::Error> {
        let re = regex::Regex::new(r"github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)").unwrap();
        let caps = re
            .captures(pr_url)
            .ok_or_else(|| sqlx::Error::ColumnNotFound("Invalid URL format".into()))?;

        let owner = caps.name("owner").unwrap().as_str().to_string();
        let repo_name = caps.name("repo").unwrap().as_str().to_string();

        Ok(Self { owner, repo_name })
    }
}

#[derive(Debug, Clone)]
pub struct CreatePrRequest {
    pub title: String,
    pub body: Option<String>,
    pub head_branch: String,
    pub base_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RepositoryInfo {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub description: Option<String>,
    pub clone_url: String,
    pub ssh_url: String,
    pub default_branch: String,
    pub private: bool,
}

#[derive(Debug, Clone)]
pub struct GitHubService {
    client: Octocrab,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum IssueStateFilter {
    Open,
    Closed,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum IssueState {
    Open,
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubIssue {
    pub id: i64,
    pub number: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: IssueState,
    pub html_url: String,
    pub labels: Vec<String>,
    #[ts(type = "Date")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    #[ts(type = "Date")]
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl GitHubService {
    pub fn new(github_token: &str) -> Result<Self, GitHubServiceError> {
        let client = OctocrabBuilder::new()
            .personal_token(github_token.to_string())
            .build()?;

        Ok(Self { client })
    }

    pub async fn check_token(&self) -> Result<(), GitHubServiceError> {
        self.client.current().user().await?;
        Ok(())
    }

    pub async fn list_issues(
        &self,
        owner: &str,
        repo: &str,
        state: IssueStateFilter,
        labels: Option<&[String]>,
        since: Option<chrono::DateTime<chrono::Utc>>,
        page: Option<u32>,
        per_page: Option<u8>,
    ) -> Result<Vec<GitHubIssue>, GitHubServiceError> {
        use octocrab::params::State;

        let issues_api = self.client.issues(owner, repo);
        let mut builder = issues_api.list();

        builder = builder.state(match state {
            IssueStateFilter::Open => State::Open,
            IssueStateFilter::Closed => State::Closed,
            IssueStateFilter::All => State::All,
        });

        if let Some(ls) = labels {
            if !ls.is_empty() {
                builder = builder.labels(ls);
            }
        }
        if let Some(since) = since {
            builder = builder.since(since);
        }
        if let Some(per) = per_page {
            builder = builder.per_page(per.min(100));
        } else {
            builder = builder.per_page(50);
        }
        if let Some(p) = page {
            builder = builder.page(p);
        }

        let mut issues = Vec::new();
        let page = builder.send().await?;
        for item in page.items {
            // Filter out PRs (they appear in issues feed with pull_request field)
            if item.pull_request.is_some() {
                continue;
            }
            issues.push(Self::map_issue(item));
        }
        Ok(issues)
    }

    pub async fn get_issue(
        &self,
        owner: &str,
        repo: &str,
        number: i64,
    ) -> Result<GitHubIssue, GitHubServiceError> {
        let issue = self
            .client
            .issues(owner, repo)
            .get(number as u64)
            .await?;
        if issue.pull_request.is_some() {
            return Err(GitHubServiceError::PullRequest(format!(
                "Requested issue #{number} is a pull request"
            )));
        }
        Ok(Self::map_issue(issue))
    }

    /// Update issue state (open=false -> close; open=true -> reopen)
    pub async fn update_issue_state(
        &self,
        owner: &str,
        repo: &str,
        number: i64,
        open: bool,
    ) -> Result<(), GitHubServiceError> {
        (|| async {
            self.client
                .issues(owner, repo)
                .update(number as u64)
                .state(if open {
                    octocrab::models::IssueState::Open
                } else {
                    octocrab::models::IssueState::Closed
                })
                .send()
                .await?;
            Ok(())
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(15))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e| {
            !matches!(
                e,
                GitHubServiceError::TokenInvalid | GitHubServiceError::InsufficientPermissions
            )
        })
        .await
    }

    fn map_issue(issue: octocrab::models::issues::Issue) -> GitHubIssue {
        let labels = issue
            .labels
            .into_iter()
            .map(|l| l.name)
            .filter(|s| !s.trim().is_empty())
            .collect::<Vec<_>>();
        GitHubIssue {
            id: issue.id.0 as i64,
            number: issue.number as i64,
            title: issue.title,
            body: issue.body,
            state: match issue.state {
                octocrab::models::IssueState::Open => IssueState::Open,
                octocrab::models::IssueState::Closed => IssueState::Closed,
                _ => IssueState::Open,
            },
            html_url: issue.html_url.to_string(),
            labels,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
        }
    }

    /// Create a pull request on GitHub
    pub async fn create_pr(
        &self,
        repo_info: &GitHubRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        (|| async { self.create_pr_internal(repo_info, request).await })
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|e| {
                !matches!(e, GitHubServiceError::TokenInvalid)
                    && !matches!(e, GitHubServiceError::Branch(_))
            })
            .notify(|err: &GitHubServiceError, dur: Duration| {
                tracing::warn!(
                    "GitHub API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

    async fn create_pr_internal(
        &self,
        repo_info: &GitHubRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        // Verify repository access
        self.client
            .repos(&repo_info.owner, &repo_info.repo_name)
            .get()
            .await
            .map_err(|e| {
                GitHubServiceError::Repository(format!(
                    "Cannot access repository {}/{}: {}",
                    repo_info.owner, repo_info.repo_name, e
                ))
            })?;

        // Check if the base branch exists
        self.client
            .repos(&repo_info.owner, &repo_info.repo_name)
            .get_ref(&octocrab::params::repos::Reference::Branch(
                request.base_branch.clone(),
            ))
            .await
            .map_err(|e| {
                GitHubServiceError::Branch(format!(
                    "Base branch '{}' does not exist: {}",
                    request.base_branch, e
                ))
            })?;

        // Check if the head branch exists
        self.client
            .repos(&repo_info.owner, &repo_info.repo_name)
            .get_ref(&octocrab::params::repos::Reference::Branch(
                request.head_branch.clone(),
            ))
            .await
            .map_err(|e| {
                GitHubServiceError::Branch(format!(
                    "Head branch '{}' does not exist. Make sure the branch was pushed successfully: {}",
                    request.head_branch, e
                ))
            })?;

        // Create the pull request
        let pr = self
            .client
            .pulls(&repo_info.owner, &repo_info.repo_name)
            .create(&request.title, &request.head_branch, &request.base_branch)
            .body(request.body.as_deref().unwrap_or(""))
            .send()
            .await
            .map_err(|e| match e {
                octocrab::Error::GitHub { source, .. } => {
                    if source.status_code.as_u16() == 401
                        || source.status_code.as_u16() == 403
                        || source
                            .message
                            .to_ascii_lowercase()
                            .contains("bad credentials")
                        || source
                            .message
                            .to_ascii_lowercase()
                            .contains("token expired")
                    {
                        GitHubServiceError::TokenInvalid
                    } else {
                        GitHubServiceError::PullRequest(format!(
                            "GitHub API error: {} (status: {})",
                            source.message,
                            source.status_code.as_u16()
                        ))
                    }
                }
                _ => GitHubServiceError::PullRequest(format!("Failed to create PR: {e}")),
            })?;

        let pr_info = PullRequestInfo {
            number: pr.number as i64,
            url: pr.html_url.map(|url| url.to_string()).unwrap_or_default(),
            status: MergeStatus::Open,
            merged_at: None,
            merge_commit_sha: None,
        };

        info!(
            "Created GitHub PR #{} for branch {} in {}/{}",
            pr_info.number, request.head_branch, repo_info.owner, repo_info.repo_name
        );

        Ok(pr_info)
    }

    /// Update and get the status of a pull request
    pub async fn update_pr_status(
        &self,
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        (|| async { self.update_pr_status_internal(repo_info, pr_number).await })
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|e| !matches!(e, GitHubServiceError::TokenInvalid))
            .notify(|err: &GitHubServiceError, dur: Duration| {
                tracing::warn!(
                    "GitHub API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

    async fn update_pr_status_internal(
        &self,
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        let pr = self
            .client
            .pulls(&repo_info.owner, &repo_info.repo_name)
            .get(pr_number as u64)
            .await
            .map_err(|e| {
                GitHubServiceError::PullRequest(format!("Failed to get PR #{pr_number}: {e}"))
            })?;

        let status = match pr.state {
            Some(octocrab::models::IssueState::Open) => MergeStatus::Open,
            Some(octocrab::models::IssueState::Closed) => {
                if pr.merged_at.is_some() {
                    MergeStatus::Merged
                } else {
                    MergeStatus::Closed
                }
            }
            None => MergeStatus::Unknown,
            Some(_) => MergeStatus::Unknown,
        };

        let pr_info = PullRequestInfo {
            number: pr.number as i64,
            url: pr.html_url.map(|url| url.to_string()).unwrap_or_default(),
            status,
            merged_at: pr.merged_at.map(|dt| dt.naive_utc().and_utc()),
            merge_commit_sha: pr.merge_commit_sha.clone(),
        };

        Ok(pr_info)
    }

    /// List repositories for the authenticated user with pagination
    #[cfg(feature = "cloud")]
    pub async fn list_repositories(
        &self,
        page: u8,
    ) -> Result<Vec<RepositoryInfo>, GitHubServiceError> {
        (|| async { self.list_repositories_internal(page).await })
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|e| !matches!(e, GitHubServiceError::TokenInvalid))
            .notify(|err: &GitHubServiceError, dur: Duration| {
                tracing::warn!(
                    "GitHub API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

    #[cfg(feature = "cloud")]
    async fn list_repositories_internal(
        &self,
        page: u8,
    ) -> Result<Vec<RepositoryInfo>, GitHubServiceError> {
        let repos_page = self
            .client
            .current()
            .list_repos_for_authenticated_user()
            .type_("all")
            .sort("updated")
            .direction("desc")
            .per_page(50)
            .page(page)
            .send()
            .await
            .map_err(|e| {
                GitHubServiceError::Repository(format!("Failed to list repositories: {}", e))
            })?;

        let repositories: Vec<RepositoryInfo> = repos_page
            .items
            .into_iter()
            .map(|repo| RepositoryInfo {
                id: repo.id.0 as i64,
                name: repo.name,
                full_name: repo.full_name.unwrap_or_default(),
                owner: repo.owner.map(|o| o.login).unwrap_or_default(),
                description: repo.description,
                clone_url: repo
                    .clone_url
                    .map(|url| url.to_string())
                    .unwrap_or_default(),
                ssh_url: repo.ssh_url.unwrap_or_default(),
                default_branch: repo.default_branch.unwrap_or_else(|| "main".to_string()),
                private: repo.private.unwrap_or(false),
            })
            .collect();

        tracing::info!(
            "Retrieved {} repositories from GitHub (page {})",
            repositories.len(),
            page
        );
        Ok(repositories)
    }
}
