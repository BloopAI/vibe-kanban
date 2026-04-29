//! Git hosting provider detection from repository URLs.

use crate::types::ProviderKind;

/// Detect the git hosting provider from a remote URL.
///
/// Supports:
/// - GitHub.com: `https://github.com/owner/repo` or `git@github.com:owner/repo.git`
/// - GitHub Enterprise: URLs containing `github.` (e.g., `https://github.company.com/owner/repo`)
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo` or legacy `https://org.visualstudio.com/...`
/// - Gitea/Forgejo: instances registered via `GITEA_URL` env var, or well-known
///   hostnames (`gitea.*`, `forgejo.*`, `codeberg.org`)
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
    if let Ok(gitea_url) = std::env::var("GITEA_URL") {
        let gitea_host = gitea_url
            .to_lowercase()
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_string();
        if !gitea_host.is_empty() && url_lower.contains(&gitea_host) {
            return ProviderKind::Gitea;
        }
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
/// Uses `GITEA_URL` env var only when the URL matches the configured instance.
/// Otherwise derives the base URL from the URL itself.
pub(crate) fn gitea_base_url(url: &str) -> String {
    // Use env var only if the URL actually matches the configured instance
    if let Ok(gitea_url) = std::env::var("GITEA_URL") {
        let gitea_host = gitea_url
            .to_lowercase()
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_string();
        if !gitea_host.is_empty() && url.to_lowercase().contains(&gitea_host) {
            return gitea_url.trim_end_matches('/').to_string();
        }
    }

    // Derive from URL — force HTTPS for non-HTTP schemes (ssh://, git://)
    if let Ok(parsed) = url::Url::parse(url)
        && let Some(host) = parsed.host_str()
    {
        let scheme = match parsed.scheme() {
            "http" | "https" => parsed.scheme(),
            _ => "https",
        };
        let mut base = format!("{scheme}://{host}");
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
    fn test_unknown_url_with_pulls_not_detected_as_gitea() {
        // /pulls/ alone should NOT trigger Gitea detection — prevents token leakage
        assert_eq!(
            detect_provider_from_url("https://evil.com/x/y/pulls/1"),
            ProviderKind::Unknown
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

    #[test]
    fn test_gitea_base_url_from_ssh_scheme() {
        // ssh:// URLs should produce https:// base, not ssh://
        let base = super::gitea_base_url("ssh://git@gitea.example.com/owner/repo.git");
        assert_eq!(base, "https://gitea.example.com");
    }

    #[test]
    fn test_gitea_base_url_from_git_scheme() {
        let base = super::gitea_base_url("git://gitea.example.com/owner/repo.git");
        assert_eq!(base, "https://gitea.example.com");
    }

    // Edge-case tests for GITEA_URL handling (Bugbot findings)
    //
    // SAFETY: These tests manipulate env vars which is unsafe in Rust 2024.
    // They must run single-threaded (--test-threads=1) to avoid races.

    unsafe fn set_gitea_url(val: &str) {
        std::env::set_var("GITEA_URL", val);
    }

    unsafe fn remove_gitea_url() {
        std::env::remove_var("GITEA_URL");
    }

    #[test]
    fn test_empty_gitea_url_does_not_match_all() {
        // str::contains("") is always true in Rust — ensure we guard against that
        unsafe { set_gitea_url("") };
        assert_eq!(
            detect_provider_from_url("https://gitlab.com/owner/repo"),
            ProviderKind::Unknown,
        );
        assert_eq!(
            detect_provider_from_url("https://bitbucket.org/owner/repo"),
            ProviderKind::Unknown,
        );
        unsafe { remove_gitea_url() };
    }

    #[test]
    fn test_scheme_only_gitea_url_does_not_match_all() {
        unsafe { set_gitea_url("https://") };
        assert_eq!(
            detect_provider_from_url("https://gitlab.com/owner/repo"),
            ProviderKind::Unknown,
        );
        unsafe { remove_gitea_url() };
    }

    #[test]
    fn test_gitea_base_url_derives_from_url_when_env_differs() {
        // GITEA_URL points to one instance, but URL is for Codeberg —
        // should derive base URL from the URL, not the env var
        unsafe { set_gitea_url("https://gitea.company.com") };
        let base = super::gitea_base_url("https://codeberg.org/owner/repo.git");
        assert_eq!(base, "https://codeberg.org");
        unsafe { remove_gitea_url() };
    }

    #[test]
    fn test_gitea_base_url_uses_env_when_matching() {
        unsafe { set_gitea_url("https://gitea.company.com") };
        let base = super::gitea_base_url("https://gitea.company.com/owner/repo.git");
        assert_eq!(base, "https://gitea.company.com");
        unsafe { remove_gitea_url() };
    }
}
