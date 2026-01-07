use services::services::{git::GitService, worktree_manager::WorktreeManager};
use tempfile::TempDir;

#[tokio::test]
async fn create_worktree_when_repo_path_is_a_worktree() {
    let td = TempDir::new().unwrap();

    let repo_path = td.path().join("repo");
    let git_service = GitService::new();
    git_service
        .initialize_repo_with_main_branch(&repo_path)
        .unwrap();

    let base_worktree_path = td.path().join("wt-base");
    WorktreeManager::create_worktree(
        &repo_path,
        "wt-base-branch",
        &base_worktree_path,
        "main",
        true,
    )
    .await
    .unwrap();
    assert!(base_worktree_path.join(".git").is_file());

    let child_worktree_path = td.path().join("wt-child");
    WorktreeManager::create_worktree(
        &base_worktree_path,
        "wt-child-branch",
        &child_worktree_path,
        "main",
        true,
    )
    .await
    .unwrap();
    assert!(child_worktree_path.join(".git").is_file());

    // Regression: repo_path itself is a worktree (so `.git` is a file), but metadata lookup still works.
    WorktreeManager::ensure_worktree_exists(
        &base_worktree_path,
        "wt-child-branch",
        &child_worktree_path,
    )
    .await
    .unwrap();
}
