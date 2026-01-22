//! GitHub hosting service implementation.

mod cli;

use std::{path::Path, time::Duration};

use async_trait::async_trait;
use backon::{ExponentialBuilder, Retryable};
pub use cli::GhCli;
use cli::{GhCliError, GitHubRepoInfo};
use db::models::merge::PullRequestInfo;
use tokio::task;
use tracing::info;

use super::{
    GitHostProvider,
    types::{CreatePrRequest, GitHostError, ProviderKind, UnifiedPrComment},
};

#[derive(Debug, Clone)]
pub struct GitHubProvider {
    gh_cli: GhCli,
}

impl GitHubProvider {
    pub fn new() -> Result<Self, GitHostError> {
        Ok(Self {
            gh_cli: GhCli::new(),
        })
    }

    async fn get_repo_info(
        &self,
        remote_url: &str,
        repo_path: &Path,
    ) -> Result<GitHubRepoInfo, GitHostError> {
        let cli = self.gh_cli.clone();
        let url = remote_url.to_string();
        let path = repo_path.to_path_buf();
        task::spawn_blocking(move || cli.get_repo_info(&url, &path))
            .await
            .map_err(|err| {
                GitHostError::Repository(format!("Failed to get repo info from URL: {err}"))
            })?
            .map_err(Into::into)
    }

    async fn fetch_general_comments(
        &self,
        cli: &GhCli,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<Vec<super::types::PrComment>, GitHostError> {
        let cli = cli.clone();
        let owner = owner.to_string();
        let repo = repo.to_string();

        (|| async {
            let cli = cli.clone();
            let owner = owner.clone();
            let repo = repo.clone();

            let comments =
                task::spawn_blocking(move || cli.get_pr_comments(&owner, &repo, pr_number))
                    .await
                    .map_err(|err| {
                        GitHostError::PullRequest(format!(
                            "Failed to execute GitHub CLI for fetching PR comments: {err}"
                        ))
                    })?;
            comments.map_err(GitHostError::from)
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "GitHub API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn fetch_review_comments(
        &self,
        cli: &GhCli,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<Vec<super::types::PrReviewComment>, GitHostError> {
        let cli = cli.clone();
        let owner = owner.to_string();
        let repo = repo.to_string();

        (|| async {
            let cli = cli.clone();
            let owner = owner.clone();
            let repo = repo.clone();

            let comments =
                task::spawn_blocking(move || cli.get_pr_review_comments(&owner, &repo, pr_number))
                    .await
                    .map_err(|err| {
                        GitHostError::PullRequest(format!(
                            "Failed to execute GitHub CLI for fetching review comments: {err}"
                        ))
                    })?;
            comments.map_err(GitHostError::from)
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "GitHub API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }
}

impl From<GhCliError> for GitHostError {
    fn from(error: GhCliError) -> Self {
        match &error {
            GhCliError::AuthFailed(msg) => GitHostError::AuthFailed(msg.clone()),
            GhCliError::NotAvailable => GitHostError::CliNotInstalled {
                provider: ProviderKind::GitHub,
            },
            GhCliError::CommandFailed(msg) => {
                let lower = msg.to_ascii_lowercase();
                if lower.contains("403") || lower.contains("forbidden") {
                    GitHostError::InsufficientPermissions(msg.clone())
                } else if lower.contains("404") || lower.contains("not found") {
                    GitHostError::RepoNotFoundOrNoAccess(msg.clone())
                } else {
                    GitHostError::PullRequest(msg.clone())
                }
            }
            GhCliError::UnexpectedOutput(msg) => GitHostError::UnexpectedOutput(msg.clone()),
        }
    }
}

#[async_trait]
impl GitHostProvider for GitHubProvider {
    async fn create_pr(
        &self,
        repo_path: &Path,
        remote_url: &str,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHostError> {
        // Get owner/repo from the remote URL (target repo for the PR).
        let target_repo_info = self.get_repo_info(remote_url, repo_path).await?;

        // For cross-fork PRs, get the head repo info to format head_branch as "owner:branch".
        let head_branch = if let Some(head_url) = &request.head_repo_url {
            let head_repo_info = self.get_repo_info(head_url, repo_path).await?;
            if head_repo_info.owner != target_repo_info.owner {
                format!("{}:{}", head_repo_info.owner, request.head_branch)
            } else {
                request.head_branch.clone()
            }
        } else {
            request.head_branch.clone()
        };

        let mut request_clone = request.clone();
        request_clone.head_branch = head_branch;

        (|| async {
            let cli = self.gh_cli.clone();
            let request = request_clone.clone();
            let owner = target_repo_info.owner.clone();
            let repo_name = target_repo_info.repo_name.clone();
            let repo_path = repo_path.to_path_buf();

            let cli_result = task::spawn_blocking(move || {
                cli.create_pr(&request, &owner, &repo_name, &repo_path)
            })
            .await
            .map_err(|err| {
                GitHostError::PullRequest(format!(
                    "Failed to execute GitHub CLI for PR creation: {err}"
                ))
            })?
            .map_err(GitHostError::from)?;

            info!(
                "Created GitHub PR #{} for branch {}",
                cli_result.number, request_clone.head_branch
            );

            Ok(cli_result)
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "GitHub API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestInfo, GitHostError> {
        let cli = self.gh_cli.clone();
        let url = pr_url.to_string();

        (|| async {
            let cli = cli.clone();
            let url = url.clone();
            let pr = task::spawn_blocking(move || cli.view_pr(&url))
                .await
                .map_err(|err| {
                    GitHostError::PullRequest(format!(
                        "Failed to execute GitHub CLI for viewing PR: {err}"
                    ))
                })?;
            pr.map_err(GitHostError::from)
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|err: &GitHostError| err.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "GitHub API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn list_prs_for_branch(
        &self,
        repo_path: &Path,
        remote_url: &str,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHostError> {
        let repo_info = self.get_repo_info(remote_url, repo_path).await?;

        let cli = self.gh_cli.clone();
        let branch = branch_name.to_string();

        (|| async {
            let cli = cli.clone();
            let owner = repo_info.owner.clone();
            let repo_name = repo_info.repo_name.clone();
            let branch = branch.clone();

            let prs =
                task::spawn_blocking(move || cli.list_prs_for_branch(&owner, &repo_name, &branch))
                    .await
                    .map_err(|err| {
                        GitHostError::PullRequest(format!(
                            "Failed to execute GitHub CLI for listing PRs: {err}"
                        ))
                    })?;
            prs.map_err(GitHostError::from)
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "GitHub API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn get_pr_comments(
        &self,
        repo_path: &Path,
        remote_url: &str,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError> {
        let repo_info = self.get_repo_info(remote_url, repo_path).await?;

        // Fetch both types of comments in parallel
        let cli1 = self.gh_cli.clone();
        let cli2 = self.gh_cli.clone();

        let (general_result, review_result) = tokio::join!(
            self.fetch_general_comments(&cli1, &repo_info.owner, &repo_info.repo_name, pr_number),
            self.fetch_review_comments(&cli2, &repo_info.owner, &repo_info.repo_name, pr_number)
        );

        let general_comments = general_result?;
        let review_comments = review_result?;

        // Convert and merge into unified timeline
        let mut unified: Vec<UnifiedPrComment> = Vec::new();

        for c in general_comments {
            unified.push(UnifiedPrComment::General {
                id: c.id,
                author: c.author.login,
                author_association: Some(c.author_association),
                body: c.body,
                created_at: c.created_at,
                url: Some(c.url),
            });
        }

        for c in review_comments {
            unified.push(UnifiedPrComment::Review {
                id: c.id,
                author: c.user.login,
                author_association: Some(c.author_association),
                body: c.body,
                created_at: c.created_at,
                url: Some(c.html_url),
                path: c.path,
                line: c.line,
                side: c.side,
                diff_hunk: Some(c.diff_hunk),
            });
        }

        // Sort by creation time
        unified.sort_by_key(|c| c.created_at());

        Ok(unified)
    }

    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::GitHub
    }
}
