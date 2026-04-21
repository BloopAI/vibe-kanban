//! Thin wrapper over reqwest::Client for MCP → server HTTP calls.
//! Centralises envelope decoding for the handful of routes MCP consumes today.

use db::models::{task::Task, workspace::Workspace};
use reqwest::Client;
use utils::response::ApiResponse;
use uuid::Uuid;

#[derive(thiserror::Error, Debug)]
pub enum ApiClientError {
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error("server error: {0}")]
    Server(String),
    #[error("invalid response shape")]
    BadShape,
}

pub type ApiResult<T> = Result<T, ApiClientError>;

#[derive(Debug, Clone)]
pub struct ApiClient {
    client: Client,
    base_url: String,
}

impl ApiClient {
    pub fn new(client: Client, base_url: impl Into<String>) -> Self {
        Self {
            client,
            base_url: base_url.into(),
        }
    }

    pub async fn get_workspace(&self, id: Uuid) -> ApiResult<Workspace> {
        self.get_json(&format!("/api/workspaces/{id}")).await
    }

    pub async fn get_task(&self, id: Uuid) -> ApiResult<Task> {
        self.get_json(&format!("/api/tasks/{id}")).await
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, path: &str) -> ApiResult<T> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self.client.get(url).send().await?;
        let envelope: ApiResponse<T> = resp.json().await?;
        if !envelope.is_success() {
            return Err(ApiClientError::Server(
                envelope.message().unwrap_or("").to_string(),
            ));
        }
        envelope.into_data().ok_or(ApiClientError::BadShape)
    }
}

#[cfg(test)]
mod api_client_tests {
    use super::*;

    #[tokio::test]
    async fn get_workspace_decodes_envelope() {
        let server = httpmock::MockServer::start();
        let wid = uuid::Uuid::new_v4();
        server.mock(|when, then| {
            when.method(httpmock::Method::GET)
                .path(format!("/api/workspaces/{wid}"));
            then.status(200).json_body(serde_json::json!({
                "success": true,
                "data": {
                    "id": wid.to_string(),
                    "task_id": null,
                    "container_ref": null,
                    "branch": "main",
                    "setup_completed_at": null,
                    "created_at": "2025-01-01T00:00:00Z",
                    "updated_at": "2025-01-01T00:00:00Z",
                    "archived": false,
                    "pinned": false,
                    "name": null,
                    "worktree_deleted": false
                }
            }));
        });
        let client = ApiClient::new(reqwest::Client::new(), server.base_url());
        let ws = client.get_workspace(wid).await.unwrap();
        assert_eq!(ws.id, wid);
    }

    #[tokio::test]
    async fn get_task_decodes_envelope() {
        let server = httpmock::MockServer::start();
        let tid = uuid::Uuid::new_v4();
        let pid = uuid::Uuid::new_v4();
        server.mock(|when, then| {
            when.method(httpmock::Method::GET)
                .path(format!("/api/tasks/{tid}"));
            then.status(200).json_body(serde_json::json!({
                "success": true,
                "data": {
                    "id": tid.to_string(),
                    "project_id": pid.to_string(),
                    "title": "t",
                    "description": null,
                    "status": "todo",
                    "parent_workspace_id": null,
                    "created_at": "2025-01-01T00:00:00Z",
                    "updated_at": "2025-01-01T00:00:00Z"
                }
            }));
        });
        let client = ApiClient::new(reqwest::Client::new(), server.base_url());
        let task = client.get_task(tid).await.unwrap();
        assert_eq!(task.id, tid);
        assert_eq!(task.project_id, pid);
        assert_eq!(task.title, "t");
    }
}
