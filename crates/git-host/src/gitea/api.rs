//! HTTP client for the Gitea/Forgejo REST API v1.
//!
//! Uses `reqwest` directly instead of shelling out to a CLI binary.
//! Authentication is via a personal access token supplied through the
//! `GITEA_TOKEN` env var.

use chrono::{DateTime, Utc};
use db::models::merge::MergeStatus;
use reqwest::{Client, StatusCode, header};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use url::Url;

use crate::types::{CreatePrRequest, PullRequestDetail, UnifiedPrComment};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum GiteaApiError {
    #[error("Gitea authentication failed: {0}")]
    AuthFailed(String),
    #[error("Gitea insufficient permissions: {0}")]
    InsufficientPermissions(String),
    #[error("Gitea API request failed: {0}")]
    RequestFailed(String),
    #[error("Gitea returned unexpected response: {0}")]
    UnexpectedResponse(String),
    #[error("Could not determine Gitea token — set GITEA_TOKEN env var")]
    NoToken,
    #[error("Could not parse Gitea URL: {0}")]
    InvalidUrl(String),
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct GiteaPullRequest {
    number: i64,
    html_url: String,
    state: String,
    title: String,
    merged: Option<bool>,
    merged_at: Option<DateTime<Utc>>,
    merge_commit_sha: Option<String>,
    base: Option<GiteaBranch>,
    head: Option<GiteaBranch>,
}

#[derive(Debug, Deserialize)]
struct GiteaBranch {
    #[serde(rename = "ref")]
    ref_name: String,
}

#[derive(Debug, Deserialize)]
struct GiteaComment {
    id: i64,
    body: String,
    created_at: DateTime<Utc>,
    html_url: Option<String>,
    user: Option<GiteaUser>,
}

#[derive(Debug, Deserialize)]
struct GiteaReview {
    id: i64,
    #[allow(dead_code)]
    body: String,
    user: Option<GiteaUser>,
}

#[derive(Debug, Deserialize)]
struct GiteaReviewComment {
    id: i64,
    body: String,
    created_at: DateTime<Utc>,
    html_url: Option<String>,
    path: Option<String>,
    line: Option<i64>,
    diff_hunk: Option<String>,
    user: Option<GiteaUser>,
}

#[derive(Debug, Clone, Deserialize)]
struct GiteaUser {
    login: String,
}

#[derive(Serialize)]
struct CreatePrPayload {
    title: String,
    body: String,
    head: String,
    base: String,
}

// ---------------------------------------------------------------------------
// Repo info extracted from a remote URL
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct GiteaRepoInfo {
    pub base_url: String,
    pub owner: String,
    pub repo: String,
}

impl GiteaRepoInfo {
    /// Parse owner/repo from a Gitea-style remote URL.
    ///
    /// Supports both HTTPS (`https://gitea.example.com/owner/repo.git`) and
    /// SSH (`git@gitea.example.com:owner/repo.git`) URLs.
    pub fn from_remote_url(remote_url: &str, base_url: &str) -> Result<Self, GiteaApiError> {
        // Try HTTPS-style URL first
        if let Ok(parsed) = Url::parse(remote_url) {
            let segments: Vec<&str> = parsed
                .path_segments()
                .map(|s| s.collect())
                .unwrap_or_default();
            if segments.len() >= 2 {
                let owner = segments[0].to_string();
                let repo = segments[1].trim_end_matches(".git").to_string();
                return Ok(Self {
                    base_url: base_url.trim_end_matches('/').to_string(),
                    owner,
                    repo,
                });
            }
        }

        // Try SSH-style URL: git@host:owner/repo.git
        if let Some(path) = remote_url.split(':').nth(1) {
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() >= 2 {
                let owner = parts[0].to_string();
                let repo = parts[1].trim_end_matches(".git").to_string();
                return Ok(Self {
                    base_url: base_url.trim_end_matches('/').to_string(),
                    owner,
                    repo,
                });
            }
        }

        Err(GiteaApiError::InvalidUrl(format!(
            "Cannot extract owner/repo from URL: {remote_url}"
        )))
    }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct GiteaClient {
    client: Client,
    token: String,
    pub base_url: String,
}

impl GiteaClient {
    pub fn new(base_url: &str) -> Result<Self, GiteaApiError> {
        let token = Self::resolve_token()?;
        let client = Client::builder()
            .build()
            .map_err(|e| GiteaApiError::RequestFailed(e.to_string()))?;

        Ok(Self {
            client,
            token,
            base_url: base_url.trim_end_matches('/').to_string(),
        })
    }

    /// Resolve the API token from the `GITEA_TOKEN` env var.
    fn resolve_token() -> Result<String, GiteaApiError> {
        if let Ok(token) = std::env::var("GITEA_TOKEN")
            && !token.is_empty()
        {
            return Ok(token);
        }

        Err(GiteaApiError::NoToken)
    }

    fn api_url(&self, path: &str) -> String {
        format!("{}/api/v1{}", self.base_url, path)
    }

    // -----------------------------------------------------------------------
    // API methods
    // -----------------------------------------------------------------------

    pub async fn create_pr(
        &self,
        info: &GiteaRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestDetail, GiteaApiError> {
        let url = self.api_url(&format!("/repos/{}/{}/pulls", info.owner, info.repo));

        let payload = CreatePrPayload {
            title: request.title.clone(),
            body: request.body.clone().unwrap_or_default(),
            head: request.head_branch.clone(),
            base: request.base_branch.clone(),
        };

        let resp = self
            .client
            .post(&url)
            .header(header::AUTHORIZATION, format!("token {}", self.token))
            .json(&payload)
            .send()
            .await
            .map_err(|e| GiteaApiError::RequestFailed(e.to_string()))?;

        let resp = self.check_response(resp).await?;

        let pr: GiteaPullRequest = resp
            .json()
            .await
            .map_err(|e| GiteaApiError::UnexpectedResponse(e.to_string()))?;

        Ok(Self::to_pull_request_detail(pr))
    }

    pub async fn get_pr(
        &self,
        info: &GiteaRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestDetail, GiteaApiError> {
        let url = self.api_url(&format!(
            "/repos/{}/{}/pulls/{}",
            info.owner, info.repo, pr_number
        ));

        let resp = self
            .client
            .get(&url)
            .header(header::AUTHORIZATION, format!("token {}", self.token))
            .send()
            .await
            .map_err(|e| GiteaApiError::RequestFailed(e.to_string()))?;

        let resp = self.check_response(resp).await?;

        let pr: GiteaPullRequest = resp
            .json()
            .await
            .map_err(|e| GiteaApiError::UnexpectedResponse(e.to_string()))?;

        Ok(Self::to_pull_request_detail(pr))
    }

    pub async fn list_prs(
        &self,
        info: &GiteaRepoInfo,
        state: &str,
        head_branch: Option<&str>,
    ) -> Result<Vec<PullRequestDetail>, GiteaApiError> {
        let mut url = self.api_url(&format!("/repos/{}/{}/pulls", info.owner, info.repo));
        url.push_str(&format!("?state={state}&limit=50"));

        let resp = self
            .client
            .get(&url)
            .header(header::AUTHORIZATION, format!("token {}", self.token))
            .send()
            .await
            .map_err(|e| GiteaApiError::RequestFailed(e.to_string()))?;

        let resp = self.check_response(resp).await?;

        let prs: Vec<GiteaPullRequest> = resp
            .json()
            .await
            .map_err(|e| GiteaApiError::UnexpectedResponse(e.to_string()))?;

        let results: Vec<PullRequestDetail> = prs
            .into_iter()
            .filter(|pr| {
                if let Some(branch) = head_branch {
                    pr.head
                        .as_ref()
                        .map(|h| h.ref_name == branch)
                        .unwrap_or(false)
                } else {
                    true
                }
            })
            .map(Self::to_pull_request_detail)
            .collect();

        Ok(results)
    }

    pub async fn get_pr_comments(
        &self,
        info: &GiteaRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GiteaApiError> {
        // Fetch issue-level comments
        let comments_url = self.api_url(&format!(
            "/repos/{}/{}/issues/{}/comments",
            info.owner, info.repo, pr_number
        ));
        let comments_resp = self
            .client
            .get(&comments_url)
            .header(header::AUTHORIZATION, format!("token {}", self.token))
            .send()
            .await
            .map_err(|e| GiteaApiError::RequestFailed(e.to_string()))?;

        let comments_resp = self.check_response(comments_resp).await?;

        let general_comments: Vec<GiteaComment> = comments_resp
            .json()
            .await
            .map_err(|e| GiteaApiError::UnexpectedResponse(e.to_string()))?;

        // Fetch reviews list (does NOT include inline comments)
        let reviews_url = self.api_url(&format!(
            "/repos/{}/{}/pulls/{}/reviews",
            info.owner, info.repo, pr_number
        ));
        let reviews_resp = self
            .client
            .get(&reviews_url)
            .header(header::AUTHORIZATION, format!("token {}", self.token))
            .send()
            .await
            .map_err(|e| GiteaApiError::RequestFailed(e.to_string()))?;

        let reviews_resp = self.check_response(reviews_resp).await?;

        let reviews: Vec<GiteaReview> = reviews_resp
            .json()
            .await
            .map_err(|e| GiteaApiError::UnexpectedResponse(e.to_string()))?;

        // Fetch inline comments for each review via /reviews/{id}/comments
        let mut review_comments: Vec<(GiteaReviewComment, Option<GiteaUser>)> = Vec::new();
        for review in &reviews {
            let comments_url = self.api_url(&format!(
                "/repos/{}/{}/pulls/{}/reviews/{}/comments",
                info.owner, info.repo, pr_number, review.id
            ));
            let resp = self
                .client
                .get(&comments_url)
                .header(header::AUTHORIZATION, format!("token {}", self.token))
                .send()
                .await
                .map_err(|e| GiteaApiError::RequestFailed(e.to_string()))?;

            let resp = self.check_response(resp).await?;

            let comments: Vec<GiteaReviewComment> = resp
                .json()
                .await
                .map_err(|e| GiteaApiError::UnexpectedResponse(e.to_string()))?;

            for c in comments {
                review_comments.push((c, review.user.clone()));
            }
        }

        // Convert to unified comments
        let mut unified: Vec<UnifiedPrComment> = Vec::new();

        for c in general_comments {
            let author = c
                .user
                .map(|u| u.login)
                .unwrap_or_else(|| "unknown".to_string());
            unified.push(UnifiedPrComment::General {
                id: c.id.to_string(),
                author,
                author_association: None,
                body: c.body,
                created_at: c.created_at,
                url: c.html_url,
            });
        }

        for (c, review_user) in review_comments {
            let author = c
                .user
                .or(review_user)
                .map(|u| u.login)
                .unwrap_or_else(|| "unknown".to_string());
            unified.push(UnifiedPrComment::Review {
                id: c.id,
                author,
                author_association: None,
                body: c.body,
                created_at: c.created_at,
                url: c.html_url,
                path: c.path.unwrap_or_default(),
                line: c.line,
                side: None,
                diff_hunk: c.diff_hunk,
            });
        }

        unified.sort_by_key(|c| c.created_at());
        Ok(unified)
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Check the response status and return the response on success.
    /// On error, reads the response body for Gitea's error detail.
    async fn check_response(
        &self,
        resp: reqwest::Response,
    ) -> Result<reqwest::Response, GiteaApiError> {
        if resp.status().is_success() {
            return Ok(resp);
        }

        let status = resp.status();
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "(could not read response body)".to_string());
        let detail = if body.is_empty() {
            status.to_string()
        } else {
            format!("{status}: {body}")
        };

        match status {
            StatusCode::UNAUTHORIZED => Err(GiteaApiError::AuthFailed(detail)),
            StatusCode::FORBIDDEN => Err(GiteaApiError::InsufficientPermissions(detail)),
            _ => Err(GiteaApiError::RequestFailed(detail)),
        }
    }

    fn to_pull_request_detail(pr: GiteaPullRequest) -> PullRequestDetail {
        let status = match pr.state.as_str() {
            "open" => MergeStatus::Open,
            "closed" => {
                if pr.merged.unwrap_or(false) {
                    MergeStatus::Merged
                } else {
                    MergeStatus::Closed
                }
            }
            _ => MergeStatus::Unknown,
        };

        PullRequestDetail {
            number: pr.number,
            url: pr.html_url,
            status,
            merged_at: pr.merged_at,
            merge_commit_sha: pr.merge_commit_sha,
            title: pr.title,
            base_branch: pr.base.map(|b| b.ref_name).unwrap_or_default(),
            head_branch: pr.head.map(|h| h.ref_name).unwrap_or_default(),
        }
    }
}

// ---------------------------------------------------------------------------
// PR URL parsing
// ---------------------------------------------------------------------------

/// Parse a Gitea PR URL into (base_url, owner, repo, pr_number).
///
/// Format: `https://gitea.example.com/owner/repo/pulls/123`
pub fn parse_pr_url(pr_url: &str) -> Option<(String, String, String, i64)> {
    let parsed = Url::parse(pr_url).ok()?;
    let segments: Vec<&str> = parsed.path_segments()?.collect();

    // Expect: ["owner", "repo", "pulls", "123"]
    if segments.len() < 4 || segments[2] != "pulls" {
        return None;
    }

    let owner = segments[0].to_string();
    let repo = segments[1].to_string();
    let number: i64 = segments[3].parse().ok()?;

    let base_url = format!("{}://{}", parsed.scheme(), parsed.host_str()?);
    let base_url = if let Some(port) = parsed.port() {
        format!("{base_url}:{port}")
    } else {
        base_url
    };

    Some((base_url, owner, repo, number))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pr_url_standard() {
        let (base, owner, repo, number) =
            parse_pr_url("https://gitea.example.com/alice/my-repo/pulls/42").unwrap();
        assert_eq!(base, "https://gitea.example.com");
        assert_eq!(owner, "alice");
        assert_eq!(repo, "my-repo");
        assert_eq!(number, 42);
    }

    #[test]
    fn test_parse_pr_url_with_port() {
        let (base, owner, repo, number) =
            parse_pr_url("http://localhost:3000/bob/project/pulls/7").unwrap();
        assert_eq!(base, "http://localhost:3000");
        assert_eq!(owner, "bob");
        assert_eq!(repo, "project");
        assert_eq!(number, 7);
    }

    #[test]
    fn test_parse_pr_url_not_a_pr() {
        assert!(parse_pr_url("https://gitea.example.com/owner/repo").is_none());
        assert!(parse_pr_url("https://github.com/owner/repo/pull/1").is_none());
    }

    #[test]
    fn test_repo_info_from_https_url() {
        let info = GiteaRepoInfo::from_remote_url(
            "https://gitea.example.com/alice/my-repo.git",
            "https://gitea.example.com",
        )
        .unwrap();
        assert_eq!(info.owner, "alice");
        assert_eq!(info.repo, "my-repo");
        assert_eq!(info.base_url, "https://gitea.example.com");
    }

    #[test]
    fn test_repo_info_from_ssh_url() {
        let info = GiteaRepoInfo::from_remote_url(
            "git@gitea.example.com:alice/my-repo.git",
            "https://gitea.example.com",
        )
        .unwrap();
        assert_eq!(info.owner, "alice");
        assert_eq!(info.repo, "my-repo");
    }

    #[test]
    fn test_to_pull_request_detail_open() {
        let pr = GiteaPullRequest {
            number: 1,
            html_url: "https://gitea.example.com/o/r/pulls/1".to_string(),
            state: "open".to_string(),
            title: "Test".to_string(),
            merged: Some(false),
            merged_at: None,
            merge_commit_sha: None,
            base: Some(GiteaBranch {
                ref_name: "main".to_string(),
            }),
            head: Some(GiteaBranch {
                ref_name: "feature".to_string(),
            }),
        };
        let detail = GiteaClient::to_pull_request_detail(pr);
        assert!(matches!(detail.status, MergeStatus::Open));
        assert_eq!(detail.base_branch, "main");
        assert_eq!(detail.head_branch, "feature");
    }

    #[test]
    fn test_to_pull_request_detail_merged() {
        let pr = GiteaPullRequest {
            number: 2,
            html_url: "https://gitea.example.com/o/r/pulls/2".to_string(),
            state: "closed".to_string(),
            title: "Merged PR".to_string(),
            merged: Some(true),
            merged_at: Some(Utc::now()),
            merge_commit_sha: Some("abc123".to_string()),
            base: None,
            head: None,
        };
        let detail = GiteaClient::to_pull_request_detail(pr);
        assert!(matches!(detail.status, MergeStatus::Merged));
    }

    #[test]
    fn test_to_pull_request_detail_closed_not_merged() {
        let pr = GiteaPullRequest {
            number: 3,
            html_url: "https://gitea.example.com/o/r/pulls/3".to_string(),
            state: "closed".to_string(),
            title: "Closed PR".to_string(),
            merged: Some(false),
            merged_at: None,
            merge_commit_sha: None,
            base: None,
            head: None,
        };
        let detail = GiteaClient::to_pull_request_detail(pr);
        assert!(matches!(detail.status, MergeStatus::Closed));
    }
}
