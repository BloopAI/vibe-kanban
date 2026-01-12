//! Git hosting provider detection from repository URLs.

use super::types::ProviderKind;

/// Parsed GitHub repository information from a remote URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubRepoFromUrl {
    pub owner: String,
    pub repo: String,
}

/// Parse owner and repo name from a GitHub remote URL.
///
/// Supports:
/// - HTTPS: `https://github.com/owner/repo` or `https://github.com/owner/repo.git`
/// - SSH: `git@github.com:owner/repo.git`
/// - GitHub Enterprise: `https://github.company.com/owner/repo`
///
/// Returns `None` if the URL is not a valid GitHub URL or cannot be parsed.
pub fn parse_github_owner_repo(url: &str) -> Option<GitHubRepoFromUrl> {
    // First check it's a GitHub URL
    let url_lower = url.to_lowercase();
    if !url_lower.contains("github.com") && !url_lower.contains("github.") {
        return None;
    }

    // Handle SSH URLs: git@github.com:owner/repo.git
    if url.contains("git@") && url.contains(':') {
        let parts: Vec<&str> = url.split(':').collect();
        if parts.len() == 2 {
            let path = parts[1].trim_end_matches(".git");
            let path_parts: Vec<&str> = path.split('/').collect();
            if path_parts.len() >= 2 {
                return Some(GitHubRepoFromUrl {
                    owner: path_parts[0].to_string(),
                    repo: path_parts[1].to_string(),
                });
            }
        }
        return None;
    }

    // Handle HTTPS URLs: https://github.com/owner/repo.git
    // Extract path after the domain
    let path = if let Some(idx) = url.find("github.com/") {
        &url[idx + "github.com/".len()..]
    } else if let Some(idx) = url.find("github.") {
        // GitHub Enterprise: find the first / after github.
        let after_github = &url[idx..];
        if let Some(slash_idx) = after_github.find('/') {
            // Skip the TLD part (e.g., .company.com)
            let after_domain = &after_github[slash_idx + 1..];
            after_domain
        } else {
            return None;
        }
    } else {
        return None;
    };

    let path = path.trim_end_matches(".git");
    let path_parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    if path_parts.len() >= 2 {
        Some(GitHubRepoFromUrl {
            owner: path_parts[0].to_string(),
            repo: path_parts[1].to_string(),
        })
    } else {
        None
    }
}

/// Detect the git hosting provider from a remote URL.
///
/// Supports:
/// - GitHub.com: `https://github.com/owner/repo` or `git@github.com:owner/repo.git`
/// - GitHub Enterprise: URLs containing `github.` (e.g., `https://github.company.com/owner/repo`)
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo` or legacy `https://org.visualstudio.com/...`
pub fn detect_provider_from_url(url: &str) -> ProviderKind {
    let url_lower = url.to_lowercase();

    if url_lower.contains("github.com") {
        return ProviderKind::GitHub;
    }

    // Check Azure patterns before GHE to avoid false positives
    if url_lower.contains("dev.azure.com")
        || url_lower.contains(".visualstudio.com")
        || url_lower.contains("ssh.dev.azure.com")
    {
        return ProviderKind::AzureDevOps;
    }

    // /_git/ is unique to Azure DevOps
    if url_lower.contains("/_git/") {
        return ProviderKind::AzureDevOps;
    }

    // GitHub Enterprise (contains "github." but not the Azure patterns above)
    if url_lower.contains("github.") {
        return ProviderKind::GitHub;
    }

    ProviderKind::Unknown
}

/// Detect the git hosting provider from a PR URL.
///
/// Supports:
/// - GitHub: `https://github.com/owner/repo/pull/123`
/// - GitHub Enterprise: `https://github.company.com/owner/repo/pull/123`
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo/pullrequest/123`
#[cfg(test)]
fn detect_provider_from_pr_url(pr_url: &str) -> ProviderKind {
    let url_lower = pr_url.to_lowercase();

    // GitHub pattern: contains /pull/ in the path
    if url_lower.contains("/pull/") {
        // Could be github.com or GHE
        if url_lower.contains("github.com") || url_lower.contains("github.") {
            return ProviderKind::GitHub;
        }
    }

    // Azure DevOps pattern: contains /pullrequest/ in the path
    if url_lower.contains("/pullrequest/") {
        return ProviderKind::AzureDevOps;
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
            ProviderKind::GitHub
        );
        assert_eq!(
            detect_provider_from_url("https://github.com/owner/repo.git"),
            ProviderKind::GitHub
        );
    }

    #[test]
    fn test_github_com_ssh() {
        assert_eq!(
            detect_provider_from_url("git@github.com:owner/repo.git"),
            ProviderKind::GitHub
        );
    }

    #[test]
    fn test_github_enterprise() {
        assert_eq!(
            detect_provider_from_url("https://github.company.com/owner/repo"),
            ProviderKind::GitHub
        );
        assert_eq!(
            detect_provider_from_url("https://github.acme.corp/team/project"),
            ProviderKind::GitHub
        );
        assert_eq!(
            detect_provider_from_url("git@github.internal.io:org/repo.git"),
            ProviderKind::GitHub
        );
    }

    #[test]
    fn test_azure_devops_https() {
        assert_eq!(
            detect_provider_from_url("https://dev.azure.com/org/project/_git/repo"),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_azure_devops_ssh() {
        assert_eq!(
            detect_provider_from_url("git@ssh.dev.azure.com:v3/org/project/repo"),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_azure_devops_legacy_visualstudio() {
        assert_eq!(
            detect_provider_from_url("https://org.visualstudio.com/project/_git/repo"),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_azure_devops_git_path() {
        // Any URL with /_git/ is Azure DevOps
        assert_eq!(
            detect_provider_from_url("https://custom.domain.com/org/project/_git/repo"),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_unknown_provider() {
        assert_eq!(
            detect_provider_from_url("https://gitlab.com/owner/repo"),
            ProviderKind::Unknown
        );
        assert_eq!(
            detect_provider_from_url("https://bitbucket.org/owner/repo"),
            ProviderKind::Unknown
        );
    }

    #[test]
    fn test_pr_url_github() {
        assert_eq!(
            detect_provider_from_pr_url("https://github.com/owner/repo/pull/123"),
            ProviderKind::GitHub
        );
        assert_eq!(
            detect_provider_from_pr_url("https://github.company.com/owner/repo/pull/456"),
            ProviderKind::GitHub
        );
    }

    #[test]
    fn test_pr_url_azure() {
        assert_eq!(
            detect_provider_from_pr_url(
                "https://dev.azure.com/org/project/_git/repo/pullrequest/123"
            ),
            ProviderKind::AzureDevOps
        );
        assert_eq!(
            detect_provider_from_pr_url(
                "https://org.visualstudio.com/project/_git/repo/pullrequest/456"
            ),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_parse_github_owner_repo_https() {
        assert_eq!(
            parse_github_owner_repo("https://github.com/owner/repo"),
            Some(GitHubRepoFromUrl {
                owner: "owner".to_string(),
                repo: "repo".to_string()
            })
        );
        assert_eq!(
            parse_github_owner_repo("https://github.com/owner/repo.git"),
            Some(GitHubRepoFromUrl {
                owner: "owner".to_string(),
                repo: "repo".to_string()
            })
        );
    }

    #[test]
    fn test_parse_github_owner_repo_ssh() {
        assert_eq!(
            parse_github_owner_repo("git@github.com:owner/repo.git"),
            Some(GitHubRepoFromUrl {
                owner: "owner".to_string(),
                repo: "repo".to_string()
            })
        );
        assert_eq!(
            parse_github_owner_repo("git@github.com:alice/my-repo.git"),
            Some(GitHubRepoFromUrl {
                owner: "alice".to_string(),
                repo: "my-repo".to_string()
            })
        );
    }

    #[test]
    fn test_parse_github_owner_repo_enterprise() {
        assert_eq!(
            parse_github_owner_repo("https://github.company.com/org/project"),
            Some(GitHubRepoFromUrl {
                owner: "org".to_string(),
                repo: "project".to_string()
            })
        );
    }

    #[test]
    fn test_parse_github_owner_repo_non_github() {
        assert_eq!(parse_github_owner_repo("https://gitlab.com/owner/repo"), None);
        assert_eq!(
            parse_github_owner_repo("https://bitbucket.org/owner/repo"),
            None
        );
    }
}
