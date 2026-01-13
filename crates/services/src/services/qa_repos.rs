//! QA Mode: Hardcoded repository management for testing
//!
//! This module provides two hardcoded QA repositories that are cloned
//! to a persistent temp directory and returned as the only "recent" repos.

use std::{path::PathBuf, process::Command};

use once_cell::sync::Lazy;
use tracing::{info, warn};

use super::filesystem::{DirectoryEntry, FilesystemError};

/// QA repository URLs and names
const QA_REPOS: &[(&str, &str)] = &[
    ("internal-qa-1", "https://github.com/BloopAI/internal-qa-1"),
    ("internal-qa-2", "https://github.com/BloopAI/internal-qa-2"),
];

/// Persistent directory for QA repos - survives server restarts
static QA_REPOS_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let dir = utils::path::get_vibe_kanban_temp_dir().join("qa-repos");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        warn!("Failed to create QA repos directory: {}", e);
    }
    info!("QA repos directory: {:?}", dir);
    dir
});

/// Get the list of QA repositories, cloning them if necessary.
///
/// This function is called instead of the normal filesystem git repo discovery
/// when QA mode is enabled.
pub fn get_qa_repos() -> Result<Vec<DirectoryEntry>, FilesystemError> {
    let base_dir = &*QA_REPOS_DIR;

    // Ensure repos are cloned
    clone_qa_repos_if_needed(base_dir);

    // Build DirectoryEntry for each repo
    let entries = QA_REPOS
        .iter()
        .filter_map(|(name, _url)| {
            let repo_path = base_dir.join(name);
            if repo_path.exists() && repo_path.join(".git").exists() {
                let last_modified = std::fs::metadata(&repo_path)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| t.elapsed().unwrap_or_default().as_secs());

                Some(DirectoryEntry {
                    name: name.to_string(),
                    path: repo_path,
                    is_directory: true,
                    is_git_repo: true,
                    last_modified,
                })
            } else {
                warn!("QA repo {} not found at {:?}", name, repo_path);
                None
            }
        })
        .collect();

    Ok(entries)
}

/// Clone QA repositories if they don't already exist
fn clone_qa_repos_if_needed(base_dir: &std::path::Path) {
    for (name, url) in QA_REPOS {
        let repo_path = base_dir.join(name);

        if repo_path.join(".git").exists() {
            info!("QA repo {} already exists at {:?}", name, repo_path);
            continue;
        }

        info!("Cloning QA repo {} from {} to {:?}", name, url, repo_path);

        // Use git CLI for reliable TLS support (git2 has TLS issues)
        let output = Command::new("git")
            .args(["clone", "--depth", "1", url, &repo_path.to_string_lossy()])
            .output();

        match output {
            Ok(result) if result.status.success() => {
                info!("Successfully cloned QA repo {}", name);
            }
            Ok(result) => {
                warn!(
                    "Failed to clone QA repo {}: {}",
                    name,
                    String::from_utf8_lossy(&result.stderr)
                );
                // Try to clean up partial clone
                let _ = std::fs::remove_dir_all(&repo_path);
            }
            Err(e) => {
                warn!("Failed to run git clone for {}: {}", name, e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qa_repos_dir_is_persistent() {
        let dir1 = &*QA_REPOS_DIR;
        let dir2 = &*QA_REPOS_DIR;
        assert_eq!(dir1, dir2);
        assert!(dir1.ends_with("qa-repos"));
    }
}
