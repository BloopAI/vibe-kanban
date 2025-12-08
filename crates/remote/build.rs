use std::process::Command;

fn main() {
    // Git commit (short hash)
    // First check for env var (set by Docker build), then try git command
    let commit = std::env::var("VK_GIT_COMMIT")
        .ok()
        .filter(|s| !s.is_empty() && s != "unknown")
        .or_else(|| {
            Command::new("git")
                .args(["rev-parse", "--short", "HEAD"])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        });

    if let Some(commit) = commit {
        println!("cargo:rustc-env=VK_GIT_COMMIT={}", commit);
    }

    // Git branch
    // First check for env var (set by Docker build), then try git command
    let branch = std::env::var("VK_GIT_BRANCH")
        .ok()
        .filter(|s| !s.is_empty() && s != "unknown")
        .or_else(|| {
            Command::new("git")
                .args(["rev-parse", "--abbrev-ref", "HEAD"])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        });

    if let Some(branch) = branch {
        println!("cargo:rustc-env=VK_GIT_BRANCH={}", branch);
    }

    // Build timestamp (ISO 8601 format)
    if let Ok(output) = Command::new("date").args(["-u", "+%Y-%m-%dT%H:%M:%SZ"]).output()
        && output.status.success()
    {
        let timestamp = String::from_utf8_lossy(&output.stdout).trim().to_string();
        println!("cargo:rustc-env=VK_BUILD_TIMESTAMP={}", timestamp);
    }
}
