//! Shared HTTP client infrastructure for API-based git hosting providers.

use std::time::Duration;

use reqwest::{Client, RequestBuilder, Response, StatusCode};

use crate::services::git_host::GitHostError;

/// HTTP client wrapper with retry logic for git hosting APIs.
#[derive(Debug, Clone)]
pub struct GitHostHttpClient {
    client: Client,
    base_url: String,
    token: String,
}

impl GitHostHttpClient {
    /// Create a new HTTP client for a git hosting API.
    pub fn new(base_url: String, token: String) -> Result<Self, GitHostError> {
        Ok(Self {
            client: Client::builder()
                .user_agent("vibe-kanban")
                .timeout(Duration::from_secs(30))
                .build()
                .map_err(|e| {
                    GitHostError::HttpError(format!("Failed to create HTTP client: {e}"))
                })?,
            base_url,
            token,
        })
    }

    /// Build a GET request with authentication.
    pub fn get(&self, path: &str) -> RequestBuilder {
        self.client
            .get(format!("{}{}", self.base_url, path))
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/json")
    }

    /// Build a POST request with authentication.
    pub fn post(&self, path: &str) -> RequestBuilder {
        self.client
            .post(format!("{}{}", self.base_url, path))
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
    }
}

/// Parse an HTTP response and map errors to GitHostError.
pub async fn handle_response(response: Response) -> Result<Response, GitHostError> {
    let status = response.status();

    if status.is_success() {
        return Ok(response);
    }

    let error_text = response
        .text()
        .await
        .unwrap_or_else(|_| "Unknown error".to_string());

    match status {
        StatusCode::UNAUTHORIZED => Err(GitHostError::AuthFailed(error_text)),
        StatusCode::FORBIDDEN => Err(GitHostError::InsufficientPermissions(error_text)),
        StatusCode::NOT_FOUND => Err(GitHostError::RepoNotFoundOrNoAccess(error_text)),
        StatusCode::UNPROCESSABLE_ENTITY => Err(GitHostError::PullRequest(error_text)),
        _ => Err(GitHostError::HttpError(format!(
            "HTTP {} - {}",
            status, error_text
        ))),
    }
}

/// Extract the host from a git remote URL.
pub fn extract_host(url: &str) -> Result<String, GitHostError> {
    // Try to parse as URL first
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            return Ok(host.to_string());
        }
    }

    // Try SSH format: git@host:owner/repo.git
    if url.starts_with("git@") {
        if let Some(colon_pos) = url.find(':') {
            return Ok(url[4..colon_pos].to_string());
        }
    }

    Err(GitHostError::InvalidUrl(format!(
        "Cannot extract host from URL: {}",
        url
    )))
}

/// Extract owner and repo from a git remote URL.
/// Supports both HTTPS and SSH formats.
pub fn parse_owner_repo(url: &str) -> Result<(String, String), GitHostError> {
    let extract_from_path = |path: &str| -> Option<(String, String)> {
        let mut parts = path
            .trim_start_matches('/')
            .trim_end_matches(".git")
            .split('/');
        let owner = parts.next()?;
        let repo = parts.next()?;
        if owner.is_empty() || repo.is_empty() {
            return None;
        }
        Some((owner.to_string(), repo.to_string()))
    };

    // Try to parse as URL first
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(result) = extract_from_path(parsed.path()) {
            return Ok(result);
        }
    }

    // Try SSH format: git@host:owner/repo.git
    if let Some(path_start) = url.find(':') {
        if let Some(result) = extract_from_path(&url[path_start + 1..]) {
            return Ok(result);
        }
    }

    Err(GitHostError::InvalidUrl(format!(
        "Cannot extract owner/repo from URL: {}",
        url
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_owner_repo_https() {
        let (owner, repo) = parse_owner_repo("https://codeberg.org/owner/repo").unwrap();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }

    #[test]
    fn test_parse_owner_repo_https_with_git_suffix() {
        let (owner, repo) = parse_owner_repo("https://codeberg.org/owner/repo.git").unwrap();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }

    #[test]
    fn test_parse_owner_repo_ssh() {
        let (owner, repo) = parse_owner_repo("git@codeberg.org:owner/repo.git").unwrap();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }

    #[test]
    fn test_extract_host_https() {
        let host = extract_host("https://codeberg.org/owner/repo").unwrap();
        assert_eq!(host, "codeberg.org");
    }

    #[test]
    fn test_extract_host_ssh() {
        let host = extract_host("git@codeberg.org:owner/repo.git").unwrap();
        assert_eq!(host, "codeberg.org");
    }

    #[test]
    fn test_extract_host_self_hosted() {
        let host = extract_host("https://git.mycompany.com/team/project").unwrap();
        assert_eq!(host, "git.mycompany.com");
    }
}
