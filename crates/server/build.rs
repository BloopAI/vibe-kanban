use std::{fs, path::Path, process::Command};

fn main() {
    dotenv::dotenv().ok();

    if let Ok(api_key) = std::env::var("POSTHOG_API_KEY") {
        println!("cargo:rustc-env=POSTHOG_API_KEY={}", api_key);
    }
    if let Ok(api_endpoint) = std::env::var("POSTHOG_API_ENDPOINT") {
        println!("cargo:rustc-env=POSTHOG_API_ENDPOINT={}", api_endpoint);
    }
    if let Ok(vk_shared_api_base) = std::env::var("VK_SHARED_API_BASE") {
        println!("cargo:rustc-env=VK_SHARED_API_BASE={}", vk_shared_api_base);
    }

    // Git commit (short hash)
    if let Ok(output) = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        && output.status.success()
    {
        let commit = String::from_utf8_lossy(&output.stdout).trim().to_string();
        println!("cargo:rustc-env=VK_GIT_COMMIT={}", commit);
    }

    // Git branch
    if let Ok(output) = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        && output.status.success()
    {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        println!("cargo:rustc-env=VK_GIT_BRANCH={}", branch);
    }

    // Build timestamp (ISO 8601 format)
    if let Ok(output) = Command::new("date")
        .args(["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .output()
        && output.status.success()
    {
        let timestamp = String::from_utf8_lossy(&output.stdout).trim().to_string();
        println!("cargo:rustc-env=VK_BUILD_TIMESTAMP={}", timestamp);
    }

    // Create frontend/dist directory if it doesn't exist
    let dist_path = Path::new("../../frontend/dist");
    if !dist_path.exists() {
        println!("cargo:warning=Creating dummy frontend/dist directory for compilation");
        fs::create_dir_all(dist_path).unwrap();

        // Create a dummy index.html
        let dummy_html = r#"<!DOCTYPE html>
<html><head><title>Build frontend first</title></head>
<body><h1>Please build the frontend</h1></body></html>"#;

        fs::write(dist_path.join("index.html"), dummy_html).unwrap();
    }
}
