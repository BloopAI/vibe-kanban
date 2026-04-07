//! Git hosting provider detection from repository URLs.

use crate::types::ProviderKind;

/// Detect the git hosting provider from a remote URL.
///
/// Supports:
/// - GitHub.com: `https://github.com/owner/repo` or `git@github.com:owner/repo.git`
/// - GitHub Enterprise: URLs containing `github.` (e.g., `https://github.company.com/owner/repo`)
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo` or legacy `https://org.visualstudio.com/...`
/// - Gitea/Forgejo: instances registered via `GITEA_URL` env var, or URLs containing
///   `/pulls/` (Gitea PR URL pattern), or `gitea.` / `forgejo.` in the hostname
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

    // GitHub Enterprise (contains "github." but not the Azure patterns above)
    if url_lower.contains("github.") {
        return ProviderKind::GitHub;
    }

    // Gitea/Forgejo: explicit GITEA_URL match
    if let Ok(gitea_url) = std::env::var("GITEA_URL")
        && url_lower.contains(
            gitea_url
                .to_lowercase()
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .trim_end_matches('/'),
        )
    {
        return ProviderKind::Gitea;
    }

    // Gitea PR URL pattern: /pulls/ in path (GitHub uses /pull/, Azure uses /pullrequest/)
    if url_lower.contains("/pulls/") {
        return ProviderKind::Gitea;
    }

    // Well-known Gitea/Forgejo hostnames
    if url_lower.contains("gitea.") || url_lower.contains("forgejo.") {
        return ProviderKind::Gitea;
    }

    // Codeberg is a large Forgejo instance
    if url_lower.contains("codeberg.org") {
        return ProviderKind::Gitea;
    }

    ProviderKind::Unknown
}

/// Extract the base URL for a Gitea instance from a remote or PR URL.
///
/// Prefers `GITEA_URL` env var when set, otherwise derives it from the URL.
pub(crate) fn gitea_base_url(url: &str) -> String {
    // Prefer explicit env var
    if let Ok(gitea_url) = std::env::var("GITEA_URL")
        && !gitea_url.is_empty()
    {
        return gitea_url.trim_end_matches('/').to_string();
    }

    // Derive from URL
    if let Ok(parsed) = url::Url::parse(url) {
        let mut base = format!("{}://{}", parsed.scheme(), parsed.host_str().unwrap_or(""));
        if let Some(port) = parsed.port() {
            base.push_str(&format!(":{port}"));
        }
        return base;
    }

    // SSH-style: git@host:owner/repo.git → https://host
    if let Some(host_part) = url.strip_prefix("git@")
        && let Some(host) = host_part.split(':').next()
    {
        return format!("https://{host}");
    }

    url.to_string()
}

/// Detect the git hosting provider from a PR URL.
///
/// Supports:
/// - GitHub: `https://github.com/owner/repo/pull/123`
/// - GitHub Enterprise: `https://github.company.com/owner/repo/pull/123`
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo/pullrequest/123`
/// - Gitea/Forgejo: `https://gitea.example.com/owner/repo/pulls/123`
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

    // Fall back to general URL detection (handles Gitea /pulls/ pattern too)
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
    fn test_gitea_well_known_hostname() {
        assert_eq!(
            detect_provider_from_url("https://gitea.company.com/owner/repo"),
            ProviderKind::Gitea
        );
        assert_eq!(
            detect_provider_from_url("https://forgejo.example.org/owner/repo"),
            ProviderKind::Gitea
        );
    }

    #[test]
    fn test_gitea_codeberg() {
        assert_eq!(
            detect_provider_from_url("https://codeberg.org/owner/repo"),
            ProviderKind::Gitea
        );
        assert_eq!(
            detect_provider_from_url("git@codeberg.org:owner/repo.git"),
            ProviderKind::Gitea
        );
    }

    #[test]
    fn test_gitea_pr_url_pattern() {
        assert_eq!(
            detect_provider_from_url("https://git.example.com/owner/repo/pulls/42"),
            ProviderKind::Gitea
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
    fn test_pr_url_gitea() {
        assert_eq!(
            detect_provider_from_pr_url("https://gitea.example.com/owner/repo/pulls/42"),
            ProviderKind::Gitea
        );
        assert_eq!(
            detect_provider_from_pr_url("https://codeberg.org/owner/repo/pulls/7"),
            ProviderKind::Gitea
        );
    }

    #[test]
    fn test_gitea_base_url_from_https() {
        let base = super::gitea_base_url("https://gitea.example.com/owner/repo.git");
        assert_eq!(base, "https://gitea.example.com");
    }

    #[test]
    fn test_gitea_base_url_with_port() {
        let base = super::gitea_base_url("http://localhost:3000/owner/repo");
        assert_eq!(base, "http://localhost:3000");
    }

    #[test]
    fn test_gitea_base_url_from_ssh() {
        let base = super::gitea_base_url("git@gitea.example.com:owner/repo.git");
        assert_eq!(base, "https://gitea.example.com");
    }
}
