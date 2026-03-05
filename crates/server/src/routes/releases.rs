use std::{
    sync::OnceLock,
    time::{Duration, Instant},
};

use axum::{Router, response::Json as ResponseJson, routing::get};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::DeploymentImpl;

const CACHE_TTL: Duration = Duration::from_secs(15 * 60);
const GITHUB_API_URL: &str = "https://api.github.com/repos/BloopAI/vibe-kanban/releases";

type ReleasesCache = RwLock<Option<(Vec<GitHubRelease>, Instant)>>;

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();
static RELEASES_CACHE: OnceLock<ReleasesCache> = OnceLock::new();

fn client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .user_agent("vibe-kanban-server")
            .build()
            .expect("failed to build releases HTTP client")
    })
}

fn cache() -> &'static RwLock<Option<(Vec<GitHubRelease>, Instant)>> {
    RELEASES_CACHE.get_or_init(|| RwLock::new(None))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/releases", get(get_releases))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubRelease {
    pub name: String,
    pub tag_name: String,
    pub published_at: String,
    pub body: String,
}

#[derive(Debug, Serialize)]
struct ReleasesResponse {
    releases: Vec<GitHubRelease>,
}

#[derive(Deserialize)]
struct GitHubReleaseRaw {
    tag_name: String,
    name: Option<String>,
    published_at: Option<String>,
    body: Option<String>,
    prerelease: bool,
}

async fn get_releases() -> ResponseJson<utils::response::ApiResponse<ReleasesResponse>> {
    // Check cache
    {
        let guard = cache().read().await;
        if let Some((releases, fetched_at)) = guard.as_ref()
            && fetched_at.elapsed() < CACHE_TTL
        {
            return ResponseJson(utils::response::ApiResponse::success(ReleasesResponse {
                releases: releases.clone(),
            }));
        }
    }

    // Fetch from GitHub
    match fetch_releases().await {
        Ok(releases) => {
            // Update cache
            {
                let mut guard = cache().write().await;
                *guard = Some((releases.clone(), Instant::now()));
            }
            ResponseJson(utils::response::ApiResponse::success(ReleasesResponse {
                releases,
            }))
        }
        Err(e) => {
            tracing::warn!("Failed to fetch GitHub releases: {}", e);
            // Return stale cache if available
            let guard = cache().read().await;
            if let Some((releases, _)) = guard.as_ref() {
                return ResponseJson(utils::response::ApiResponse::success(ReleasesResponse {
                    releases: releases.clone(),
                }));
            }
            drop(guard);
            ResponseJson(utils::response::ApiResponse::error(&format!(
                "Failed to fetch releases: {}",
                e
            )))
        }
    }
}

async fn fetch_releases() -> Result<Vec<GitHubRelease>, reqwest::Error> {
    let response = client()
        .get(GITHUB_API_URL)
        .query(&[("per_page", "20")])
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?;

    let all_releases: Vec<GitHubReleaseRaw> = response.json().await?;

    Ok(all_releases
        .into_iter()
        .filter(|r| {
            !r.prerelease && !r.tag_name.starts_with("remote-") && !r.tag_name.starts_with("relay-")
        })
        .map(|r| GitHubRelease {
            name: r.name.unwrap_or_else(|| r.tag_name.clone()),
            tag_name: r.tag_name,
            published_at: r.published_at.unwrap_or_default(),
            body: r.body.unwrap_or_default(),
        })
        .collect())
}
