//! Unified types for git hosting platforms.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

/// Git hosting provider types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum GitHostProvider {
    GitHub,
    AzureDevOps,
    Unknown,
}

impl std::fmt::Display for GitHostProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitHostProvider::GitHub => write!(f, "GitHub"),
            GitHostProvider::AzureDevOps => write!(f, "Azure DevOps"),
            GitHostProvider::Unknown => write!(f, "Unknown"),
        }
    }
}

/// Unified repository info that works for both providers
#[derive(Debug, Clone)]
pub enum RepoInfo {
    GitHub {
        owner: String,
        repo_name: String,
    },
    /// Azure DevOps repo info extracted from CLI response
    AzureDevOps {
        /// Full organization URL like `https://dev.azure.com/org` - used for `--organization` flag
        organization_url: String,
        /// Project name (for display)
        project: String,
        /// Project UUID (for API calls)
        project_id: String,
        /// Repository name (for display)
        repo_name: String,
        /// Repository UUID (for API calls)
        repo_id: String,
    },
}

impl RepoInfo {
    /// Get the provider type for this repo info
    pub fn provider(&self) -> GitHostProvider {
        match self {
            RepoInfo::GitHub { .. } => GitHostProvider::GitHub,
            RepoInfo::AzureDevOps { .. } => GitHostProvider::AzureDevOps,
        }
    }
}

/// Unified PR creation request (provider-agnostic)
#[derive(Debug, Clone)]
pub struct CreatePrRequest {
    pub title: String,
    pub body: Option<String>,
    pub head_branch: String,
    pub base_branch: String,
    pub draft: Option<bool>,
}

/// Unified error type for git host operations
#[derive(Debug, Error)]
pub enum GitHostError {
    #[error("Repository error: {0}")]
    Repository(String),
    #[error("Pull request error: {0}")]
    PullRequest(String),
    #[error("Authentication failed: {0}")]
    AuthFailed(String),
    #[error("Insufficient permissions: {0}")]
    InsufficientPermissions(String),
    #[error("Repository not found or no access: {0}")]
    RepoNotFoundOrNoAccess(String),
    #[error("{provider} CLI is not installed or not available in PATH")]
    CliNotInstalled { provider: GitHostProvider },
    #[error("Unsupported git hosting provider")]
    UnsupportedProvider,
    #[error("CLI returned unexpected output: {0}")]
    UnexpectedOutput(String),
}

impl GitHostError {
    /// Whether this error is retryable
    pub fn should_retry(&self) -> bool {
        !matches!(
            self,
            GitHostError::AuthFailed(_)
                | GitHostError::InsufficientPermissions(_)
                | GitHostError::RepoNotFoundOrNoAccess(_)
                | GitHostError::CliNotInstalled { .. }
                | GitHostError::UnsupportedProvider
        )
    }
}

/// Author information for a PR comment
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PrCommentAuthor {
    pub login: String,
}

/// A single comment on a PR
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PrComment {
    pub id: String,
    pub author: PrCommentAuthor,
    pub author_association: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub url: String,
}

/// User information for a review comment
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ReviewCommentUser {
    pub login: String,
}

/// An inline review comment on a PR
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PrReviewComment {
    pub id: i64,
    pub user: ReviewCommentUser,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub html_url: String,
    pub path: String,
    pub line: Option<i64>,
    pub side: Option<String>,
    pub diff_hunk: String,
    pub author_association: String,
}

/// Unified PR comment that can be either a general comment or review comment
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "comment_type", rename_all = "snake_case")]
#[ts(tag = "comment_type", rename_all = "snake_case")]
pub enum UnifiedPrComment {
    /// General PR comment (conversation)
    General {
        id: String,
        author: String,
        author_association: String,
        body: String,
        created_at: DateTime<Utc>,
        url: String,
    },
    /// Inline review comment (on code)
    Review {
        id: i64,
        author: String,
        author_association: String,
        body: String,
        created_at: DateTime<Utc>,
        url: String,
        path: String,
        line: Option<i64>,
        diff_hunk: String,
    },
}

impl UnifiedPrComment {
    pub fn created_at(&self) -> DateTime<Utc> {
        match self {
            UnifiedPrComment::General { created_at, .. } => *created_at,
            UnifiedPrComment::Review { created_at, .. } => *created_at,
        }
    }
}
