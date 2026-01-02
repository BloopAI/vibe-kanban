use std::{path::Path, process::Command};

use serde::Deserialize;
use tracing::debug;
use url::Url;

use crate::error::ReviewError;

/// Information about a pull request
#[derive(Debug)]
pub struct PrInfo {
    pub owner: String,
    pub repo: String,
    pub title: String,
    pub description: String,
    pub base_commit: String,
    pub head_commit: String,
    pub head_ref_name: String,
}

/// Response from `gh pr view --json`
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrView {
    title: String,
    body: String,
    base_ref_oid: String,
    head_ref_oid: String,
    head_ref_name: String,
}

/// Parse a GitHub PR URL to extract owner, repo, and PR number
///
/// Expected format: https://github.com/owner/repo/pull/123
/// Also supports GitHub Enterprise: https://github.company.com/owner/repo/pull/123
pub fn parse_pr_url(url: &str) -> Result<(String, String, i64), ReviewError> {
    let url = url.trim();

    // Parse the URL using the url crate
    let parsed_url = Url::parse(url).map_err(|_| ReviewError::InvalidPrUrl)?;

    // Get path segments
    let path_segments: Vec<&str> = parsed_url
        .path_segments()
        .ok_or(ReviewError::InvalidPrUrl)?
        .collect();

    // We need at least: owner / repo / pull / number
    if path_segments.len() < 4 {
        return Err(ReviewError::InvalidPrUrl);
    }

    // Find the "pull" segment and extract owner/repo/number
    let pull_idx = path_segments
        .iter()
        .position(|&p| p == "pull")
        .ok_or(ReviewError::InvalidPrUrl)?;

    // We need at least: owner / repo / pull / number
    if pull_idx < 2 || path_segments.len() < pull_idx + 2 {
        return Err(ReviewError::InvalidPrUrl);
    }

    let owner = path_segments[pull_idx - 2].to_string();
    let repo = path_segments[pull_idx - 1].to_string();

    let pr_number: i64 = path_segments[pull_idx + 1]
        .parse()
        .map_err(|_| ReviewError::InvalidPrUrl)?;

    if owner.is_empty() || repo.is_empty() || pr_number <= 0 {
        return Err(ReviewError::InvalidPrUrl);
    }

    Ok((owner, repo, pr_number))
}

/// Check if the GitHub CLI is installed
fn ensure_gh_available() -> Result<(), ReviewError> {
    let output = Command::new("which")
        .arg("gh")
        .output()
        .map_err(|_| ReviewError::GhNotInstalled)?;

    if !output.status.success() {
        return Err(ReviewError::GhNotInstalled);
    }

    Ok(())
}

/// Get PR information using `gh pr view`
pub fn get_pr_info(owner: &str, repo: &str, pr_number: i64) -> Result<PrInfo, ReviewError> {
    ensure_gh_available()?;

    debug!("Fetching PR info for {owner}/{repo}#{pr_number}");

    let output = Command::new("gh")
        .args([
            "pr",
            "view",
            &pr_number.to_string(),
            "--repo",
            &format!("{owner}/{repo}"),
            "--json",
            "title,body,baseRefOid,headRefOid,headRefName",
        ])
        .output()
        .map_err(|e| ReviewError::PrInfoFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let lower = stderr.to_ascii_lowercase();

        if lower.contains("authentication")
            || lower.contains("gh auth login")
            || lower.contains("unauthorized")
        {
            return Err(ReviewError::GhNotAuthenticated);
        }

        return Err(ReviewError::PrInfoFailed(stderr.to_string()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let pr_view: GhPrView =
        serde_json::from_str(&stdout).map_err(|e| ReviewError::PrInfoFailed(e.to_string()))?;

    Ok(PrInfo {
        owner: owner.to_string(),
        repo: repo.to_string(),
        title: pr_view.title,
        description: pr_view.body,
        base_commit: pr_view.base_ref_oid,
        head_commit: pr_view.head_ref_oid,
        head_ref_name: pr_view.head_ref_name,
    })
}

/// Clone a repository using `gh repo clone`
pub fn clone_repo(owner: &str, repo: &str, target_dir: &Path) -> Result<(), ReviewError> {
    ensure_gh_available()?;

    debug!("Cloning {owner}/{repo} to {}", target_dir.display());

    let output = Command::new("gh")
        .args([
            "repo",
            "clone",
            &format!("{owner}/{repo}"),
            target_dir
                .to_str()
                .ok_or_else(|| ReviewError::CloneFailed("Invalid target path".to_string()))?,
        ])
        .output()
        .map_err(|e| ReviewError::CloneFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ReviewError::CloneFailed(stderr.to_string()));
    }

    Ok(())
}

/// Checkout a specific commit by SHA
///
/// This is more reliable than `gh pr checkout` because it works even when
/// the PR's branch has been deleted (common for merged PRs).
pub fn checkout_commit(commit_sha: &str, repo_dir: &Path) -> Result<(), ReviewError> {
    debug!("Fetching commit {commit_sha} in {}", repo_dir.display());

    // First, fetch the specific commit
    let output = Command::new("git")
        .args(["fetch", "origin", commit_sha])
        .current_dir(repo_dir)
        .output()
        .map_err(|e| ReviewError::CheckoutFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ReviewError::CheckoutFailed(format!(
            "Failed to fetch commit: {stderr}"
        )));
    }

    debug!("Checking out commit {commit_sha}");

    // Then checkout the commit
    let output = Command::new("git")
        .args(["checkout", commit_sha])
        .current_dir(repo_dir)
        .output()
        .map_err(|e| ReviewError::CheckoutFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ReviewError::CheckoutFailed(format!(
            "Failed to checkout commit: {stderr}"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pr_url_valid() {
        let (owner, repo, pr) = parse_pr_url("https://github.com/anthropics/claude-code/pull/123")
            .expect("Should parse valid URL");
        assert_eq!(owner, "anthropics");
        assert_eq!(repo, "claude-code");
        assert_eq!(pr, 123);
    }

    #[test]
    fn test_parse_pr_url_with_trailing_slash() {
        let (owner, repo, pr) =
            parse_pr_url("https://github.com/owner/repo/pull/456/").expect("Should parse");
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
        assert_eq!(pr, 456);
    }

    #[test]
    fn test_parse_pr_url_github_enterprise() {
        let (owner, repo, pr) =
            parse_pr_url("https://github.company.com/anthropics/claude-code/pull/123")
                .expect("Should parse GitHub Enterprise URL");
        assert_eq!(owner, "anthropics");
        assert_eq!(repo, "claude-code");
        assert_eq!(pr, 123);
    }

    #[test]
    fn test_parse_pr_url_github_enterprise_with_trailing_slash() {
        let (owner, repo, pr) =
            parse_pr_url("https://git.company.com/owner/repo/pull/456/")
                .expect("Should parse GitHub Enterprise URL with trailing slash");
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
        assert_eq!(pr, 456);
    }

    #[test]
    fn test_parse_pr_url_with_query_params() {
        // URLs with query parameters should still work
        let (owner, repo, pr) = parse_pr_url("https://github.com/owner/repo/pull/123?tab=files")
            .expect("Should parse URL with query params");
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
        assert_eq!(pr, 123);
    }

    #[test]
    fn test_parse_pr_url_enterprise_with_query_params() {
        // GitHub Enterprise URLs with query parameters
        let (owner, repo, pr) = parse_pr_url("https://github.company.com/owner/repo/pull/456?tab=commits")
            .expect("Should parse Enterprise URL with query params");
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
        assert_eq!(pr, 456);
    }

    #[test]
    fn test_parse_pr_url_invalid_format() {
        assert!(parse_pr_url("https://github.com/owner/repo").is_err());
        assert!(parse_pr_url("https://github.com/owner/repo/issues/123").is_err());
        assert!(parse_pr_url("https://gitlab.com/owner/repo/pull/123").is_err());
        assert!(parse_pr_url("not a url").is_err());
    }
}
