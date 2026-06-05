//! Git hosting provider detection from repository URLs.

use crate::types::ProviderKind;

/// Detect the git hosting provider from a remote URL.
///
/// Supports:
/// - GitHub.com: `https://github.com/owner/repo` or `git@github.com:owner/repo.git`
/// - GitHub Enterprise: URLs containing `github.` (e.g., `https://github.company.com/owner/repo`)
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo` or legacy `https://org.visualstudio.com/...`
/// - Forgejo/Gitea: Known instances (codeberg.org, gitea.com) or hostname containing `forgejo` or `gitea`
pub(crate) fn detect_provider_from_url(url: &str) -> ProviderKind {
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

    // Check Forgejo/Gitea patterns BEFORE GitHub Enterprise (since generic hostnames could false-positive)
    // Known Forgejo/Gitea hostnames
    if url_lower.contains("codeberg.org") || url_lower.contains("gitea.com") {
        return ProviderKind::Forgejo;
    }
    // Custom Forgejo/Gitea instances: hostname contains "forgejo" or "gitea"
    if url_lower.contains("forgejo") || url_lower.contains("gitea") {
        return ProviderKind::Forgejo;
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
/// - Forgejo/Gitea: `https://forgejo.example.com/owner/repo/pulls/123` (plural /pulls/)
#[cfg(test)]
fn detect_provider_from_pr_url(pr_url: &str) -> ProviderKind {
    let url_lower = pr_url.to_lowercase();

    // Forgejo/Gitea pattern: contains /pulls/ (plural) in the path
    if url_lower.contains("/pulls/") {
        // Could be codeberg, gitea.com, or custom forgejo/gitea instance
        if url_lower.contains("codeberg.org")
            || url_lower.contains("gitea.com")
            || url_lower.contains("forgejo")
            || url_lower.contains("gitea")
        {
            return ProviderKind::Forgejo;
        }
    }

    // GitHub pattern: contains /pull/ (singular) in the path
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
    fn test_forgejo_url_codeberg() {
        assert_eq!(
            detect_provider_from_url("https://codeberg.org/owner/repo"),
            ProviderKind::Forgejo
        );
        assert_eq!(
            detect_provider_from_url("https://codeberg.org/owner/repo.git"),
            ProviderKind::Forgejo
        );
        assert_eq!(
            detect_provider_from_url("git@codeberg.org:owner/repo.git"),
            ProviderKind::Forgejo
        );
    }

    #[test]
    fn test_forgejo_url_gitea_com() {
        assert_eq!(
            detect_provider_from_url("https://gitea.com/owner/repo"),
            ProviderKind::Forgejo
        );
        assert_eq!(
            detect_provider_from_url("git@gitea.com:owner/repo.git"),
            ProviderKind::Forgejo
        );
    }

    #[test]
    fn test_forgejo_url_custom_instance() {
        // Custom Forgejo instance
        assert_eq!(
            detect_provider_from_url("https://forgejo.example.com/owner/repo"),
            ProviderKind::Forgejo
        );
        assert_eq!(
            detect_provider_from_url("https://git.forgejo.example.com/owner/repo"),
            ProviderKind::Forgejo
        );
        // Custom Gitea instance
        assert_eq!(
            detect_provider_from_url("https://gitea.mycompany.com/owner/repo"),
            ProviderKind::Forgejo
        );
        assert_eq!(
            detect_provider_from_url("git@gitea.mycompany.com:owner/repo.git"),
            ProviderKind::Forgejo
        );
    }

    #[test]
    fn test_forgejo_pr_url() {
        // Forgejo uses /pulls/ (plural) in PR URLs
        assert_eq!(
            detect_provider_from_pr_url("https://codeberg.org/owner/repo/pulls/123"),
            ProviderKind::Forgejo
        );
        assert_eq!(
            detect_provider_from_pr_url("https://forgejo.example.com/owner/repo/pulls/456"),
            ProviderKind::Forgejo
        );
        assert_eq!(
            detect_provider_from_pr_url("https://gitea.com/owner/repo/pulls/789"),
            ProviderKind::Forgejo
        );
    }

    #[test]
    fn test_forgejo_different_from_github() {
        // Forgejo URLs should NOT be detected as GitHub even if they contain similar patterns
        assert_ne!(
            detect_provider_from_url("https://codeberg.org/owner/repo"),
            ProviderKind::GitHub
        );
        // GitHub Enterprise should still be detected as GitHub
        assert_eq!(
            detect_provider_from_url("https://github.company.com/owner/repo"),
            ProviderKind::GitHub
        );
    }
}
