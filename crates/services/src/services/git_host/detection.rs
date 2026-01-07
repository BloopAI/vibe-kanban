//! Git hosting provider detection from repository URLs.

use std::path::Path;

use super::types::{GitHostError, GitHostProvider};
use crate::services::git::GitCli;

/// Detect the git hosting provider from a repository path by examining its remote URL.
pub fn detect_provider(repo_path: &Path) -> Result<GitHostProvider, GitHostError> {
    let git = GitCli::new();
    let url = git
        .get_remote_url(repo_path, "origin")
        .map_err(|e| GitHostError::Repository(format!("Failed to get origin remote URL: {e}")))?;

    Ok(detect_provider_from_url(&url))
}

/// Detect the git hosting provider from a remote URL.
///
/// Supports:
/// - GitHub.com: `https://github.com/owner/repo` or `git@github.com:owner/repo.git`
/// - GitHub Enterprise: URLs containing `github.` (e.g., `https://github.company.com/owner/repo`)
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo` or legacy `https://org.visualstudio.com/...`
pub fn detect_provider_from_url(url: &str) -> GitHostProvider {
    let url_lower = url.to_lowercase();

    // GitHub.com (most common case)
    if url_lower.contains("github.com") {
        return GitHostProvider::GitHub;
    }

    // Azure DevOps patterns (check before GHE to avoid false positives)
    // - dev.azure.com
    // - *.visualstudio.com
    // - Contains /_git/ (Azure-specific path pattern)
    if url_lower.contains("dev.azure.com")
        || url_lower.contains(".visualstudio.com")
        || url_lower.contains("ssh.dev.azure.com")
    {
        return GitHostProvider::AzureDevOps;
    }

    // Azure DevOps uses /_git/ in paths, which is unique to Azure
    if url_lower.contains("/_git/") {
        return GitHostProvider::AzureDevOps;
    }

    // GitHub Enterprise patterns
    // GHE URLs typically look like: https://github.company.com/owner/repo
    // or SSH: git@github.company.com:owner/repo.git
    // Key indicators: contains "github." but not the Azure patterns above
    if url_lower.contains("github.") {
        return GitHostProvider::GitHub;
    }

    GitHostProvider::Unknown
}

/// Detect the git hosting provider from a PR URL.
///
/// Supports:
/// - GitHub: `https://github.com/owner/repo/pull/123`
/// - GitHub Enterprise: `https://github.company.com/owner/repo/pull/123`
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo/pullrequest/123`
#[cfg(test)]
fn detect_provider_from_pr_url(pr_url: &str) -> GitHostProvider {
    let url_lower = pr_url.to_lowercase();

    // GitHub pattern: contains /pull/ in the path
    if url_lower.contains("/pull/") {
        // Could be github.com or GHE
        if url_lower.contains("github.com") || url_lower.contains("github.") {
            return GitHostProvider::GitHub;
        }
    }

    // Azure DevOps pattern: contains /pullrequest/ in the path
    if url_lower.contains("/pullrequest/") {
        return GitHostProvider::AzureDevOps;
    }

    // Fall back to general URL detection
    detect_provider_from_url(pr_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_github_com_https() {
        assert_eq!(
            detect_provider_from_url("https://github.com/owner/repo"),
            GitHostProvider::GitHub
        );
        assert_eq!(
            detect_provider_from_url("https://github.com/owner/repo.git"),
            GitHostProvider::GitHub
        );
    }

    #[test]
    fn test_github_com_ssh() {
        assert_eq!(
            detect_provider_from_url("git@github.com:owner/repo.git"),
            GitHostProvider::GitHub
        );
    }

    #[test]
    fn test_github_enterprise() {
        assert_eq!(
            detect_provider_from_url("https://github.company.com/owner/repo"),
            GitHostProvider::GitHub
        );
        assert_eq!(
            detect_provider_from_url("https://github.acme.corp/team/project"),
            GitHostProvider::GitHub
        );
        assert_eq!(
            detect_provider_from_url("git@github.internal.io:org/repo.git"),
            GitHostProvider::GitHub
        );
    }

    #[test]
    fn test_azure_devops_https() {
        assert_eq!(
            detect_provider_from_url("https://dev.azure.com/org/project/_git/repo"),
            GitHostProvider::AzureDevOps
        );
    }

    #[test]
    fn test_azure_devops_ssh() {
        assert_eq!(
            detect_provider_from_url("git@ssh.dev.azure.com:v3/org/project/repo"),
            GitHostProvider::AzureDevOps
        );
    }

    #[test]
    fn test_azure_devops_legacy_visualstudio() {
        assert_eq!(
            detect_provider_from_url("https://org.visualstudio.com/project/_git/repo"),
            GitHostProvider::AzureDevOps
        );
    }

    #[test]
    fn test_azure_devops_git_path() {
        // Any URL with /_git/ is Azure DevOps
        assert_eq!(
            detect_provider_from_url("https://custom.domain.com/org/project/_git/repo"),
            GitHostProvider::AzureDevOps
        );
    }

    #[test]
    fn test_unknown_provider() {
        assert_eq!(
            detect_provider_from_url("https://gitlab.com/owner/repo"),
            GitHostProvider::Unknown
        );
        assert_eq!(
            detect_provider_from_url("https://bitbucket.org/owner/repo"),
            GitHostProvider::Unknown
        );
    }

    #[test]
    fn test_pr_url_github() {
        assert_eq!(
            detect_provider_from_pr_url("https://github.com/owner/repo/pull/123"),
            GitHostProvider::GitHub
        );
        assert_eq!(
            detect_provider_from_pr_url("https://github.company.com/owner/repo/pull/456"),
            GitHostProvider::GitHub
        );
    }

    #[test]
    fn test_pr_url_azure() {
        assert_eq!(
            detect_provider_from_pr_url(
                "https://dev.azure.com/org/project/_git/repo/pullrequest/123"
            ),
            GitHostProvider::AzureDevOps
        );
        assert_eq!(
            detect_provider_from_pr_url(
                "https://org.visualstudio.com/project/_git/repo/pullrequest/456"
            ),
            GitHostProvider::AzureDevOps
        );
    }
}
