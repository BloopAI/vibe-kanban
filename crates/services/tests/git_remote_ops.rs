use std::{
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    time::Duration,
};

use git2::Repository;
use services::services::{
    git::GitService,
    git_cli::{GitCli, GitCliError},
};

fn workspace_root() -> PathBuf {
    // CARGO_MANIFEST_DIR for this crate is <workspace>/crates/services
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .and_then(Path::parent)
        .expect("workspace root")
        .to_path_buf()
}

fn repo_https_remote(repo_path: &Path) -> Option<String> {
    let repo = Repository::open(repo_path).ok()?;
    let remote = repo.find_remote("origin").ok()?;
    let url = remote.url()?;
    Some(GitService::new().convert_to_https_url(url))
}

fn assert_auth_failed(result: Result<(), GitCliError>) {
    match result {
        Err(GitCliError::AuthFailed(_)) => {}
        Err(other) => panic!("expected auth failure, got {other:?}"),
        Ok(_) => panic!("operation unexpectedly succeeded"),
    }
}

fn can_reach_github() -> bool {
    let addr = match ("github.com", 443).to_socket_addrs() {
        Ok(mut addrs) => addrs.next(),
        Err(_) => return false,
    };
    if let Some(addr) = addr {
        TcpStream::connect_timeout(&addr, Duration::from_secs(2)).is_ok()
    } else {
        false
    }
}

#[ignore]
#[test]
fn fetch_with_invalid_token_returns_auth_error() {
    let repo_path = workspace_root();
    let Some(remote_url) = repo_https_remote(&repo_path) else {
        eprintln!("Skipping fetch test: origin remote not configured");
        return;
    };

    if !can_reach_github() {
        eprintln!("Skipping fetch test: cannot reach github.com");
        return;
    }

    let cli = GitCli::new();
    let refspec = "+refs/heads/main:refs/remotes/origin/main";
    let result =
        cli.fetch_with_token_and_refspec(&repo_path, &remote_url, refspec, "invalid-token");
    assert_auth_failed(result);
}

#[ignore]
#[test]
fn push_with_invalid_token_returns_auth_error() {
    let repo_path = workspace_root();
    let Some(remote_url) = repo_https_remote(&repo_path) else {
        eprintln!("Skipping push test: origin remote not configured");
        return;
    };

    if !can_reach_github() {
        eprintln!("Skipping push test: cannot reach github.com");
        return;
    }

    let cli = GitCli::new();
    let result = cli.push_with_token(&repo_path, &remote_url, "main", "invalid-token");
    assert_auth_failed(result);
}
