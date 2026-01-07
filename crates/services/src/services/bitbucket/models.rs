//! Bitbucket Server API response models.
//!
//! These types map to the Bitbucket Server REST API v1.0 JSON responses
//! and provide conversion to the unified data models used by the application.

use chrono::{TimeZone, Utc};
use db::models::merge::{MergeStatus, PullRequestInfo};
use serde::{Deserialize, Serialize};

use crate::services::github::UnifiedPrComment;

/// Bitbucket Server paged response wrapper
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagedResponse<T> {
    pub values: Vec<T>,
    pub size: i64,
    pub is_last_page: bool,
    #[serde(default)]
    pub next_page_start: Option<i64>,
}

/// Bitbucket Server user
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketUser {
    pub name: String,
    pub display_name: String,
    #[serde(default)]
    pub email_address: Option<String>,
}

/// Bitbucket Server ref (branch reference)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketRef {
    pub id: String,
    pub display_id: String,
    #[serde(default)]
    pub latest_commit: Option<String>,
}

/// Bitbucket Server repository
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketRepository {
    pub slug: String,
    pub name: String,
    pub project: BitbucketProject,
}

/// Bitbucket Server project
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketProject {
    pub key: String,
    pub name: String,
}

/// Bitbucket Server pull request participant
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketParticipant {
    pub user: BitbucketUser,
    pub role: String, // "AUTHOR", "REVIEWER", "PARTICIPANT"
    pub approved: bool,
    #[serde(default)]
    pub status: Option<String>, // "UNAPPROVED", "NEEDS_WORK", "APPROVED"
}

/// Bitbucket Server pull request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketPullRequest {
    pub id: i64,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub state: String, // "OPEN", "MERGED", "DECLINED"
    pub open: bool,
    pub closed: bool,
    pub from_ref: BitbucketRef,
    pub to_ref: BitbucketRef,
    pub author: BitbucketParticipant,
    #[serde(default)]
    pub reviewers: Vec<BitbucketParticipant>,
    pub created_date: i64, // milliseconds since epoch
    pub updated_date: i64,
    #[serde(default)]
    pub closed_date: Option<i64>,
    pub links: BitbucketLinks,
}

impl BitbucketPullRequest {
    /// Convert to the unified PullRequestInfo model
    pub fn to_pull_request_info(&self, base_url: &str) -> PullRequestInfo {
        let status = match self.state.as_str() {
            "OPEN" => MergeStatus::Open,
            "MERGED" => MergeStatus::Merged,
            "DECLINED" => MergeStatus::Closed,
            _ => MergeStatus::Unknown,
        };

        // Extract the self link for the PR URL
        let url = self
            .links
            .self_links
            .first()
            .map(|l| l.href.clone())
            .unwrap_or_else(|| {
                format!(
                    "{}/projects/{}/repos/{}/pull-requests/{}",
                    base_url,
                    self.to_ref.id.split('/').nth(2).unwrap_or(""),
                    self.from_ref.display_id,
                    self.id
                )
            });

        let merged_at = if matches!(status, MergeStatus::Merged) {
            self.closed_date.map(|ms| Utc.timestamp_millis_opt(ms).unwrap())
        } else {
            None
        };

        PullRequestInfo {
            number: self.id,
            url,
            status,
            merged_at,
            merge_commit_sha: None, // Bitbucket doesn't return this directly in PR response
        }
    }
}

/// Bitbucket Server links
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketLinks {
    #[serde(rename = "self", default)]
    pub self_links: Vec<BitbucketLink>,
}

/// Bitbucket Server link
#[derive(Debug, Clone, Deserialize)]
pub struct BitbucketLink {
    pub href: String,
}

/// Request body for creating a pull request
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePullRequestRequest {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub from_ref: RefSpec,
    pub to_ref: RefSpec,
}

/// Reference specification for PR creation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefSpec {
    pub id: String,
    pub repository: RepositorySpec,
}

/// Repository specification for PR creation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySpec {
    pub slug: String,
    pub project: ProjectSpec,
}

/// Project specification for PR creation
#[derive(Debug, Clone, Serialize)]
pub struct ProjectSpec {
    pub key: String,
}

/// Bitbucket Server PR activity (includes comments)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketActivity {
    pub id: i64,
    pub action: String, // "COMMENTED", "APPROVED", "MERGED", etc.
    pub created_date: i64,
    pub user: BitbucketUser,
    #[serde(default)]
    pub comment: Option<BitbucketComment>,
    #[serde(default)]
    pub comment_action: Option<String>, // "ADDED", "EDITED"
}

/// Bitbucket Server comment
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketComment {
    pub id: i64,
    pub text: String,
    pub author: BitbucketUser,
    pub created_date: i64,
    #[serde(default)]
    pub updated_date: Option<i64>,
    #[serde(default)]
    pub comments: Vec<BitbucketComment>, // nested replies
    #[serde(default)]
    pub anchor: Option<CommentAnchor>, // present for inline comments
}

impl BitbucketComment {
    /// Convert to unified PR comment
    pub fn to_unified_comment(&self, pr_url: &str) -> UnifiedPrComment {
        let created_at = Utc.timestamp_millis_opt(self.created_date).unwrap();
        let comment_url = format!("{}?commentId={}", pr_url, self.id);

        if let Some(anchor) = &self.anchor {
            // Inline review comment
            UnifiedPrComment::Review {
                id: self.id,
                author: self.author.display_name.clone(),
                author_association: "CONTRIBUTOR".to_string(), // Bitbucket doesn't have this concept
                body: self.text.clone(),
                created_at,
                url: comment_url,
                path: anchor.path.clone(),
                line: anchor.line,
                diff_hunk: anchor.diff_type.clone().unwrap_or_default(),
            }
        } else {
            // General comment
            UnifiedPrComment::General {
                id: self.id.to_string(),
                author: self.author.display_name.clone(),
                author_association: "CONTRIBUTOR".to_string(),
                body: self.text.clone(),
                created_at,
                url: comment_url,
            }
        }
    }
}

/// Anchor for inline comments
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentAnchor {
    pub path: String,
    #[serde(default)]
    pub line: Option<i64>,
    #[serde(default)]
    pub line_type: Option<String>, // "CONTEXT", "ADDED", "REMOVED"
    #[serde(default)]
    pub file_type: Option<String>, // "FROM", "TO"
    #[serde(default)]
    pub diff_type: Option<String>, // diff hunk context
}

/// Bitbucket Server diff comment (from /comments endpoint)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketDiffComment {
    pub id: i64,
    pub text: String,
    pub author: BitbucketUser,
    pub created_date: i64,
    #[serde(default)]
    pub updated_date: Option<i64>,
    #[serde(default)]
    pub anchor: Option<CommentAnchor>,
}

impl BitbucketDiffComment {
    pub fn to_unified_comment(&self, pr_url: &str) -> UnifiedPrComment {
        let created_at = Utc.timestamp_millis_opt(self.created_date).unwrap();
        let comment_url = format!("{}?commentId={}", pr_url, self.id);

        if let Some(anchor) = &self.anchor {
            UnifiedPrComment::Review {
                id: self.id,
                author: self.author.display_name.clone(),
                author_association: "CONTRIBUTOR".to_string(),
                body: self.text.clone(),
                created_at,
                url: comment_url,
                path: anchor.path.clone(),
                line: anchor.line,
                diff_hunk: anchor.diff_type.clone().unwrap_or_default(),
            }
        } else {
            UnifiedPrComment::General {
                id: self.id.to_string(),
                author: self.author.display_name.clone(),
                author_association: "CONTRIBUTOR".to_string(),
                body: self.text.clone(),
                created_at,
                url: comment_url,
            }
        }
    }
}

/// Bitbucket Server error response
#[derive(Debug, Clone, Deserialize)]
pub struct BitbucketError {
    pub errors: Vec<BitbucketErrorDetail>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitbucketErrorDetail {
    pub context: Option<String>,
    pub message: String,
    pub exception_name: Option<String>,
}

impl std::fmt::Display for BitbucketError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let messages: Vec<_> = self.errors.iter().map(|e| e.message.as_str()).collect();
        write!(f, "{}", messages.join("; "))
    }
}
