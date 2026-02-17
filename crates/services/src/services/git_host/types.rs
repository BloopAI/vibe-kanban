use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    GitHub,
    AzureDevOps,
    Unknown,
}

impl std::fmt::Display for ProviderKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProviderKind::GitHub => write!(f, "GitHub"),
            ProviderKind::AzureDevOps => write!(f, "Azure DevOps"),
            ProviderKind::Unknown => write!(f, "Unknown"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct CreatePrRequest {
    pub title: String,
    pub body: Option<String>,
    pub head_branch: String,
    pub base_branch: String,
    pub draft: Option<bool>,
    /// URL of the repo containing the head branch (for cross-fork PRs).
    pub head_repo_url: Option<String>,
}

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
    CliNotInstalled { provider: ProviderKind },
    #[error("Not a git repository: {0}")]
    NotAGitRepository(String),
    #[error("Unsupported git hosting provider")]
    UnsupportedProvider,
    #[error("CLI returned unexpected output: {0}")]
    UnexpectedOutput(String),
}

impl GitHostError {
    pub fn should_retry(&self) -> bool {
        !matches!(
            self,
            GitHostError::AuthFailed(_)
                | GitHostError::InsufficientPermissions(_)
                | GitHostError::RepoNotFoundOrNoAccess(_)
                | GitHostError::CliNotInstalled { .. }
                | GitHostError::NotAGitRepository(_)
                | GitHostError::UnsupportedProvider
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PrCommentAuthor {
    pub login: String,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ReviewCommentUser {
    pub login: String,
}

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

#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "comment_type", rename_all = "snake_case")]
#[ts(tag = "comment_type", rename_all = "snake_case")]
pub enum UnifiedPrComment {
    General {
        id: String,
        author: String,
        author_association: Option<String>,
        body: String,
        created_at: DateTime<Utc>,
        url: Option<String>,
    },
    Review {
        id: i64,
        author: String,
        author_association: Option<String>,
        body: String,
        created_at: DateTime<Utc>,
        url: Option<String>,
        path: String,
        line: Option<i64>,
        side: Option<String>,
        diff_hunk: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct OpenPrInfo {
    pub number: i64,
    pub url: String,
    pub title: String,
    pub head_branch: String,
    pub base_branch: String,
}
