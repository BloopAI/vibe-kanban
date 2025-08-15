use std::path::{Path, PathBuf};

/// Convert absolute paths to relative paths based on worktree path
/// This is a robust implementation that handles symlinks and edge cases
pub fn make_path_relative(path: &str, worktree_path: &str) -> String {
    let path_obj = Path::new(path);
    let worktree_path_obj = Path::new(worktree_path);

    tracing::debug!("Making path relative: {} -> {}", path, worktree_path);

    // If path is already relative, return as is
    if path_obj.is_relative() {
        return path.to_string();
    }

    let path_obj = normalize_macos_private_alias(path_obj);
    let worktree_path_obj = normalize_macos_private_alias(worktree_path_obj);

    if let Ok(relative_path) = path_obj.strip_prefix(&worktree_path_obj) {
        let result = relative_path.to_string_lossy().to_string();
        tracing::debug!("Successfully made relative: '{}' -> '{}'", path, result);
        if result.is_empty() {
            return ".".to_string();
        }
        return result;
    }

    if !path_obj.exists() || !worktree_path_obj.exists() {
        return path.to_string();
    }

    // canonicalize may fail if paths don't exist
    let canonical_path = std::fs::canonicalize(&path_obj);
    let canonical_worktree = std::fs::canonicalize(&worktree_path_obj);

    match (canonical_path, canonical_worktree) {
        (Ok(canon_path), Ok(canon_worktree)) => {
            tracing::debug!(
                "Trying canonical path resolution: '{}' -> '{}', '{}' -> '{}'",
                path,
                canon_path.display(),
                worktree_path,
                canon_worktree.display()
            );

            match canon_path.strip_prefix(&canon_worktree) {
                Ok(relative_path) => {
                    let result = relative_path.to_string_lossy().to_string();
                    tracing::debug!(
                        "Successfully made relative with canonical paths: '{}' -> '{}'",
                        path,
                        result
                    );
                    if result.is_empty() {
                        return ".".to_string();
                    }
                    result
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to make canonical path relative: '{}' relative to '{}', error: {}, returning original",
                        canon_path.display(),
                        canon_worktree.display(),
                        e
                    );
                    path.to_string()
                }
            }
        }
        _ => {
            tracing::debug!(
                "Could not canonicalize paths (paths may not exist): '{}', '{}', returning original",
                path,
                worktree_path
            );
            path.to_string()
        }
    }
}

/// Normalize macOS prefix /private/var/ and /private/tmp/ to their public aliases without resolving paths.
/// This allows prefix normalization to work when the full paths don't exist.
fn normalize_macos_private_alias<P: AsRef<Path>>(p: P) -> PathBuf {
    let p = p.as_ref();
    if cfg!(target_os = "macos")
        && let Some(s) = p.to_str()
    {
        if s == "/private/var" {
            return PathBuf::from("/var");
        }
        if let Some(rest) = s.strip_prefix("/private/var/") {
            return PathBuf::from(format!("/var/{rest}"));
        }
        if s == "/private/tmp" {
            return PathBuf::from("/tmp");
        }
        if let Some(rest) = s.strip_prefix("/private/tmp/") {
            return PathBuf::from(format!("/tmp/{rest}"));
        }
    }
    p.to_path_buf()
}

pub fn get_vibe_kanban_temp_dir() -> std::path::PathBuf {
    let dir_name = if cfg!(debug_assertions) {
        "vibe-kanban-dev"
    } else {
        "vibe-kanban"
    };

    if cfg!(target_os = "macos") {
        // macOS already uses /var/folders/... which is persistent storage
        std::env::temp_dir().join(dir_name)
    } else if cfg!(target_os = "linux") {
        // Linux: use /var/tmp instead of /tmp to avoid RAM usage
        std::path::PathBuf::from("/var/tmp").join(dir_name)
    } else {
        // Windows and other platforms: use temp dir with vibe-kanban subdirectory
        std::env::temp_dir().join(dir_name)
    }
}

/// Expand leading ~ to user's home directory.
pub fn expand_tilde(path_str: &str) -> std::path::PathBuf {
    shellexpand::tilde(path_str).as_ref().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_path_relative() {
        // Test with relative path (should remain unchanged)
        assert_eq!(
            make_path_relative("src/main.rs", "/tmp/test-worktree"),
            "src/main.rs"
        );

        // Test with absolute path (should become relative if possible)
        let test_worktree = "/tmp/test-worktree";
        let absolute_path = format!("{test_worktree}/src/main.rs");
        let result = make_path_relative(&absolute_path, test_worktree);
        assert_eq!(result, "src/main.rs");

        // Test with path outside worktree (should return original)
        assert_eq!(
            make_path_relative("/other/path/file.js", "/tmp/test-worktree"),
            "/other/path/file.js"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_make_path_relative_macos_private_alias() {
        // Simulate a worktree under /var with a path reported under /private/var
        let worktree = "/var/folders/zz/abc123/T/vibe-kanban-dev/worktrees/vk-test";
        let path_under_private = format!(
            "/private/var{}/hello-world.txt",
            worktree.strip_prefix("/var").unwrap()
        );
        assert_eq!(
            make_path_relative(&path_under_private, worktree),
            "hello-world.txt"
        );

        // Also handle the inverse: worktree under /private and path under /var
        let worktree_private = format!("/private{worktree}");
        let path_under_var = format!("{worktree}/hello-world.txt");
        assert_eq!(
            make_path_relative(&path_under_var, &worktree_private),
            "hello-world.txt"
        );
    }
}
