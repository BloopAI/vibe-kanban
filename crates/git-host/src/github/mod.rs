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

use crate::{
    GitHostProvider,
    types::{
        CreatePrRequest, GitHostError, OpenPrInfo, PrComment, PrReviewComment, ProviderKind,
        UnifiedPrComment,
    },
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
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<PrComment>, GitHostError> {
        let cli = cli.clone();
        let repo_info = repo_info.clone();

        (|| async {
            let cli = cli.clone();
            let repo_info = repo_info.clone();

            let comments = task::spawn_blocking(move || cli.get_pr_comments(&repo_info, pr_number))
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
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<PrReviewComment>, GitHostError> {
        let cli = cli.clone();
        let repo_info = repo_info.clone();

        (|| async {
            let cli = cli.clone();
            let repo_info = repo_info.clone();

            let comments =
                task::spawn_blocking(move || cli.get_pr_review_comments(&repo_info, pr_number))
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
                } else if lower.contains("not a git repository") {
                    GitHostError::NotAGitRepository(msg.clone())
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
            let target_repo = target_repo_info.clone();
            let repo_path = repo_path.to_path_buf();

            let cli_result =
                task::spawn_blocking(move || cli.create_pr(&request, &target_repo, &repo_path))
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
            let repo_info = repo_info.clone();
            let branch = branch.clone();

            let prs = task::spawn_blocking(move || cli.list_prs_for_branch(&repo_info, &branch))
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
            self.fetch_general_comments(&cli1, &repo_info, pr_number),
            self.fetch_review_comments(&cli2, &repo_info, pr_number)
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
                resolved: c.resolved,
            });
        }

        // Sort by creation time
        unified.sort_by_key(|c| c.created_at());

        // Filter out resolved review comments (keep all general comments)
        let filtered_comments: Vec<UnifiedPrComment> = unified
            .into_iter()
            .filter(|comment| match comment {
                UnifiedPrComment::Review { resolved, .. } => !resolved,
                UnifiedPrComment::General { .. } => true,
            })
            .collect();

        Ok(filtered_comments)
    }

    async fn list_open_prs(
        &self,
        repo_path: &Path,
        remote_url: &str,
    ) -> Result<Vec<OpenPrInfo>, GitHostError> {
        let repo_info = self.get_repo_info(remote_url, repo_path).await?;

        let cli = self.gh_cli.clone();

        (|| async {
            let cli = cli.clone();
            let owner = repo_info.owner.clone();
            let repo_name = repo_info.repo_name.clone();

            let prs = task::spawn_blocking(move || cli.list_open_prs(&owner, &repo_name))
                .await
                .map_err(|err| {
                    GitHostError::PullRequest(format!(
                        "Failed to execute GitHub CLI for listing open PRs: {err}"
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

    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::GitHub
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::*;

    /// Test data based on GitHub API response structure for review comments
    /// This simulates real API responses with resolved and unresolved comments
    fn create_test_general_comment(id: &str, body: &str) -> PrComment {
        PrComment {
            id: id.to_string(),
            author: CommentUser {
                login: "test-user".to_string(),
            },
            author_association: "CONTRIBUTOR".to_string(),
            body: body.to_string(),
            created_at: Utc::now(),
            url: format!("https://github.com/test/repo/issues/1#issuecomment-{}", id),
        }
    }

    fn create_test_review_comment(
        id: i64,
        body: &str,
        resolved: bool,
        path: &str,
    ) -> PrReviewComment {
        PrReviewComment {
            id,
            user: ReviewCommentUser {
                login: "test-reviewer".to_string(),
            },
            body: body.to_string(),
            created_at: Utc::now(),
            html_url: format!("https://github.com/test/repo/pull/1#discussion_r{}", id),
            path: path.to_string(),
            line: Some(42),
            side: Some("RIGHT".to_string()),
            diff_hunk: "@@ -40,6 +40,7 @@ impl Foo {".to_string(),
            author_association: "CONTRIBUTOR".to_string(),
            resolved,
        }
    }

    #[test]
    fn test_filters_out_resolved_review_comments() {
        // Simulate the filtering logic that happens in get_pr_comments
        let general_comments = vec![
            create_test_general_comment("1", "This is a general comment"),
            create_test_general_comment("2", "Another general comment"),
        ];

        let review_comments = vec![
            create_test_review_comment(101, "Please fix this typo", false, "src/main.rs"),
            create_test_review_comment(102, "This was fixed, thanks!", true, "src/lib.rs"),
            create_test_review_comment(103, "Still needs work", false, "src/util.rs"),
            create_test_review_comment(104, "Resolved in latest commit", true, "src/main.rs"),
        ];

        // Convert to unified format (simulating the logic in get_pr_comments)
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
                resolved: c.resolved,
            });
        }

        // Apply the filtering logic (from get_pr_comments lines 354-361)
        let filtered_comments: Vec<UnifiedPrComment> = unified
            .into_iter()
            .filter(|comment| match comment {
                UnifiedPrComment::Review { resolved, .. } => !resolved,
                UnifiedPrComment::General { .. } => true,
            })
            .collect();

        // Verify expectations:
        // - 2 general comments (all kept)
        // - 2 unresolved review comments (kept)
        // - 2 resolved review comments (filtered out)
        // Total: 4 comments (2 general + 2 unresolved review)
        assert_eq!(
            filtered_comments.len(),
            4,
            "Should have 2 general + 2 unresolved review comments"
        );

        // Count by type
        let general_count = filtered_comments
            .iter()
            .filter(|c| matches!(c, UnifiedPrComment::General { .. }))
            .count();
        let review_count = filtered_comments
            .iter()
            .filter(|c| matches!(c, UnifiedPrComment::Review { .. }))
            .count();

        assert_eq!(general_count, 2, "All general comments should be kept");
        assert_eq!(
            review_count, 2,
            "Only unresolved review comments should be kept"
        );

        // Verify no resolved comments remain
        for comment in &filtered_comments {
            if let UnifiedPrComment::Review { resolved, .. } = comment {
                assert!(!resolved, "Resolved comments should be filtered out");
            }
        }
    }

    #[test]
    fn test_keeps_all_general_comments_regardless_of_review_state() {
        let general_comments = vec![
            create_test_general_comment("10", "First general comment"),
            create_test_general_comment("20", "Second general comment"),
            create_test_general_comment("30", "Third general comment"),
        ];

        let review_comments = vec![
            create_test_review_comment(201, "All resolved", true, "src/main.rs"),
            create_test_review_comment(202, "Also resolved", true, "src/lib.rs"),
        ];

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
                resolved: c.resolved,
            });
        }

        let filtered_comments: Vec<UnifiedPrComment> = unified
            .into_iter()
            .filter(|comment| match comment {
                UnifiedPrComment::Review { resolved, .. } => !resolved,
                UnifiedPrComment::General { .. } => true,
            })
            .collect();

        // Should have 3 general comments (all review comments are resolved and filtered)
        assert_eq!(
            filtered_comments.len(),
            3,
            "All general comments should be kept even when all review comments are resolved"
        );

        // All should be general comments
        for comment in &filtered_comments {
            assert!(
                matches!(comment, UnifiedPrComment::General { .. }),
                "All remaining comments should be general comments"
            );
        }
    }

    #[test]
    fn test_empty_when_only_resolved_review_comments() {
        let review_comments = vec![
            create_test_review_comment(301, "Resolved comment 1", true, "src/main.rs"),
            create_test_review_comment(302, "Resolved comment 2", true, "src/lib.rs"),
            create_test_review_comment(303, "Resolved comment 3", true, "src/util.rs"),
        ];

        let mut unified: Vec<UnifiedPrComment> = Vec::new();

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
                resolved: c.resolved,
            });
        }

        let filtered_comments: Vec<UnifiedPrComment> = unified
            .into_iter()
            .filter(|comment| match comment {
                UnifiedPrComment::Review { resolved, .. } => !resolved,
                UnifiedPrComment::General { .. } => true,
            })
            .collect();

        assert_eq!(
            filtered_comments.len(),
            0,
            "Should have no comments when all review comments are resolved"
        );
    }

    #[test]
    fn test_keeps_all_unresolved_review_comments() {
        let review_comments = vec![
            create_test_review_comment(401, "Needs attention", false, "src/main.rs"),
            create_test_review_comment(402, "Please address", false, "src/lib.rs"),
            create_test_review_comment(403, "Fix this", false, "src/util.rs"),
        ];

        let mut unified: Vec<UnifiedPrComment> = Vec::new();

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
                resolved: c.resolved,
            });
        }

        let filtered_comments: Vec<UnifiedPrComment> = unified
            .into_iter()
            .filter(|comment| match comment {
                UnifiedPrComment::Review { resolved, .. } => !resolved,
                UnifiedPrComment::General { .. } => true,
            })
            .collect();

        assert_eq!(
            filtered_comments.len(),
            3,
            "All unresolved review comments should be kept"
        );

        // Verify all are review comments and none are resolved
        for comment in &filtered_comments {
            match comment {
                UnifiedPrComment::Review { resolved, .. } => {
                    assert!(!resolved, "All kept review comments should be unresolved");
                }
                _ => panic!("Expected only review comments"),
            }
        }
    }
}
