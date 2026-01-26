mod detection;
mod http;
mod types;

pub mod azure;
pub mod forgejo;
pub mod github;

use std::{collections::HashMap, path::Path};

use async_trait::async_trait;
use db::models::merge::PullRequestInfo;
use detection::detect_provider_from_url;
use enum_dispatch::enum_dispatch;

use crate::services::config::Config;
pub use types::{
    CreatePrRequest, GitHostError, OpenPrInfo, PrComment, PrCommentAuthor, PrReviewComment,
    ProviderKind, ReviewCommentUser, UnifiedPrComment,
};

use self::{azure::AzureDevOpsProvider, forgejo::ForgejoProvider, github::GitHubProvider};

pub use http::extract_host;
// Re-export from below after definition
// pub use GitHostConfig, GitHostEntry;

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
    /// Create a GitHostService from a URL using configuration for self-hosted instances.
    pub fn from_url_with_config(url: &str, config: &GitHostConfig) -> Result<Self, GitHostError> {
        // First check if host is explicitly configured
        if let Some(entry) = config.hosts.get(&extract_host(url)?) {
            return match entry.provider {
                ProviderKind::GitHub => Ok(Self::GitHub(GitHubProvider::new()?)),
                ProviderKind::AzureDevOps => Ok(Self::AzureDevOps(AzureDevOpsProvider::new()?)),
                ProviderKind::Forgejo => Ok(Self::Forgejo(ForgejoProvider::from_remote_url(
                    url,
                    entry
                        .token
                        .clone()
                        .ok_or(GitHostError::ApiTokenMissing(extract_host(url)?))?,
                )?)),
                ProviderKind::Unknown => Err(GitHostError::UnsupportedProvider),
            };
        }

        // Fall back to URL-based detection for well-known hosts
        match detect_provider_from_url(url) {
            ProviderKind::GitHub => Ok(Self::GitHub(GitHubProvider::new()?)),
            ProviderKind::AzureDevOps => Ok(Self::AzureDevOps(AzureDevOpsProvider::new()?)),
            ProviderKind::Forgejo => Err(GitHostError::ApiTokenMissing(extract_host(url)?)),
            ProviderKind::Unknown => Err(GitHostError::HostNotConfigured(extract_host(url)?)),
        }
    }
}
