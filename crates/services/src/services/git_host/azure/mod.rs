//! Azure DevOps hosting service implementation.

mod cli;

use std::{path::Path, sync::Arc, time::Duration};

use async_trait::async_trait;
use backon::{ExponentialBuilder, Retryable};
pub use cli::AzCli;
use cli::AzCliError;
use db::models::merge::PullRequestInfo;
use tokio::task;
use tracing::info;

use super::{
    GitHostService,
    types::{CreatePrRequest, GitHostError, GitHostProvider, RepoInfo, UnifiedPrComment},
};

/// Azure DevOps hosting service
#[derive(Debug, Clone)]
pub struct AzureHostService {
    az_cli: AzCli,
}

impl AzureHostService {
    pub fn new() -> Result<Self, GitHostError> {
        Ok(Self {
            az_cli: AzCli::new(),
        })
    }
}

impl From<AzCliError> for GitHostError {
    fn from(error: AzCliError) -> Self {
        match &error {
            AzCliError::AuthFailed(msg) => GitHostError::AuthFailed(msg.clone()),
            AzCliError::NotAvailable => GitHostError::CliNotInstalled {
                provider: GitHostProvider::AzureDevOps,
            },
            AzCliError::CommandFailed(msg) => {
                let lower = msg.to_ascii_lowercase();
                if lower.contains("403") || lower.contains("forbidden") {
                    GitHostError::InsufficientPermissions(msg.clone())
                } else if lower.contains("404") || lower.contains("not found") {
                    GitHostError::RepoNotFoundOrNoAccess(msg.clone())
                } else {
                    GitHostError::PullRequest(msg.clone())
                }
            }
            AzCliError::UnexpectedOutput(msg) => GitHostError::UnexpectedOutput(msg.clone()),
        }
    }
}

#[async_trait]
impl GitHostService for AzureHostService {
    async fn get_repo_info(&self, repo_path: &Path) -> Result<RepoInfo, GitHostError> {
        let cli = self.az_cli.clone();
        let path = repo_path.to_path_buf();
        task::spawn_blocking(move || cli.get_repo_info(&path))
            .await
            .map_err(|err| GitHostError::Repository(format!("Failed to get repo info: {err}")))?
            .map_err(Into::into)
    }

    async fn check_auth(&self) -> Result<(), GitHostError> {
        let cli = self.az_cli.clone();
        task::spawn_blocking(move || cli.check_auth())
            .await
            .map_err(|err| {
                GitHostError::Repository(format!(
                    "Failed to execute Azure CLI for auth check: {err}"
                ))
            })?
            .map_err(|err| match err {
                AzCliError::NotAvailable => GitHostError::CliNotInstalled {
                    provider: GitHostProvider::AzureDevOps,
                },
                AzCliError::AuthFailed(msg) => GitHostError::AuthFailed(msg),
                AzCliError::CommandFailed(msg) => {
                    GitHostError::Repository(format!("Azure CLI auth check failed: {msg}"))
                }
                AzCliError::UnexpectedOutput(msg) => GitHostError::Repository(format!(
                    "Unexpected output from Azure CLI auth check: {msg}"
                )),
            })
    }

    async fn create_pr(
        &self,
        repo_info: &RepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHostError> {
        let (organization_url, project, repo_name) = match repo_info {
            RepoInfo::AzureDevOps {
                organization_url,
                project,
                repo_name,
                ..
            } => (organization_url.clone(), project.clone(), repo_name.clone()),
            _ => {
                return Err(GitHostError::Repository(
                    "Azure service received non-Azure repo info".to_string(),
                ));
            }
        };

        let cli = self.az_cli.clone();
        let request_clone = request.clone();

        // Use Arc to share strings across retry attempts
        let organization_url = Arc::new(organization_url);
        let project = Arc::new(project);
        let repo_name = Arc::new(repo_name);

        (|| async {
            let cli = cli.clone();
            let request = request_clone.clone();
            let organization_url = Arc::clone(&organization_url);
            let project = Arc::clone(&project);
            let repo_name = Arc::clone(&repo_name);

            let cli_result = task::spawn_blocking(move || {
                cli.create_pr(&request, &organization_url, &project, &repo_name)
            })
            .await
            .map_err(|err| {
                GitHostError::PullRequest(format!(
                    "Failed to execute Azure CLI for PR creation: {err}"
                ))
            })?
            .map_err(GitHostError::from)?;

            info!(
                "Created Azure DevOps PR #{} for branch {}",
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
                "Azure DevOps API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestInfo, GitHostError> {
        let cli = self.az_cli.clone();
        let url = pr_url.to_string();

        (|| async {
            let cli = cli.clone();
            let url = url.clone();

            let pr = task::spawn_blocking(move || cli.view_pr(&url))
                .await
                .map_err(|err| {
                    GitHostError::PullRequest(format!(
                        "Failed to execute Azure CLI for viewing PR: {err}"
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
                "Azure DevOps API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn list_prs_for_branch(
        &self,
        repo_info: &RepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHostError> {
        let (organization_url, project, repo_name) = match repo_info {
            RepoInfo::AzureDevOps {
                organization_url,
                project,
                repo_name,
                ..
            } => (organization_url.clone(), project.clone(), repo_name.clone()),
            _ => {
                return Err(GitHostError::Repository(
                    "Azure service received non-Azure repo info".to_string(),
                ));
            }
        };

        let cli = self.az_cli.clone();
        let branch = branch_name.to_string();

        // Use Arc to share strings across retry attempts
        let organization_url = Arc::new(organization_url);
        let project = Arc::new(project);
        let repo_name = Arc::new(repo_name);

        (|| async {
            let cli = cli.clone();
            let organization_url = Arc::clone(&organization_url);
            let project = Arc::clone(&project);
            let repo_name = Arc::clone(&repo_name);
            let branch = branch.clone();

            let prs = task::spawn_blocking(move || {
                cli.list_prs_for_branch(&organization_url, &project, &repo_name, &branch)
            })
            .await
            .map_err(|err| {
                GitHostError::PullRequest(format!(
                    "Failed to execute Azure CLI for listing PRs: {err}"
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
                "Azure DevOps API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn get_pr_comments(
        &self,
        repo_info: &RepoInfo,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError> {
        let (organization_url, project_id, repo_id) = match repo_info {
            RepoInfo::AzureDevOps {
                organization_url,
                project_id,
                repo_id,
                ..
            } => (
                organization_url.clone(),
                project_id.clone(),
                repo_id.clone(),
            ),
            _ => {
                return Err(GitHostError::Repository(
                    "Azure service received non-Azure repo info".to_string(),
                ));
            }
        };

        let cli = self.az_cli.clone();

        // Use Arc to share strings across retry attempts
        let organization_url = Arc::new(organization_url);
        let project_id = Arc::new(project_id);
        let repo_id = Arc::new(repo_id);

        (|| async {
            let cli = cli.clone();
            let organization_url = Arc::clone(&organization_url);
            let project_id = Arc::clone(&project_id);
            let repo_id = Arc::clone(&repo_id);

            let comments = task::spawn_blocking(move || {
                cli.get_pr_threads(&organization_url, &project_id, &repo_id, pr_number)
            })
            .await
            .map_err(|err| {
                GitHostError::PullRequest(format!(
                    "Failed to execute Azure CLI for fetching PR comments: {err}"
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
                "Azure DevOps API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    fn provider(&self) -> GitHostProvider {
        GitHostProvider::AzureDevOps
    }
}
