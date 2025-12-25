use axum::{Router, response::Json, routing::get};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::DeploymentImpl;

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const NPM_PACKAGE_NAME: &str = "vibe-kanban";

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct VersionInfo {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
}

#[derive(Debug, Deserialize)]
struct NpmPackageInfo {
    version: String,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/version/check", get(check_version))
}

pub async fn check_version() -> Json<ApiResponse<VersionInfo>> {
    let current_version = CURRENT_VERSION.to_string();

    // TESTING: Uncomment the lines below to simulate an update available
    // let fake_latest = "0.0.999".to_string();
    // return Json(ApiResponse::success(VersionInfo {
    //     current_version,
    //     latest_version: Some(fake_latest.clone()),
    //     update_available: is_newer_version(&current_version, &fake_latest),
    // }));

    match fetch_latest_version().await {
        Ok(latest_version) => {
            let update_available = is_newer_version(&current_version, &latest_version);

            Json(ApiResponse::success(VersionInfo {
                current_version,
                latest_version: Some(latest_version),
                update_available,
            }))
        }
        Err(e) => {
            tracing::warn!("Failed to check for updates: {}", e);
            // Return current version with no update info if check fails
            Json(ApiResponse::success(VersionInfo {
                current_version,
                latest_version: None,
                update_available: false,
            }))
        }
    }
}

async fn fetch_latest_version() -> Result<String, reqwest::Error> {
    let url = format!("https://registry.npmjs.org/{}/latest", NPM_PACKAGE_NAME);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await?;

    let package_info: NpmPackageInfo = response.json().await?;
    Ok(package_info.version)
}

fn is_newer_version(current: &str, latest: &str) -> bool {
    // Simple version comparison - split by dots and compare each part
    let current_parts: Vec<u32> = current.split('.').filter_map(|s| s.parse().ok()).collect();

    let latest_parts: Vec<u32> = latest.split('.').filter_map(|s| s.parse().ok()).collect();

    for i in 0..std::cmp::max(current_parts.len(), latest_parts.len()) {
        let current_part = current_parts.get(i).copied().unwrap_or(0);
        let latest_part = latest_parts.get(i).copied().unwrap_or(0);

        if latest_part > current_part {
            return true;
        } else if latest_part < current_part {
            return false;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_newer_version() {
        assert!(is_newer_version("0.0.142", "0.0.143"));
        assert!(is_newer_version("0.0.142", "0.1.0"));
        assert!(is_newer_version("0.0.142", "1.0.0"));
        assert!(!is_newer_version("0.0.143", "0.0.142"));
        assert!(!is_newer_version("0.0.142", "0.0.142"));
        assert!(!is_newer_version("1.0.0", "0.99.99"));
    }
}
