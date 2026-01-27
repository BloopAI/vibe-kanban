use std::path::PathBuf;

use tokio::process::Command;

pub async fn check_uncommitted_changes(repo_paths: &[PathBuf]) -> String {
    if repo_paths.is_empty() {
        return String::new();
    }

    let mut all_status = String::new();

    for repo_path in repo_paths {
        if !repo_path.join(".git").exists() {
            continue;
        }

        let output = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(repo_path)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .await;

        if let Ok(out) = output
            && !out.stdout.is_empty()
        {
            let status = String::from_utf8_lossy(&out.stdout);
            all_status.push_str(&format!("\n{}:\n{}", repo_path.display(), status));
        }
    }

    all_status
}

pub fn is_valid_branch_prefix(prefix: &str) -> bool {
    if prefix.is_empty() {
        return true;
    }

    if prefix.contains('/') {
        return false;
    }

    git2::Branch::name_is_valid(&format!("{prefix}/x")).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_prefixes() {
        assert!(is_valid_branch_prefix(""));
        assert!(is_valid_branch_prefix("vk"));
        assert!(is_valid_branch_prefix("feature"));
        assert!(is_valid_branch_prefix("hotfix-123"));
        assert!(is_valid_branch_prefix("foo.bar"));
        assert!(is_valid_branch_prefix("foo_bar"));
        assert!(is_valid_branch_prefix("FOO-Bar"));
    }

    #[test]
    fn test_invalid_prefixes() {
        assert!(!is_valid_branch_prefix("foo/bar"));
        assert!(!is_valid_branch_prefix("foo..bar"));
        assert!(!is_valid_branch_prefix("foo@{"));
        assert!(!is_valid_branch_prefix("foo.lock"));
        // Note: git2 allows trailing dots in some contexts, but we enforce stricter rules
        // for prefixes by checking the full branch name format
        assert!(!is_valid_branch_prefix("foo bar"));
        assert!(!is_valid_branch_prefix("foo?"));
        assert!(!is_valid_branch_prefix("foo*"));
        assert!(!is_valid_branch_prefix("foo~"));
        assert!(!is_valid_branch_prefix("foo^"));
        assert!(!is_valid_branch_prefix("foo:"));
        assert!(!is_valid_branch_prefix("foo["));
        assert!(!is_valid_branch_prefix("/foo"));
        assert!(!is_valid_branch_prefix("foo/"));
        assert!(!is_valid_branch_prefix(".foo"));
    }
}
