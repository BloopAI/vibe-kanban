#[cfg(test)]
mod filesystem_tests {
    use std::{fs, path::Path};

    use services::services::filesystem::FilesystemService;
    use tempfile::TempDir;

    /// Helper function to create a directory structure
    fn create_dir_structure(base: &Path, path: &str) {
        let full_path = base.join(path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::create_dir_all(&full_path).unwrap();
    }

    /// Helper function to create a git repository (just creates .git directory)
    fn create_git_repo(base: &Path, path: &str) {
        create_dir_structure(base, path);
        let git_dir = base.join(path).join(".git");
        fs::create_dir_all(&git_dir).unwrap();
    }

    #[tokio::test]
    async fn test_list_git_repos_discovers_repos() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        // Create test structure:
        // temp_dir/
        //   ├── project1/ (.git)
        //   ├── project2/ (.git)
        //   ├── regular_folder/
        //   └── nested/
        //       └── deep_repo/ (.git)
        create_git_repo(base_path, "project1");
        create_git_repo(base_path, "project2");
        create_dir_structure(base_path, "regular_folder");
        let nested_path = base_path.join("nested");
        fs::create_dir_all(&nested_path).unwrap();
        create_git_repo(&nested_path, "deep_repo");

        let filesystem_service = FilesystemService::new();

        // Test discovering repos with reasonable timeouts
        let repos = filesystem_service
            .list_git_repos(
                Some(base_path.to_string_lossy().to_string()),
                5000,    // 5 second timeout
                10000,   // 10 second hard timeout
                Some(3), // max depth 3
            )
            .await
            .unwrap();

        // Verify we found the git repositories
        let repo_names: Vec<String> = repos.iter().map(|r| r.name.clone()).collect();

        assert!(repo_names.contains(&"project1".to_string()));
        assert!(repo_names.contains(&"project2".to_string()));
        assert!(repo_names.contains(&"deep_repo".to_string()));
        assert!(!repo_names.contains(&"regular_folder".to_string()));

        // Verify all discovered entries are marked as git repos
        for repo in &repos {
            assert!(repo.is_git_repo);
            assert!(repo.is_directory);
        }
    }

    #[tokio::test]
    async fn test_list_git_repos_respects_skip_directories() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        // Create repos in directories that should be skipped
        create_git_repo(base_path, "node_modules/some_repo");
        create_git_repo(base_path, "target/debug_repo");
        create_git_repo(base_path, "build/build_repo");

        // Create repos that should be found
        create_git_repo(base_path, "src_repo");
        create_git_repo(base_path, "my_project");

        let filesystem_service = FilesystemService::new();

        let repos = filesystem_service
            .list_git_repos(
                Some(base_path.to_string_lossy().to_string()),
                5000,
                10000,
                Some(3),
            )
            .await
            .unwrap();

        let repo_names: Vec<String> = repos.iter().map(|r| r.name.clone()).collect();

        // Should find the valid repos
        assert!(repo_names.contains(&"src_repo".to_string()));
        assert!(repo_names.contains(&"my_project".to_string()));

        // Should skip repos in ignored directories
        assert!(!repo_names.contains(&"some_repo".to_string()));
        assert!(!repo_names.contains(&"debug_repo".to_string()));
        assert!(!repo_names.contains(&"build_repo".to_string()));
    }

    #[tokio::test]
    async fn test_list_git_repos_empty_directory() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        // Create empty directory with no git repos
        create_dir_structure(base_path, "empty_folder");

        let filesystem_service = FilesystemService::new();

        let repos = filesystem_service
            .list_git_repos(
                Some(base_path.to_string_lossy().to_string()),
                5000,
                10000,
                Some(2),
            )
            .await
            .unwrap();

        // Should return empty list
        assert!(repos.is_empty());
    }

    #[tokio::test]
    async fn test_list_git_repos_nonexistent_path() {
        let filesystem_service = FilesystemService::new();

        let result = filesystem_service
            .list_git_repos(
                Some("/nonexistent/path/that/does/not/exist".to_string()),
                1000,
                2000,
                Some(2),
            )
            .await;

        // Should return an error for non-existent path
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_list_git_repos_with_max_depth_limit() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        // Create nested structure deeper than max depth
        let deep_path = base_path.join("level1").join("level2").join("level3");
        fs::create_dir_all(&deep_path).unwrap();
        create_git_repo(&deep_path, "deep_repo");
        create_git_repo(base_path, "shallow_repo");

        let filesystem_service = FilesystemService::new();

        // Search with depth limit of 2
        let repos = filesystem_service
            .list_git_repos(
                Some(base_path.to_string_lossy().to_string()),
                5000,
                10000,
                Some(2), // Max depth 2 - should not find deep_repo
            )
            .await
            .unwrap();

        let repo_names: Vec<String> = repos.iter().map(|r| r.name.clone()).collect();

        // Should find shallow repo
        assert!(repo_names.contains(&"shallow_repo".to_string()));

        // Should not find deep repo due to depth limit
        assert!(!repo_names.contains(&"deep_repo".to_string()));
    }
}
