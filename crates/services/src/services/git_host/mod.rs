mod types;

pub mod azure;
pub mod forgejo;
pub mod github;

use std::{collections::HashMap, path::Path, sync::Arc};

use async_trait::async_trait;
use db::models::merge::PullRequestInfo;
use enum_dispatch::enum_dispatch;
use tokio::sync::RwLock;
pub use types::{
    CreatePrRequest, GitHostError, OpenPrInfo, PrComment, PrCommentAuthor, PrReviewComment,
    ProviderKind, ReviewCommentUser, UnifiedPrComment,
};

use self::{azure::AzureDevOpsProvider, forgejo::ForgejoProvider, github::GitHubProvider};
use crate::services::config::Config;

#[async_trait]
#[enum_dispatch(GitHostService)]
pub trait GitHostProvider: Send + Sync {
    async fn create_pr(
        &self,
        repo_path: &Path,
        remote_url: &str,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHostError>;

    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestInfo, GitHostError>;

    async fn list_prs_for_branch(
        &self,
        repo_path: &Path,
        remote_url: &str,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHostError>;

    async fn get_pr_comments(
        &self,
        repo_path: &Path,
        remote_url: &str,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError>;

    async fn list_open_prs(
        &self,
        repo_path: &Path,
        remote_url: &str,
    ) -> Result<Vec<OpenPrInfo>, GitHostError>;

    fn provider_kind(&self) -> ProviderKind;
}

#[enum_dispatch]
pub enum GitHostService {
    GitHub(GitHubProvider),
    AzureDevOps(AzureDevOpsProvider),
    Forgejo(ForgejoProvider),
}

/// Configuration for git hosts, mapping domains to providers and tokens.
#[derive(Debug, Clone, Default)]
pub struct GitHostConfig {
    /// Map of host domain -> (provider, optional token)
    pub hosts: HashMap<String, GitHostEntry>,
}

/// Configuration entry for a single git host.
#[derive(Debug, Clone)]
pub struct GitHostEntry {
    pub provider: ProviderKind,
    pub token: Option<String>,
}

impl From<&Config> for GitHostConfig {
    fn from(config: &Config) -> Self {
        GitHostConfig {
            hosts: config
                .git_hosts
                .hosts
                .iter()
                .map(|(domain, entry)| {
                    (
                        domain.clone(),
                        GitHostEntry {
                            provider: entry.provider,
                            token: entry.token.clone(),
                        },
                    )
                })
                .collect(),
        }
    }
}

impl GitHostService {
    /// Create a GitHostService from a URL, checking static patterns first then configured hosts.
    pub async fn from_url(url: &str, config: Arc<RwLock<Config>>) -> Result<Self, GitHostError> {
        // Static checks first - config not locked
        if GitHubProvider::matches_url_static(url) {
            return Ok(Self::GitHub(GitHubProvider::new()));
        }
        if AzureDevOpsProvider::matches_url_static(url) {
            return Ok(Self::AzureDevOps(AzureDevOpsProvider::new()));
        }
        if ForgejoProvider::matches_url_static(url) {
            return Ok(Self::Forgejo(ForgejoProvider::new(config)));
        }

        // Configured checks - needs lock
        let forgejo = ForgejoProvider::new(config);
        if forgejo.matches_url_configured(url).await {
            return Ok(Self::Forgejo(forgejo));
        }

        Err(GitHostError::UnsupportedProvider)
    }
}
