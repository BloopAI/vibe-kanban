use axum::response::Json;
use serde::Serialize;
use utils::build_info::BUILD_INFO;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub git_commit: &'static str,
    pub git_branch: &'static str,
    pub build_timestamp: &'static str,
}

pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: BUILD_INFO.version,
        git_commit: BUILD_INFO.git_commit,
        git_branch: BUILD_INFO.git_branch,
        build_timestamp: BUILD_INFO.build_timestamp,
    })
}
