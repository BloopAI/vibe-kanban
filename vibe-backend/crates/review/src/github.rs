use std::{path::Path, process::Command};

use serde::Deserialize;
use tracing::debug;

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
pub fn parse_pr_url(url: &str) -> Result<(String, String, i64), ReviewError> {
    let url = url.trim();

    // Remove trailing slashes
    let url = url.trim_end_matches('/');

    // Try to parse as URL
    let parts: Vec<&str> = url.split('/').collect();

    // Find the index of "github.com" and then extract owner/repo/pull/number
    let github_idx = parts
        .iter()
        .position(|&p| p == "github.com")
        .ok_or(ReviewError::InvalidPrUrl)?;

    // We need at least: github.com / owner / repo / pull / number
    if parts.len() < github_idx + 5 {
        return Err(ReviewError::InvalidPrUrl);
    }

    let owner = parts[github_idx + 1].to_string();
    let repo = parts[github_idx + 2].to_string();

    if parts[github_idx + 3] != "pull" {
        return Err(ReviewError::InvalidPrUrl);
    }

    let pr_number: i64 = parts[github_idx + 4]
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
    fn test_parse_pr_url_invalid_format() {
        assert!(parse_pr_url("https://github.com/owner/repo").is_err());
        assert!(parse_pr_url("https://github.com/owner/repo/issues/123").is_err());
        assert!(parse_pr_url("https://gitlab.com/owner/repo/pull/123").is_err());
        assert!(parse_pr_url("not a url").is_err());
    }
}
