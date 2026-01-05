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

#[derive(Debug, Deserialize)]
struct GhRepoOwner {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GhRepo {
    owner: GhRepoOwner,
    name: String,
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
    head_repository: GhRepo,
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

pub fn get_pr_info(pr_url: &str) -> Result<PrInfo, ReviewError> {
    ensure_gh_available()?;

    debug!("Fetching PR info for {pr_url}");

    let output = Command::new("gh")
        .args([
            "pr",
            "view",
            pr_url,
            "--json",
            "title,body,baseRefOid,headRefOid,headRefName,headRepository",
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
        owner: pr_view.head_repository.owner.login,
        repo: pr_view.head_repository.name,
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
