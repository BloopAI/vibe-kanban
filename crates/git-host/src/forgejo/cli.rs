//! Forgejo/Gitea REST API client.
//!
//! This module provides low-level access to the Forgejo/Gitea REST API.
//! Forgejo is API-compatible with Gitea, so this client works for both.

use std::env;

use chrono::{DateTime, Utc};
use db::models::merge::MergeStatus;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use url::Url;

use crate::types::{CreatePrRequest, PrComment, PrCommentAuthor, PrReviewComment, PullRequestDetail, ReviewCommentUser};

#[derive(Debug, Clone)]
pub struct ForgejoRepoInfo {
    pub owner: String,
    pub repo_name: String,
    /// Base URL of the Forgejo instance (e.g., "https://codeberg.org" or custom instance)
    pub base_url: String,
}

impl ForgejoRepoInfo {
    /// Returns the API base URL for this repo.
    pub fn api_url(&self) -> String {
        format!(
            "{}/api/v1/repos/{}/{}",
            self.base_url.trim_end_matches('/'),
            self.owner,
            self.repo_name
        )
    }
}

#[derive(Debug, Error)]
pub enum ForgejoApiError {
    #[error("FORGEJO_TOKEN environment variable not set")]
    NotConfigured(String),
    #[error("HTTP error {0}: {1}")]
    HttpError(u16, String),
    #[error("Authentication failed: {0}")]
    AuthFailed(String),
    #[error("Unexpected output: {0}")]
    UnexpectedOutput(String),
    #[error("Reqwest error: {0}")]
    ReqwestError(#[from] reqwest::Error),
}

#[derive(Debug, Clone)]
pub struct ForgejoApi {
    client: Client,
    token: String,
}

impl ForgejoApi {
    pub fn new() -> Result<Self, ForgejoApiError> {
        let token = env::var("FORGEJO_TOKEN")
            .map_err(|_| ForgejoApiError::NotConfigured("FORGEJO_TOKEN not set".to_string()))?;

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(ForgejoApiError::ReqwestError)?;

        Ok(Self { client, token })
    }

    /// Parse a remote URL (HTTPS or SSH) into owner, repo, and base URL.
    pub fn parse_remote_url(&self, url: &str) -> Result<ForgejoRepoInfo, ForgejoApiError> {
        let url = url.trim().trim_end_matches(".git");

        if url.starts_with("git@") {
            // SSH format: git@codeberg.org:owner/repo.git
            let without_prefix = url.strip_prefix("git@").ok_or_else(|| {
                ForgejoApiError::UnexpectedOutput(format!("Invalid SSH URL: {url}"))
            })?;
            let (host, path) = without_prefix.split_once(':').ok_or_else(|| {
                ForgejoApiError::UnexpectedOutput(format!("Invalid SSH URL format: {url}"))
            })?;
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() < 2 {
                return Err(ForgejoApiError::UnexpectedOutput(format!(
                    "Invalid repo path in SSH URL: {path}"
                )));
            }
            let owner = parts[0].to_string();
            let repo_name = parts[1].to_string();
            let base_url = format!("https://{}", host);
            return Ok(ForgejoRepoInfo {
                owner,
                repo_name,
                base_url,
            });
        }

        // HTTPS format: https://codeberg.org/owner/repo
        let parsed = Url::parse(url).map_err(|e| {
            ForgejoApiError::UnexpectedOutput(format!("Invalid HTTPS URL: {e}"))
        })?;

        let host = parsed.host_str().ok_or_else(|| {
            ForgejoApiError::UnexpectedOutput(format!("No host in URL: {url}"))
        })?;

        let path_parts: Vec<&str> = parsed
            .path_segments()
            .ok_or_else(|| {
                ForgejoApiError::UnexpectedOutput(format!("No path in URL: {url}"))
            })?
            .collect();

        if path_parts.len() < 2 {
            return Err(ForgejoApiError::UnexpectedOutput(format!(
                "Invalid repo path in URL: {}",
                parsed.path()
            )));
        }

        let owner = path_parts[0].to_string();
        let repo_name = path_parts[1].to_string();
        let base_url = format!("{}://{}", parsed.scheme(), host);

        Ok(ForgejoRepoInfo {
            owner,
            repo_name,
            base_url,
        })
    }

    /// Make an authenticated API request.
    fn api_request(&self, method: reqwest::Method, url: &str) -> reqwest::RequestBuilder {
        let client = self.client.clone();
        let token = &self.token;

        client
            .request(method, url)
            .header("Authorization", format!("token {token}"))
            .header("Accept", "application/json")
    }

    /// Create a pull request.
    pub fn create_pr(
&self,
        request: &CreatePrRequest,
        repo_info: &ForgejoRepoInfo,
    ) -> Result<PullRequestDetail, ForgejoApiError> {
        let url = format!("{}/pulls", repo_info.api_url());

        #[derive(Serialize)]
        struct CreatePrPayload<'a> {
            title: &'a str,
            body: &'a str,
            head: &'a str,
            base: &'a str,
        }

        let body = request.body.as_deref().unwrap_or("");
        let payload = CreatePrPayload {
            title: &request.title,
            body,
            head: &request.head_branch,
            base: &request.base_branch,
        };

        let response = self
            .api_request(reqwest::Method::POST, &url)
            .json(&payload)
            .send()?;

        self.handle_response(response)?
            .json::<ForgejoPullResponse>()
            .map_err(ForgejoApiError::ReqwestError)
            .map(|pr| self.pr_response_to_detail(pr, repo_info))
    }

    /// Get a pull request by number.
    pub fn view_pr(
        &self,
        repo_info: &ForgejoRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestDetail, ForgejoApiError> {
        let url = format!("{}/pulls/{}", repo_info.api_url(), pr_number);

        let response = self.api_request(reqwest::Method::GET, &url).send()?;

        self.handle_response(response)?
            .json::<ForgejoPullResponse>()
            .map_err(ForgejoApiError::ReqwestError)
            .map(|pr| self.pr_response_to_detail(pr, repo_info))
    }

    /// Parse a PR URL to extract repo info and PR number.
    pub fn parse_pr_url(&self, pr_url: &str) -> Result<(ForgejoRepoInfo, i64), ForgejoApiError> {
        // Forgejo PR URL format: https://forgejo.example.com/owner/repo/pulls/123
        let parsed = Url::parse(pr_url).map_err(|e| {
            ForgejoApiError::UnexpectedOutput(format!("Invalid PR URL: {e}"))
        })?;

        let path_parts: Vec<&str> = parsed
            .path_segments()
            .ok_or_else(|| {
                ForgejoApiError::UnexpectedOutput(format!("No path in PR URL: {pr_url}"))
            })?
            .collect();

        // Find "pulls" in path and extract owner/repo/pr_number
        let pulls_idx = path_parts.iter().position(|&p| p == "pulls");

        if let Some(idx) = pulls_idx {
            if idx >= 2 && path_parts.len() > idx + 1 {
                let owner = path_parts[idx - 2].to_string();
                let repo_name = path_parts[idx - 1].to_string();
                let pr_number = path_parts[idx + 1].parse::<i64>().map_err(|_| {
                    ForgejoApiError::UnexpectedOutput(format!(
                        "Invalid PR number in URL: {}",
                        path_parts[idx + 1]
                    ))
                })?;

                let host = parsed.host_str().ok_or_else(|| {
                    ForgejoApiError::UnexpectedOutput(format!("No host in PR URL: {pr_url}"))
                })?;
                let base_url = format!("{}://{}", parsed.scheme(), host);

                let repo_info = ForgejoRepoInfo {
                    owner,
                    repo_name,
                    base_url,
                };

                return Ok((repo_info, pr_number));
            }
        }

        Err(ForgejoApiError::UnexpectedOutput(format!(
            "Could not parse Forgejo PR URL: {pr_url}"
        )))
    }

    /// List pull requests for a branch.
    pub fn list_prs_for_branch(
       &self,
        repo_info: &ForgejoRepoInfo,
        branch: &str,
    ) -> Result<Vec<PullRequestDetail>, ForgejoApiError> {
        let url = format!(
            "{}/pulls?state=all&head={}",
            repo_info.api_url(),
            branch
        );

        let response = self.api_request(reqwest::Method::GET, &url).send()?;

        self.handle_response(response)?
            .json::<Vec<ForgejoPullResponse>>()
            .map_err(ForgejoApiError::ReqwestError)
            .map(|prs| {
                prs.into_iter()
                    .map(|pr| self.pr_response_to_detail(pr, repo_info))
                    .collect()
            })
    }

    /// List open pull requests.
    pub fn list_open_prs(
        &self,
        repo_info: &ForgejoRepoInfo,
    ) -> Result<Vec<PullRequestDetail>, ForgejoApiError> {
        let url = format!("{}/pulls?state=open&limit=50", repo_info.api_url());

        let response = self.api_request(reqwest::Method::GET, &url).send()?;

        self.handle_response(response)?
            .json::<Vec<ForgejoPullResponse>>()
            .map_err(ForgejoApiError::ReqwestError)
            .map(|prs| {
                prs.into_iter()
                    .map(|pr| self.pr_response_to_detail(pr, repo_info))
                    .collect()
            })
    }

    /// Get general comments for a pull request.
    pub fn get_pr_comments(
        &self,
        repo_info: &ForgejoRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<PrComment>, ForgejoApiError> {
        // Forgejo uses /issues/{index}/comments for PR general comments
        let url = format!("{}/issues/{}/comments", repo_info.api_url(), pr_number);

        let response = self.api_request(reqwest::Method::GET, &url).send()?;

        self.handle_response(response)?
            .json::<Vec<ForgejoIssueComment>>()
            .map_err(ForgejoApiError::ReqwestError)
            .map(|comments| {
                comments
                    .into_iter()
                    .map(|c| PrComment {
                        id: c.id.to_string(),
                        author: PrCommentAuthor {
                            login: c.user.login,
                        },
                        author_association: String::new(),
                        body: c.body,
                        created_at: c.created_at,
                        url: c.html_url,
                    })
                    .collect()
            })
    }

    /// Get inline review comments for a pull request.
    pub fn get_pr_review_comments(
       &self,
        repo_info: &ForgejoRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<PrReviewComment>, ForgejoApiError> {
        let url = format!("{}/pulls/{}/comments", repo_info.api_url(), pr_number);

        let response = self.api_request(reqwest::Method::GET, &url).send()?;

        self.handle_response(response)?
            .json::<Vec<ForgejoReviewComment>>()
            .map_err(ForgejoApiError::ReqwestError)
            .map(|comments| {
                comments
                    .into_iter()
                    .map(|c| PrReviewComment {
                        id: c.id,
                        user: ReviewCommentUser {
                            login: c.user.login,
                        },
                        body: c.body,
                        created_at: c.created_at,
                        html_url: c.html_url,
                        path: c.path,
                        line: c.line,
                        side: c.side,
                        diff_hunk: c.diff_hunk,
                        author_association: String::new(),
                    })
                    .collect()
            })
    }

    fn handle_response(
&self,
        response: reqwest::Response,
    ) -> Result<reqwest::Response, ForgejoApiError> {
        let status = response.status();

        if status.as_u16() == 401 {
            let text = response.text().await.unwrap_or_default();
            return Err(ForgejoApiError::AuthFailed(text));
        }

        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(ForgejoApiError::HttpError(status.as_u16(), text));
        }

        Ok(response)
    }

    fn pr_response_to_detail(
        &self,
        pr: ForgejoPullResponse,
        repo_info: &ForgejoRepoInfo,
    ) -> PullRequestDetail {
        let url = format!(
            "{}/{}/{}/pulls/{}",
            repo_info.base_url.trim_end_matches('/'),
            repo_info.owner,
            repo_info.repo_name,
            pr.index
        );

        let status = if pr.merged {
            MergeStatus::Merged
        } else if pr.state == "closed" {
            MergeStatus::Closed
        } else {
            MergeStatus::Open
        };

        PullRequestDetail {
            number: pr.index,
            url,
            status,
            merged_at: pr.merged_at,
            merge_commit_sha: pr.merge_commit.and_then(|c| c.oid),
            title: pr.title,
            base_branch: pr.base_branch,
            head_branch: pr.head_branch,
        }
    }
}

// ============================================================================
// Forgejo API response types
// ============================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgejoPullResponse {
    /// Forgejo uses "index" not "number" for PR identifier
    index: i64,
    #[serde(default)]
    url: String,
    #[serde(default)]
    state: String,
    merged: bool,
    merged_at: Option<DateTime<Utc>>,
    #[serde(default)]
    merge_commit: Option<ForgejoCommit>,
    #[serde(default)]
    title: String,
    #[serde(default)]
    base_branch: String,
    #[serde(default)]
    head_branch: String,
}

#[derive(Deserialize)]
struct ForgejoCommit {
    oid: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgejoIssueComment {
    id: i64,
    user: ForgejoUser,
    #[serde(default)]
    body: String,
    created_at: DateTime<Utc>,
    #[serde(default)]
    html_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgejoReviewComment {
    id: i64,
    user: ForgejoUser,
    #[serde(default)]
    body: String,
    created_at: DateTime<Utc>,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    path: String,
    line: Option<i64>,
    side: Option<String>,
    #[serde(default)]
    diff_hunk: String,
}

#[derive(Deserialize)]
struct ForgejoUser {
    login: String,
}
