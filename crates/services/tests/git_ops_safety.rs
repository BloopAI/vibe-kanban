use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use git2::{Repository, build::CheckoutBuilder};
use services::services::git::GitService;
use services::services::git_cli::GitCli; // used only to set up sparse-checkout
use tempfile::TempDir;
// Avoid direct git CLI usage in tests; exercise GitService instead.

fn write_file<P: AsRef<Path>>(base: P, rel: &str, content: &str) {
    let path = base.as_ref().join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    let mut f = fs::File::create(&path).unwrap();
    f.write_all(content.as_bytes()).unwrap();
}

fn commit_all(repo: &Repository, message: &str) {
    let mut index = repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();
    let tree_id = index.write_tree().unwrap();
    let tree = repo.find_tree(tree_id).unwrap();
    let sig = repo.signature().unwrap();
    let parents: Vec<git2::Commit> = match repo.head() {
        Ok(h) => vec![h.peel_to_commit().unwrap()],
        Err(e) if e.code() == git2::ErrorCode::UnbornBranch => vec![],
        Err(e) => panic!("failed to read HEAD: {e}"),
    };
    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
    let update_ref = if repo.head().is_ok() {
        Some("HEAD")
    } else {
        None
    };
    repo.commit(update_ref, &sig, &sig, message, &tree, &parent_refs)
        .unwrap();
}

fn checkout_branch(repo: &Repository, name: &str) {
    repo.set_head(&format!("refs/heads/{name}")).unwrap();
    let mut co = CheckoutBuilder::new();
    co.force();
    repo.checkout_head(Some(&mut co)).unwrap();
}

fn create_branch_from_head(repo: &Repository, name: &str) {
    let head = repo.head().unwrap().peel_to_commit().unwrap();
    let _ = repo.branch(name, &head, true).unwrap();
}

fn configure_user(repo: &Repository) {
    let mut cfg = repo.config().unwrap();
    cfg.set_str("user.name", "Test User").unwrap();
    cfg.set_str("user.email", "test@example.com").unwrap();
}

use services::services::git::DiffTarget;

// Non-conflicting setup used by several tests
fn setup_repo_with_worktree(root: &TempDir) -> (PathBuf, PathBuf) {
    let repo_path = root.path().join("repo");
    let worktree_path = root.path().join("wt-feature");

    let service = GitService::new();
    service
        .initialize_repo_with_main_branch(&repo_path)
        .expect("init repo");

    let repo = Repository::open(&repo_path).unwrap();
    configure_user(&repo);
    checkout_branch(&repo, "main");

    write_file(&repo_path, "common.txt", "base\n");
    commit_all(&repo, "initial main commit");

    create_branch_from_head(&repo, "old-base");
    checkout_branch(&repo, "old-base");
    write_file(&repo_path, "base.txt", "from old-base\n");
    commit_all(&repo, "old-base commit");

    checkout_branch(&repo, "main");
    create_branch_from_head(&repo, "new-base");
    checkout_branch(&repo, "new-base");
    write_file(&repo_path, "base.txt", "from new-base\n");
    commit_all(&repo, "new-base commit");

    checkout_branch(&repo, "old-base");
    create_branch_from_head(&repo, "feature");

    let svc = GitService::new();
    svc.add_worktree(&repo_path, &worktree_path, "feature", false)
        .expect("create worktree");

    write_file(&worktree_path, "feat.txt", "feat change\n");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    commit_all(&wt_repo, "feature commit");

    (repo_path, worktree_path)
}

// Conflicting setup to simulate interactive rebase interruption
fn setup_conflict_repo_with_worktree(root: &TempDir) -> (PathBuf, PathBuf) {
    let repo_path = root.path().join("repo");
    let worktree_path = root.path().join("wt-feature");

    let service = GitService::new();
    service
        .initialize_repo_with_main_branch(&repo_path)
        .expect("init repo");

    let repo = Repository::open(&repo_path).unwrap();
    configure_user(&repo);
    checkout_branch(&repo, "main");

    write_file(&repo_path, "conflict.txt", "base\n");
    commit_all(&repo, "initial main commit");

    // old-base modifies conflict.txt one way
    create_branch_from_head(&repo, "old-base");
    checkout_branch(&repo, "old-base");
    write_file(&repo_path, "conflict.txt", "old-base version\n");
    commit_all(&repo, "old-base change");

    // feature builds on old-base and modifies same lines differently
    create_branch_from_head(&repo, "feature");

    // new-base modifies in a conflicting way
    checkout_branch(&repo, "main");
    create_branch_from_head(&repo, "new-base");
    checkout_branch(&repo, "new-base");
    write_file(&repo_path, "conflict.txt", "new-base version\n");
    commit_all(&repo, "new-base change");

    // add a worktree for feature and create the conflicting commit
    let svc = GitService::new();
    svc.add_worktree(&repo_path, &worktree_path, "feature", false)
        .expect("create worktree");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    write_file(&worktree_path, "conflict.txt", "feature version\n");
    commit_all(&wt_repo, "feature conflicting change");

    (repo_path, worktree_path)
}

// Setup where feature has no unique commits (feature == old-base)
fn setup_no_unique_feature_repo(root: &TempDir) -> (PathBuf, PathBuf) {
    let repo_path = root.path().join("repo");
    let worktree_path = root.path().join("wt-feature");

    let service = GitService::new();
    service
        .initialize_repo_with_main_branch(&repo_path)
        .expect("init repo");

    let repo = Repository::open(&repo_path).unwrap();
    configure_user(&repo);
    checkout_branch(&repo, "main");

    write_file(&repo_path, "base.txt", "main base\n");
    commit_all(&repo, "initial main commit");

    // Create old-base at this point
    create_branch_from_head(&repo, "old-base");
    // Create new-base diverging
    checkout_branch(&repo, "main");
    create_branch_from_head(&repo, "new-base");
    checkout_branch(&repo, "new-base");
    write_file(&repo_path, "advance.txt", "new base\n");
    commit_all(&repo, "advance new-base");

    // Create feature equal to old-base (no unique commits)
    checkout_branch(&repo, "old-base");
    create_branch_from_head(&repo, "feature");
    let svc = GitService::new();
    svc.add_worktree(&repo_path, &worktree_path, "feature", false)
        .expect("create worktree");

    (repo_path, worktree_path)
}

// Simple two-way conflict between main and feature on the same file
fn setup_direct_conflict_repo(root: &TempDir) -> (PathBuf, PathBuf) {
    let repo_path = root.path().join("repo");
    let worktree_path = root.path().join("wt-feature");

    let service = GitService::new();
    service
        .initialize_repo_with_main_branch(&repo_path)
        .expect("init repo");

    let repo = Repository::open(&repo_path).unwrap();
    configure_user(&repo);
    checkout_branch(&repo, "main");

    write_file(&repo_path, "conflict.txt", "base\n");
    commit_all(&repo, "initial main commit");

    // Create feature and commit conflicting change
    create_branch_from_head(&repo, "feature");
    let svc = GitService::new();
    svc.add_worktree(&repo_path, &worktree_path, "feature", false)
        .expect("create worktree");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    write_file(&worktree_path, "conflict.txt", "feature change\n");
    commit_all(&wt_repo, "feature change");

    // Change main in a conflicting way
    checkout_branch(&repo, "main");
    write_file(&repo_path, "conflict.txt", "main change\n");
    commit_all(&repo, "main change");

    (repo_path, worktree_path)
}

#[test]
fn rebase_preserves_untracked_files() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);

    write_file(&worktree_path, "scratch/untracked.txt", "temporary note\n");

    let service = GitService::new();
    let res = service.rebase_branch(
        &repo_path,
        &worktree_path,
        Some("new-base"),
        "old-base",
        None,
    );
    assert!(res.is_ok(), "rebase should succeed: {res:?}");

    let scratch = worktree_path.join("scratch/untracked.txt");
    let content = fs::read_to_string(&scratch).expect("untracked file exists");
    assert_eq!(content, "temporary note\n");
}

#[test]
fn rebase_aborts_on_uncommitted_tracked_changes() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);

    write_file(&worktree_path, "feat.txt", "feat change (edited)\n");

    let service = GitService::new();
    let res = service.rebase_branch(
        &repo_path,
        &worktree_path,
        Some("new-base"),
        "old-base",
        None,
    );
    assert!(res.is_err(), "rebase should fail on dirty worktree");

    let edited = fs::read_to_string(worktree_path.join("feat.txt")).unwrap();
    assert_eq!(edited, "feat change (edited)\n");
}

#[test]
fn rebase_aborts_if_untracked_would_be_overwritten_by_base() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);

    write_file(&worktree_path, "base.txt", "my scratch note\n");

    let service = GitService::new();
    let res = service.rebase_branch(
        &repo_path,
        &worktree_path,
        Some("new-base"),
        "old-base",
        None,
    );
    assert!(
        res.is_err(),
        "rebase should fail due to untracked overwrite risk"
    );

    let content = std::fs::read_to_string(worktree_path.join("base.txt")).unwrap();
    assert_eq!(content, "my scratch note\n");
}

#[test]
fn merge_does_not_overwrite_main_repo_untracked_files() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);

    write_file(&worktree_path, "danger.txt", "tracked from feature\n");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    commit_all(&wt_repo, "add danger.txt in feature");

    write_file(&repo_path, "danger.txt", "my untracked data\n");
    let main_repo = Repository::open(&repo_path).unwrap();
    checkout_branch(&main_repo, "main");

    let service = GitService::new();
    let res = service.merge_changes(
        &repo_path,
        &worktree_path,
        "feature",
        "main",
        "squash merge",
    );
    assert!(
        res.is_err(),
        "merge should refuse due to untracked conflict"
    );

    // Untracked file remains untouched
    let content = std::fs::read_to_string(repo_path.join("danger.txt")).unwrap();
    assert_eq!(content, "my untracked data\n");
}

#[test]
fn merge_does_not_touch_tracked_uncommitted_changes_in_base_worktree() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);

    // Prepare: modify a tracked file in the base worktree (main) without committing
    let _main_repo = Repository::open(&repo_path).unwrap();
    // Base branch commits will be advanced by the merge operation; record before via service
    let g = GitService::new();
    let before_oid = g.get_branch_oid(&repo_path, "main").unwrap();

    // Create a tracked file that will also be added by feature branch to simulate overlap
    write_file(&repo_path, "danger2.txt", "my staged change\n");
    {
        // stage and then unstage to leave WT_MODIFIED? Simpler: just modify an existing tracked file
        // Use common.txt which is tracked
        write_file(&repo_path, "common.txt", "edited locally\n");
    }

    // Feature adds a change and is committed in worktree
    write_file(&worktree_path, "danger2.txt", "feature tracked\n");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    commit_all(&wt_repo, "feature adds danger2.txt");

    // Merge via service (squash into main) should not modify files in the main worktree
    let service = GitService::new();
    let res = service.merge_changes(
        &repo_path,
        &worktree_path,
        "feature",
        "main",
        "squash merge",
    );
    assert!(
        res.is_ok(),
        "merge should succeed without touching worktree"
    );

    // Confirm the local edit to tracked file remains
    let content = std::fs::read_to_string(repo_path.join("common.txt")).unwrap();
    assert_eq!(content, "edited locally\n");

    // Confirm the main branch ref advanced
    let after_oid = g.get_branch_oid(&repo_path, "main").unwrap();
    assert_ne!(before_oid, after_oid, "main ref should be updated by merge");
}

#[test]
fn merge_refuses_with_staged_changes_on_base() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);
    let s = GitService::new();
    // ensure main is checked out
    s.checkout_branch(&repo_path, "main").unwrap();
    // feature adds change and commits
    write_file(&worktree_path, "m.txt", "feature\n");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    commit_all(&wt_repo, "feat change");
    // main has staged change
    write_file(&repo_path, "staged.txt", "staged\n");
    s.add_path(&repo_path, "staged.txt").unwrap();
    let res = s.merge_changes(&repo_path, &worktree_path, "feature", "main", "squash");
    assert!(res.is_err(), "should refuse merge due to staged changes");
    // staged file remains
    let content = std::fs::read_to_string(repo_path.join("staged.txt")).unwrap();
    assert_eq!(content, "staged\n");
}

#[test]
fn merge_preserves_unstaged_changes_on_base() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);
    let s = GitService::new();
    s.checkout_branch(&repo_path, "main").unwrap();
    // baseline local tracked file and commit
    write_file(&repo_path, "local.txt", "base\n");
    let repo = Repository::open(&repo_path).unwrap();
    commit_all(&repo, "add local");
    // modify unstaged
    write_file(&repo_path, "local.txt", "local edited\n");
    // feature modifies a different file
    write_file(&worktree_path, "merged.txt", "merged content\n");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    commit_all(&wt_repo, "feature merged");
    let _sha = s
        .merge_changes(&repo_path, &worktree_path, "feature", "main", "squash")
        .unwrap();
    // local edit preserved
    let loc = std::fs::read_to_string(repo_path.join("local.txt")).unwrap();
    assert_eq!(loc, "local edited\n");
    // merged file updated
    let m = std::fs::read_to_string(repo_path.join("merged.txt")).unwrap();
    assert_eq!(m, "merged content\n");
}

#[test]
fn update_ref_does_not_destroy_feature_worktree_dirty_state() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);
    let s = GitService::new();
    // ensure main is checked out
    s.checkout_branch(&repo_path, "main").unwrap();
    // feature makes an initial change and commits
    write_file(&worktree_path, "f.txt", "feat\n");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    commit_all(&wt_repo, "feat commit");
    // dirty change in feature worktree (uncommitted)
    write_file(&worktree_path, "dirty.txt", "unstaged\n");
    // merge from feature into main (CLI path updates task ref via update-ref)
    let sha = s
        .merge_changes(&repo_path, &worktree_path, "feature", "main", "squash")
        .unwrap();
    // uncommitted change in feature worktree preserved
    let dirty = std::fs::read_to_string(worktree_path.join("dirty.txt")).unwrap();
    assert_eq!(dirty, "unstaged\n");
    // feature branch ref updated to the squash commit in main repo
    let feature_oid = s.get_branch_oid(&repo_path, "feature").unwrap();
    assert_eq!(feature_oid, sha);
    // and the feature worktree HEAD now points to that commit
    let head = s.get_head_info(&worktree_path).unwrap();
    assert_eq!(head.branch, "feature");
    assert_eq!(head.oid, sha);
}

#[test]
fn libgit2_merge_updates_base_ref_in_both_repos() {
    // Ensure we hit the libgit2 path by NOT checking out the base branch in main repo
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);
    let s = GitService::new();

    // Record current main OID from both main repo and worktree repo; they should match pre-merge
    let before_main_repo = s.get_branch_oid(&repo_path, "main").unwrap();
    let before_main_wt = s.get_branch_oid(&worktree_path, "main").unwrap();
    assert_eq!(before_main_repo, before_main_wt);

    // Perform merge (squash) while main repo is NOT on base branch (libgit2 path)
    let sha = s
        .merge_changes(&repo_path, &worktree_path, "feature", "main", "squash")
        .expect("merge should succeed via libgit2 path");

    // Base branch ref advanced in both main and worktree repositories
    let after_main_repo = s.get_branch_oid(&repo_path, "main").unwrap();
    let after_main_wt = s.get_branch_oid(&worktree_path, "main").unwrap();
    assert_eq!(after_main_repo, sha);
    assert_eq!(after_main_wt, sha);
}

#[test]
fn libgit2_merge_updates_task_ref_and_feature_head_preserves_dirty() {
    // Hit libgit2 path (main repo not on base) and verify task ref + HEAD update safely
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);
    let s = GitService::new();

    // Make an uncommitted change in the feature worktree to ensure it's preserved
    write_file(&worktree_path, "dirty2.txt", "keep me\n");

    // Perform merge (squash) from feature into main; this path uses libgit2
    let sha = s
        .merge_changes(&repo_path, &worktree_path, "feature", "main", "squash")
        .expect("merge should succeed via libgit2 path");

    // Dirty file preserved in worktree
    let dirty = std::fs::read_to_string(worktree_path.join("dirty2.txt")).unwrap();
    assert_eq!(dirty, "keep me\n");

    // Task branch (feature) updated to squash commit in both repos
    let feat_main_repo = s.get_branch_oid(&repo_path, "feature").unwrap();
    let feat_worktree = s.get_branch_oid(&worktree_path, "feature").unwrap();
    assert_eq!(feat_main_repo, sha);
    assert_eq!(feat_worktree, sha);

    // Feature worktree HEAD points to the new squash commit
    let head = s.get_head_info(&worktree_path).unwrap();
    assert_eq!(head.branch, "feature");
    assert_eq!(head.oid, sha);
}

#[test]
fn rebase_refuses_to_abort_existing_rebase() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_conflict_repo_with_worktree(&td);

    // Start a rebase via GitService that will pause/conflict
    let svc = GitService::new();
    let _ = svc
        .rebase_branch(
            &repo_path,
            &worktree_path,
            Some("new-base"),
            "old-base",
            None,
        )
        .err()
        .expect("first rebase should error and leave in-progress state");

    // Our service should refuse to proceed and not abort the user's rebase
    let service = GitService::new();
    let res = service.rebase_branch(
        &repo_path,
        &worktree_path,
        Some("new-base"),
        "old-base",
        None,
    );
    assert!(res.is_err(), "should error because rebase is in progress");
    // Note: We do not auto-abort; user should resolve or abort explicitly
}

#[test]
fn rebase_fast_forwards_when_no_unique_commits() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_no_unique_feature_repo(&td);
    let g = GitService::new();
    let before = g.get_head_info(&worktree_path).unwrap().oid;
    let new_base_oid = g.get_branch_oid(&repo_path, "new-base").unwrap();

    let _res = g
        .rebase_branch(
            &repo_path,
            &worktree_path,
            Some("new-base"),
            "old-base",
            None,
        )
        .expect("rebase should succeed");
    let after_oid = g.get_head_info(&worktree_path).unwrap().oid;
    assert_ne!(before, after_oid, "HEAD should move after rebase");
    assert_eq!(after_oid, new_base_oid, "fast-forward onto new-base");
}

#[test]
fn rebase_applies_multiple_commits_onto_ahead_base() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);
    let repo = Repository::open(&repo_path).unwrap();
    // Advance new-base further
    checkout_branch(&repo, "new-base");
    write_file(&repo_path, "base_more.txt", "nb more\n");
    commit_all(&repo, "advance new-base more");

    // Add another commit to feature
    write_file(&worktree_path, "feat2.txt", "second change\n");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    commit_all(&wt_repo, "feature second commit");

    // Rebase feature onto new-base
    let service = GitService::new();
    let _ = service
        .rebase_branch(
            &repo_path,
            &worktree_path,
            Some("new-base"),
            "old-base",
            None,
        )
        .expect("rebase should succeed");

    // Verify both files exist with expected content in the rebased worktree
    let feat = std::fs::read_to_string(worktree_path.join("feat.txt")).unwrap();
    let feat2 = std::fs::read_to_string(worktree_path.join("feat2.txt")).unwrap();
    assert_eq!(feat, "feat change\n");
    assert_eq!(feat2, "second change\n");
}

#[test]
fn merge_when_base_ahead_and_feature_ahead_succeeds() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);
    let repo = Repository::open(&repo_path).unwrap();
    // Advance base (main) after feature was created
    checkout_branch(&repo, "main");
    write_file(&repo_path, "base_ahead.txt", "base ahead\n");
    commit_all(&repo, "base ahead commit");

    // Feature adds its own file (already has feat.txt from setup) and commit another
    write_file(&worktree_path, "another.txt", "feature ahead\n");
    let wt_repo = Repository::open(&worktree_path).unwrap();
    commit_all(&wt_repo, "feature ahead extra");

    let g = GitService::new();
    let before_main = g.get_branch_oid(&repo_path, "main").unwrap();
    // Merge (squash) into main
    let service = GitService::new();
    let merge_sha = service
        .merge_changes(
            &repo_path,
            &worktree_path,
            "feature",
            "main",
            "squash merge",
        )
        .expect("merge should succeed");

    let after_main = g.get_branch_oid(&repo_path, "main").unwrap();
    assert_ne!(before_main, after_main, "main should advance");
    assert_eq!(after_main, merge_sha);

    // Verify squash commit introduced feature files via commit diff
    let diffs = g
        .get_diffs(
            DiffTarget::Commit {
                repo_path: Path::new(&repo_path),
                commit_sha: &after_main,
            },
            None,
        )
        .unwrap();
    let has_feat = diffs.iter().any(|d| {
        d.new_path.as_deref() == Some("feat.txt")
            && d.new_content.as_deref() == Some("feat change\n")
    });
    let has_another = diffs.iter().any(|d| {
        d.new_path.as_deref() == Some("another.txt")
            && d.new_content.as_deref() == Some("feature ahead\n")
    });
    assert!(has_feat && has_another);
}

#[test]
fn merge_conflict_does_not_move_base_ref() {
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_direct_conflict_repo(&td);

    // Record main ref before
    let _repo = Repository::open(&repo_path).unwrap();
    let g = GitService::new();
    let before = g.get_branch_oid(&repo_path, "main").unwrap();

    let service = GitService::new();
    let res = service.merge_changes(
        &repo_path,
        &worktree_path,
        "feature",
        "main",
        "squash merge",
    );

    assert!(res.is_err(), "conflicting merge should fail");

    let after = g.get_branch_oid(&repo_path, "main").unwrap();
    assert_eq!(before, after, "main ref must remain unchanged on conflict");
}

#[test]
fn merge_delete_vs_modify_conflict_behaves_safely() {
    // main modifies file, feature deletes it -> conflict
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);
    let repo = Repository::open(&repo_path).unwrap();

    // start from main with a file
    checkout_branch(&repo, "main");
    write_file(&repo_path, "conflict_dm.txt", "base\n");
    commit_all(&repo, "add conflict file");
    let g = GitService::new();
    let before = g.get_branch_oid(&repo_path, "main").unwrap();

    // feature deletes it and commits
    let wt_repo = Repository::open(&worktree_path).unwrap();
    let path = worktree_path.join("conflict_dm.txt");
    if path.exists() {
        std::fs::remove_file(&path).unwrap();
    }
    commit_all(&wt_repo, "delete in feature");

    // main modifies same file
    write_file(&repo_path, "conflict_dm.txt", "main modify\n");
    commit_all(&repo, "modify in main");

    let service = GitService::new();
    let res = service.merge_changes(
        &repo_path,
        &worktree_path,
        "feature",
        "main",
        "squash merge",
    );
    match res {
        Err(_) => {
            // On failure, ensure base ref unchanged
            let after = g.get_branch_oid(&repo_path, "main").unwrap();
            assert_eq!(before, after, "main ref must remain unchanged on failure");
        }
        Ok(merge_sha) => {
            // On success, verify the resulting commit exists and the working tree was not touched
            let after_oid = g.get_branch_oid(&repo_path, "main").unwrap();
            assert_eq!(after_oid, merge_sha);
            // File either preserved (modify wins) or deleted (delete wins); both are acceptable, but no crash
            let path = repo_path.join("conflict_dm.txt");
            if path.exists() {
                let content = std::fs::read_to_string(&path).unwrap();
                assert_eq!(content, "main modify\n");
            }
        }
    }
}

#[test]
fn rebase_preserves_rename_changes() {
    // feature renames a file; rebase onto new-base preserves rename
    let td = TempDir::new().unwrap();
    let (repo_path, worktree_path) = setup_repo_with_worktree(&td);

    // feature: rename feat.txt -> feat_renamed.txt
    std::fs::rename(
        worktree_path.join("feat.txt"),
        worktree_path.join("feat_renamed.txt"),
    )
    .unwrap();
    let wt_repo = Repository::open(&worktree_path).unwrap();
    commit_all(&wt_repo, "rename feat");

    // rebase onto new-base
    let service = GitService::new();
    let _ = service
        .rebase_branch(
            &repo_path,
            &worktree_path,
            Some("new-base"),
            "old-base",
            None,
        )
        .expect("rebase should succeed");

    // after rebase, renamed file present; original absent
    assert!(worktree_path.join("feat_renamed.txt").exists());
    assert!(!worktree_path.join("feat.txt").exists());
}

#[test]
fn merge_refreshes_main_worktree_when_on_base() {
    let td = TempDir::new().unwrap();
    // Initialize repo and ensure main is checked out
    let repo_path = td.path().join("repo_refresh");
    let s = GitService::new();
    s.initialize_repo_with_main_branch(&repo_path).unwrap();
    s.configure_user(&repo_path, "Test User", "test@example.com")
        .unwrap();
    s.checkout_branch(&repo_path, "main").unwrap();
    // Baseline file
    write_file(&repo_path, "file.txt", "base\n");
    let _ = s.commit(&repo_path, "add base").unwrap();

    // Create feature branch and worktree
    s.create_branch(&repo_path, "feature").unwrap();
    let wt = td.path().join("wt_refresh");
    s.add_worktree(&repo_path, &wt, "feature", false).unwrap();
    // Modify file in worktree and commit
    write_file(&wt, "file.txt", "feature change\n");
    let _ = s.commit(&wt, "feature change").unwrap();

    // Merge into main (squash) and ensure main worktree is updated since it is on base
    let merge_sha = s
        .merge_changes(&repo_path, &wt, "feature", "main", "squash")
        .unwrap();
    // Since main is on base branch and we use safe CLI merge, both working tree
    // and ref should reflect the merged content.
    let content = std::fs::read_to_string(repo_path.join("file.txt")).unwrap();
    assert_eq!(content, "feature change\n");
    let oid = s.get_branch_oid(&repo_path, "main").unwrap();
    assert_eq!(oid, merge_sha);
}

#[test]
fn sparse_checkout_respected_in_worktree_diffs_and_commit() {
    let td = TempDir::new().unwrap();
    let repo_path = td.path().join("repo_sparse");
    let s = GitService::new();
    s.initialize_repo_with_main_branch(&repo_path).unwrap();
    s.configure_user(&repo_path, "Test User", "test@example.com")
        .unwrap();
    s.checkout_branch(&repo_path, "main").unwrap();
    // baseline content
    write_file(&repo_path, "included/a.txt", "A\n");
    write_file(&repo_path, "excluded/b.txt", "B\n");
    let _ = s.commit(&repo_path, "baseline").unwrap();

    // enable sparse-checkout for 'included' only
    let cli = GitCli::new();
    cli.git(&repo_path, ["sparse-checkout", "init", "--cone"])
        .unwrap();
    cli.git(&repo_path, ["sparse-checkout", "set", "included"])
        .unwrap();

    // create feature branch and worktree
    s.create_branch(&repo_path, "feature").unwrap();
    let wt = td.path().join("wt_sparse");
    s.add_worktree(&repo_path, &wt, "feature", false).unwrap();

    // materialization check: included exists, excluded does not
    assert!(wt.join("included/a.txt").exists());
    assert!(!wt.join("excluded/b.txt").exists());

    // modify included file
    write_file(&wt, "included/a.txt", "A-mod\n");
    // get worktree diffs vs main, ensure excluded/b.txt is NOT reported deleted
    let diffs = s
        .get_diffs(
            DiffTarget::Worktree {
                worktree_path: Path::new(&wt),
                branch_name: "feature",
                base_branch: "main",
            },
            None,
        )
        .unwrap();
    assert!(
        diffs
            .iter()
            .any(|d| d.new_path.as_deref() == Some("included/a.txt"))
    );
    assert!(
        !diffs
            .iter()
            .any(|d| d.old_path.as_deref() == Some("excluded/b.txt")
                || d.new_path.as_deref() == Some("excluded/b.txt"))
    );

    // commit and verify commit diffs also only include included/ changes
    let _ = s.commit(&wt, "modify included").unwrap();
    let head_sha = s.get_head_info(&wt).unwrap().oid;
    let commit_diffs = s
        .get_diffs(
            DiffTarget::Commit {
                repo_path: Path::new(&wt),
                commit_sha: &head_sha,
            },
            None,
        )
        .unwrap();
    assert!(
        commit_diffs
            .iter()
            .any(|d| d.new_path.as_deref() == Some("included/a.txt"))
    );
    assert!(
        commit_diffs
            .iter()
            .all(|d| d.new_path.as_deref() != Some("excluded/b.txt")
                && d.old_path.as_deref() != Some("excluded/b.txt"))
    );
}

// Helper: initialize a repo with main, configure user via service
fn init_repo_only_service(root: &TempDir) -> PathBuf {
    let repo_path = root.path().join("repo_svc");
    let s = GitService::new();
    s.initialize_repo_with_main_branch(&repo_path).unwrap();
    s.configure_user(&repo_path, "Test User", "test@example.com")
        .unwrap();
    s.checkout_branch(&repo_path, "main").unwrap();
    repo_path
}

#[test]
fn merge_binary_conflict_does_not_move_ref() {
    let td = TempDir::new().unwrap();
    let repo_path = init_repo_only_service(&td);
    let s = GitService::new();
    // seed
    let _ = s.commit(&repo_path, "seed").unwrap();
    // create feature branch and worktree
    s.create_branch(&repo_path, "feature").unwrap();
    let worktree_path = td.path().join("wt_bin");
    s.add_worktree(&repo_path, &worktree_path, "feature", false)
        .unwrap();

    // feature adds/commits binary file
    let mut f = fs::File::create(worktree_path.join("bin.dat")).unwrap();
    f.write_all(&[0, 1, 2, 3]).unwrap();
    let _ = s.commit(&worktree_path, "feature bin").unwrap();

    // main adds conflicting binary content
    let mut f2 = fs::File::create(repo_path.join("bin.dat")).unwrap();
    f2.write_all(&[9, 8, 7, 6]).unwrap();
    let _ = s.commit(&repo_path, "main bin").unwrap();

    let before = s.get_branch_oid(&repo_path, "main").unwrap();
    let res = s.merge_changes(&repo_path, &worktree_path, "feature", "main", "merge bin");
    assert!(res.is_err(), "binary conflict should fail");
    let after = s.get_branch_oid(&repo_path, "main").unwrap();
    assert_eq!(before, after, "main ref unchanged on conflict");
}

#[test]
fn merge_rename_vs_modify_conflict_does_not_move_ref() {
    let td = TempDir::new().unwrap();
    let repo_path = init_repo_only_service(&td);
    let s = GitService::new();
    // base file
    fs::write(repo_path.join("conflict.txt"), b"base\n").unwrap();
    let _ = s.commit(&repo_path, "base").unwrap();
    s.create_branch(&repo_path, "feature").unwrap();
    let worktree_path = td.path().join("wt_ren");
    s.add_worktree(&repo_path, &worktree_path, "feature", false)
        .unwrap();

    // feature renames file
    std::fs::rename(
        worktree_path.join("conflict.txt"),
        worktree_path.join("conflict_renamed.txt"),
    )
    .unwrap();
    let _ = s.commit(&worktree_path, "rename").unwrap();

    // main modifies original path
    fs::write(repo_path.join("conflict.txt"), b"main change\n").unwrap();
    let _ = s.commit(&repo_path, "modify main").unwrap();

    let before = s.get_branch_oid(&repo_path, "main").unwrap();
    let res = s.merge_changes(
        &repo_path,
        &worktree_path,
        "feature",
        "main",
        "merge rename",
    );
    match res {
        Err(_) => {
            let after = s.get_branch_oid(&repo_path, "main").unwrap();
            assert_eq!(before, after, "main unchanged on conflict");
        }
        Ok(sha) => {
            // ensure main advanced and result contains either renamed or modified content
            let after = s.get_branch_oid(&repo_path, "main").unwrap();
            assert_eq!(after, sha);
            let diffs = s
                .get_diffs(
                    DiffTarget::Commit {
                        repo_path: Path::new(&repo_path),
                        commit_sha: &after,
                    },
                    None,
                )
                .unwrap();
            let has_renamed = diffs
                .iter()
                .any(|d| d.new_path.as_deref() == Some("conflict_renamed.txt"));
            let has_modified = diffs.iter().any(|d| {
                d.new_path.as_deref() == Some("conflict.txt")
                    && d.new_content.as_deref() == Some("main change\n")
            });
            assert!(has_renamed || has_modified);
        }
    }
}
