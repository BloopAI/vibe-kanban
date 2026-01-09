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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pr_state_to_merge_status_open() {
        let pr = create_test_pr("OPEN", false, false);
        let info = pr.to_pull_request_info("https://bitbucket.example.com");
        assert!(matches!(info.status, MergeStatus::Open));
        assert!(info.merged_at.is_none());
    }

    #[test]
    fn test_pr_state_to_merge_status_merged() {
        let pr = create_test_pr("MERGED", false, true);
        let info = pr.to_pull_request_info("https://bitbucket.example.com");
        assert!(matches!(info.status, MergeStatus::Merged));
    }

    #[test]
    fn test_pr_state_to_merge_status_declined() {
        let pr = create_test_pr("DECLINED", false, true);
        let info = pr.to_pull_request_info("https://bitbucket.example.com");
        assert!(matches!(info.status, MergeStatus::Closed));
    }

    #[test]
    fn test_pr_state_to_merge_status_unknown() {
        let pr = create_test_pr("INVALID", false, false);
        let info = pr.to_pull_request_info("https://bitbucket.example.com");
        assert!(matches!(info.status, MergeStatus::Unknown));
    }

    #[test]
    fn test_pr_url_from_links() {
        let mut pr = create_test_pr("OPEN", false, false);
        pr.links.self_links = vec![BitbucketLink {
            href: "https://bitbucket.example.com/projects/PROJ/repos/repo/pull-requests/123".to_string(),
        }];
        let info = pr.to_pull_request_info("https://bitbucket.example.com");
        assert_eq!(info.url, "https://bitbucket.example.com/projects/PROJ/repos/repo/pull-requests/123");
    }

    #[test]
    fn test_pr_number_preserved() {
        let pr = create_test_pr("OPEN", false, false);
        let info = pr.to_pull_request_info("https://bitbucket.example.com");
        assert_eq!(info.number, 42);
    }

    #[test]
    fn test_general_comment_conversion() {
        let comment = BitbucketComment {
            id: 100,
            text: "This is a general comment".to_string(),
            author: BitbucketUser {
                name: "testuser".to_string(),
                display_name: "Test User".to_string(),
                email_address: Some("test@example.com".to_string()),
            },
            created_date: 1704067200000, // 2024-01-01 00:00:00 UTC
            updated_date: None,
            comments: vec![],
            anchor: None,
        };

        let unified = comment.to_unified_comment("https://bitbucket.example.com/pr/1");

        match unified {
            UnifiedPrComment::General { id, author, body, url, .. } => {
                assert_eq!(id, "100");
                assert_eq!(author, "Test User");
                assert_eq!(body, "This is a general comment");
                assert!(url.contains("commentId=100"));
            }
            _ => panic!("Expected General comment"),
        }
    }

    #[test]
    fn test_inline_comment_conversion() {
        let comment = BitbucketComment {
            id: 200,
            text: "This is an inline comment".to_string(),
            author: BitbucketUser {
                name: "reviewer".to_string(),
                display_name: "Code Reviewer".to_string(),
                email_address: None,
            },
            created_date: 1704067200000,
            updated_date: Some(1704153600000),
            comments: vec![],
            anchor: Some(CommentAnchor {
                path: "src/main.rs".to_string(),
                line: Some(42),
                line_type: Some("ADDED".to_string()),
                file_type: Some("TO".to_string()),
                diff_type: Some("@@ -10,5 +10,10 @@".to_string()),
            }),
        };

        let unified = comment.to_unified_comment("https://bitbucket.example.com/pr/1");

        match unified {
            UnifiedPrComment::Review { id, author, body, path, line, diff_hunk, .. } => {
                assert_eq!(id, 200);
                assert_eq!(author, "Code Reviewer");
                assert_eq!(body, "This is an inline comment");
                assert_eq!(path, "src/main.rs");
                assert_eq!(line, Some(42));
                assert_eq!(diff_hunk, "@@ -10,5 +10,10 @@");
            }
            _ => panic!("Expected Review comment"),
        }
    }

    #[test]
    fn test_diff_comment_general_conversion() {
        let comment = BitbucketDiffComment {
            id: 300,
            text: "Diff comment without anchor".to_string(),
            author: BitbucketUser {
                name: "user".to_string(),
                display_name: "User Name".to_string(),
                email_address: None,
            },
            created_date: 1704067200000,
            updated_date: None,
            anchor: None,
        };

        let unified = comment.to_unified_comment("https://bitbucket.example.com/pr/2");
        assert!(matches!(unified, UnifiedPrComment::General { .. }));
    }

    #[test]
    fn test_bitbucket_error_display_single() {
        let error = BitbucketError {
            errors: vec![BitbucketErrorDetail {
                context: None,
                message: "Something went wrong".to_string(),
                exception_name: None,
            }],
        };
        assert_eq!(format!("{}", error), "Something went wrong");
    }

    #[test]
    fn test_bitbucket_error_display_multiple() {
        let error = BitbucketError {
            errors: vec![
                BitbucketErrorDetail {
                    context: Some("field1".to_string()),
                    message: "Error 1".to_string(),
                    exception_name: None,
                },
                BitbucketErrorDetail {
                    context: Some("field2".to_string()),
                    message: "Error 2".to_string(),
                    exception_name: Some("ValidationException".to_string()),
                },
            ],
        };
        assert_eq!(format!("{}", error), "Error 1; Error 2");
    }

    #[test]
    fn test_paged_response_deserialization() {
        let json = r#"{
            "values": [{"name": "test", "displayName": "Test", "emailAddress": "test@example.com"}],
            "size": 1,
            "isLastPage": true
        }"#;

        let response: PagedResponse<BitbucketUser> = serde_json::from_str(json).unwrap();
        assert_eq!(response.size, 1);
        assert!(response.is_last_page);
        assert_eq!(response.values.len(), 1);
        assert_eq!(response.values[0].name, "test");
    }

    #[test]
    fn test_create_pr_request_serialization() {
        let request = CreatePullRequestRequest {
            title: "Test PR".to_string(),
            description: Some("Description".to_string()),
            from_ref: RefSpec {
                id: "refs/heads/feature".to_string(),
                repository: RepositorySpec {
                    slug: "repo".to_string(),
                    project: ProjectSpec {
                        key: "PROJ".to_string(),
                    },
                },
            },
            to_ref: RefSpec {
                id: "refs/heads/main".to_string(),
                repository: RepositorySpec {
                    slug: "repo".to_string(),
                    project: ProjectSpec {
                        key: "PROJ".to_string(),
                    },
                },
            },
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"title\":\"Test PR\""));
        assert!(json.contains("\"description\":\"Description\""));
        assert!(json.contains("\"fromRef\""));
        assert!(json.contains("\"toRef\""));
    }

    #[test]
    fn test_create_pr_request_no_description() {
        let request = CreatePullRequestRequest {
            title: "Test PR".to_string(),
            description: None,
            from_ref: RefSpec {
                id: "refs/heads/feature".to_string(),
                repository: RepositorySpec {
                    slug: "repo".to_string(),
                    project: ProjectSpec { key: "PROJ".to_string() },
                },
            },
            to_ref: RefSpec {
                id: "refs/heads/main".to_string(),
                repository: RepositorySpec {
                    slug: "repo".to_string(),
                    project: ProjectSpec { key: "PROJ".to_string() },
                },
            },
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(!json.contains("description")); // skipped when None
    }

    // Helper function to create test PR
    fn create_test_pr(state: &str, open: bool, closed: bool) -> BitbucketPullRequest {
        BitbucketPullRequest {
            id: 42,
            title: "Test PR".to_string(),
            description: Some("Test description".to_string()),
            state: state.to_string(),
            open,
            closed,
            from_ref: BitbucketRef {
                id: "refs/heads/feature".to_string(),
                display_id: "feature".to_string(),
                latest_commit: Some("abc123".to_string()),
            },
            to_ref: BitbucketRef {
                id: "refs/heads/main".to_string(),
                display_id: "main".to_string(),
                latest_commit: Some("def456".to_string()),
            },
            author: BitbucketParticipant {
                user: BitbucketUser {
                    name: "author".to_string(),
                    display_name: "Author Name".to_string(),
                    email_address: Some("author@example.com".to_string()),
                },
                role: "AUTHOR".to_string(),
                approved: false,
                status: None,
            },
            reviewers: vec![],
            created_date: 1704067200000,
            updated_date: 1704153600000,
            closed_date: if closed { Some(1704240000000) } else { None },
            links: BitbucketLinks { self_links: vec![] },
        }
    }
}
