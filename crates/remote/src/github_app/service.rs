use reqwest::Client;
use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use tempfile::TempDir;
use thiserror::Error;
use tokio::process::Command;
use tracing::{debug, info, warn};

use super::jwt::{GitHubAppJwt, JwtError};
use crate::config::GitHubAppConfig;

const USER_AGENT: &str = "VibeKanbanRemote/1.0";
const GITHUB_API_BASE: &str = "https://api.github.com";

#[derive(Debug, Error)]
pub enum GitHubAppError {
    #[error("JWT error: {0}")]
    Jwt(#[from] JwtError),
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("GitHub API error: {status} - {message}")]
    Api { status: u16, message: String },
    #[error("Installation not found")]
    InstallationNotFound,
    #[error("Git operation failed: {0}")]
    GitOperation(String),
}

/// Information about a GitHub App installation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallationInfo {
    pub id: i64,
    pub account: InstallationAccount,
    pub repository_selection: String, // "all" or "selected"
    pub suspended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallationAccount {
    pub login: String,
    #[serde(rename = "type")]
    pub account_type: String, // "Organization" or "User"
    pub id: i64,
}

/// A repository accessible via an installation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: i64,
    pub full_name: String,
    pub name: String,
    pub private: bool,
}

#[derive(Debug, Deserialize)]
struct InstallationTokenResponse {
    token: String,
    expires_at: String,
}

#[derive(Debug, Deserialize)]
struct RepositoriesResponse {
    repositories: Vec<Repository>,
}

/// Details about a pull request
#[derive(Debug, Clone, Deserialize)]
pub struct PrDetails {
    pub title: String,
    pub body: Option<String>,
    pub head: PrRef,
    pub base: PrRef,
}

/// A git ref (branch/commit) in a PR
#[derive(Debug, Clone, Deserialize)]
pub struct PrRef {
    pub sha: String,
}

/// Service for interacting with the GitHub App API
#[derive(Clone)]
pub struct GitHubAppService {
    jwt_generator: GitHubAppJwt,
    client: Client,
    app_slug: String,
    webhook_secret: SecretString,
}

impl GitHubAppService {
    pub fn new(config: &GitHubAppConfig, client: Client) -> Result<Self, GitHubAppError> {
        let jwt_generator = GitHubAppJwt::new(config.app_id, config.private_key.clone())?;

        Ok(Self {
            jwt_generator,
            client,
            app_slug: config.app_slug.clone(),
            webhook_secret: config.webhook_secret.clone(),
        })
    }

    /// Get the app slug for constructing installation URLs
    pub fn app_slug(&self) -> &str {
        &self.app_slug
    }

    /// Get the webhook secret for signature verification
    pub fn webhook_secret(&self) -> &SecretString {
        &self.webhook_secret
    }

    /// Get an installation access token for making API calls on behalf of an installation
    pub async fn get_installation_token(
        &self,
        installation_id: i64,
    ) -> Result<String, GitHubAppError> {
        let jwt = self.jwt_generator.generate()?;

        let url = format!(
            "{}/app/installations/{}/access_tokens",
            GITHUB_API_BASE, installation_id
        );

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", jwt))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", USER_AGENT)
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response.text().await.unwrap_or_default();
            warn!(
                installation_id,
                status, message, "Failed to get installation token"
            );
            return Err(GitHubAppError::Api { status, message });
        }

        let token_response: InstallationTokenResponse = response.json().await?;
        info!(
            installation_id,
            expires_at = %token_response.expires_at,
            "Got installation access token"
        );

        Ok(token_response.token)
    }

    /// Get details about a specific installation
    pub async fn get_installation(
        &self,
        installation_id: i64,
    ) -> Result<InstallationInfo, GitHubAppError> {
        let jwt = self.jwt_generator.generate()?;

        let url = format!("{}/app/installations/{}", GITHUB_API_BASE, installation_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", jwt))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", USER_AGENT)
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(GitHubAppError::InstallationNotFound);
        }

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response.text().await.unwrap_or_default();
            return Err(GitHubAppError::Api { status, message });
        }

        let installation: InstallationInfo = response.json().await?;
        Ok(installation)
    }

    /// List repositories accessible to an installation
    pub async fn list_installation_repos(
        &self,
        installation_id: i64,
    ) -> Result<Vec<Repository>, GitHubAppError> {
        let token = self.get_installation_token(installation_id).await?;

        let url = format!("{}/installation/repositories", GITHUB_API_BASE);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", USER_AGENT)
            .header("X-GitHub-Api-Version", "2022-11-28")
            .query(&[("per_page", "100")])
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response.text().await.unwrap_or_default();
            return Err(GitHubAppError::Api { status, message });
        }

        let repos_response: RepositoriesResponse = response.json().await?;
        Ok(repos_response.repositories)
    }

    /// Post a comment on a pull request
    pub async fn post_pr_comment(
        &self,
        installation_id: i64,
        owner: &str,
        repo: &str,
        pr_number: u64,
        body: &str,
    ) -> Result<(), GitHubAppError> {
        let token = self.get_installation_token(installation_id).await?;

        // Use the issues API to post comments (PRs are issues in GitHub)
        let url = format!(
            "{}/repos/{}/{}/issues/{}/comments",
            GITHUB_API_BASE, owner, repo, pr_number
        );

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", USER_AGENT)
            .header("X-GitHub-Api-Version", "2022-11-28")
            .json(&serde_json::json!({ "body": body }))
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response.text().await.unwrap_or_default();
            warn!(
                owner,
                repo, pr_number, status, message, "Failed to post PR comment"
            );
            return Err(GitHubAppError::Api { status, message });
        }

        info!(owner, repo, pr_number, "Posted PR comment");
        Ok(())
    }

    /// Clone a repository using the installation token for authentication.
    ///
    /// Returns a TempDir containing the cloned repository at the specified commit.
    /// The TempDir will be automatically cleaned up when dropped.
    pub async fn clone_repo(
        &self,
        installation_id: i64,
        owner: &str,
        repo: &str,
        head_sha: &str,
    ) -> Result<TempDir, GitHubAppError> {
        let token = self.get_installation_token(installation_id).await?;

        // Create temp directory
        let temp_dir = tempfile::tempdir()
            .map_err(|e| GitHubAppError::GitOperation(format!("Failed to create temp dir: {e}")))?;

        let clone_url = format!(
            "https://x-access-token:{}@github.com/{}/{}.git",
            token, owner, repo
        );

        debug!(owner, repo, head_sha, "Cloning repository");

        // Clone the repository
        let output = Command::new("git")
            .args(["clone", "--depth", "1", &clone_url, "."])
            .current_dir(temp_dir.path())
            .output()
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    GitHubAppError::GitOperation("git is not installed or not in PATH".to_string())
                } else {
                    GitHubAppError::GitOperation(format!("Failed to run git clone: {e}"))
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Redact the token from error messages
            let redacted_stderr = stderr.replace(&token, "[REDACTED]");
            return Err(GitHubAppError::GitOperation(format!(
                "git clone failed: {redacted_stderr}"
            )));
        }

        // Fetch the specific commit (in case it's not in shallow clone)
        let output = Command::new("git")
            .args(["fetch", "--depth", "1", "origin", head_sha])
            .current_dir(temp_dir.path())
            .output()
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    GitHubAppError::GitOperation("git is not installed or not in PATH".to_string())
                } else {
                    GitHubAppError::GitOperation(format!("Failed to run git fetch: {e}"))
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let redacted_stderr = stderr.replace(&token, "[REDACTED]");
            return Err(GitHubAppError::GitOperation(format!(
                "git fetch failed: {redacted_stderr}"
            )));
        }

        // Checkout the specific commit
        let output = Command::new("git")
            .args(["checkout", head_sha])
            .current_dir(temp_dir.path())
            .output()
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    GitHubAppError::GitOperation("git is not installed or not in PATH".to_string())
                } else {
                    GitHubAppError::GitOperation(format!("Failed to run git checkout: {e}"))
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitHubAppError::GitOperation(format!(
                "git checkout failed: {stderr}"
            )));
        }

        info!(owner, repo, head_sha, "Repository cloned successfully");
        Ok(temp_dir)
    }

    /// Get details about a pull request
    pub async fn get_pr_details(
        &self,
        installation_id: i64,
        owner: &str,
        repo: &str,
        pr_number: u64,
    ) -> Result<PrDetails, GitHubAppError> {
        let token = self.get_installation_token(installation_id).await?;

        let url = format!(
            "{}/repos/{}/{}/pulls/{}",
            GITHUB_API_BASE, owner, repo, pr_number
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", USER_AGENT)
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response.text().await.unwrap_or_default();
            return Err(GitHubAppError::Api { status, message });
        }

        let pr: PrDetails = response.json().await?;
        Ok(pr)
    }
}
