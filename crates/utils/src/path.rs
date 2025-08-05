use std::path::Path;

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

    // Try to make path relative to the worktree path
    match path_obj.strip_prefix(worktree_path_obj) {
        Ok(relative_path) => {
            let result = relative_path.to_string_lossy().to_string();
            tracing::debug!("Successfully made relative: '{}' -> '{}'", path, result);
            result
        }
        Err(_) => {
            // Handle symlinks by resolving canonical paths
            let canonical_path = std::fs::canonicalize(path);
            let canonical_worktree = std::fs::canonicalize(worktree_path);

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
    }
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
        let absolute_path = format!("{}/src/main.rs", test_worktree);
        let result = make_path_relative(&absolute_path, test_worktree);
        assert_eq!(result, "src/main.rs");

        // Test with path outside worktree (should return original)
        assert_eq!(
            make_path_relative("/other/path/file.js", "/tmp/test-worktree"),
            "/other/path/file.js"
        );
    }
}
