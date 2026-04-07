use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use reqwest::{Client, Method, StatusCode};
use serde::de::DeserializeOwned;
use tracing::warn;

use crate::{
    error::JiraError,
    types::{Issue, IssueTypeWithStatuses, Priority, SearchResult, TransitionsResponse},
};

/// Configuration for connecting to a Jira Cloud instance.
#[derive(Debug, Clone)]
pub struct JiraConfig {
    /// Base URL of the Jira instance, e.g. `https://your-domain.atlassian.net`.
    pub base_url: String,
    /// Email address of the authenticating user.
    pub email: String,
    /// Jira API token (generated at https://id.atlassian.com/manage-profile/security/api-tokens).
    pub api_token: String,
}

/// HTTP client for the Jira REST API v3.
#[derive(Debug, Clone)]
pub struct JiraClient {
    http: Client,
    config: JiraConfig,
}

impl JiraClient {
    /// Create a new client from the given configuration.
    pub fn new(config: JiraConfig) -> Result<Self, JiraError> {
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| JiraError::Transport(e.to_string()))?;

        Ok(Self { http, config })
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    /// Search for issues using JQL.
    ///
    /// `start_at` and `max_results` control pagination. Jira defaults
    /// `max_results` to 50 and caps it at 100.
    pub async fn search_issues(
        &self,
        jql: &str,
        start_at: u32,
        max_results: u32,
    ) -> Result<SearchResult, JiraError> {
        let query = [
            ("jql", jql.to_string()),
            ("startAt", start_at.to_string()),
            ("maxResults", max_results.to_string()),
        ];
        self.get_with_query("/rest/api/3/search", &query).await
    }

    /// Search for issues using JQL, automatically paginating through all
    /// results.
    pub async fn search_issues_all(&self, jql: &str) -> Result<Vec<Issue>, JiraError> {
        let page_size: u32 = 100;
        let mut start_at: u32 = 0;
        let mut all_issues = Vec::new();

        loop {
            let result = self.search_issues(jql, start_at, page_size).await?;
            let fetched = result.issues.len() as u32;
            all_issues.extend(result.issues);

            if start_at + fetched >= result.total {
                break;
            }
            start_at += fetched;
        }

        Ok(all_issues)
    }

    /// Fetch a single issue by key (e.g. `"PROJ-123"`), including all fields
    /// and comments.
    pub async fn get_issue(&self, key: &str) -> Result<Issue, JiraError> {
        let path = format!("/rest/api/3/issue/{key}");
        let query = [("fields", "*all".to_string())];
        self.get_with_query(&path, &query).await
    }

    /// List the available statuses for each issue type in a project.
    pub async fn get_statuses(
        &self,
        project_key: &str,
    ) -> Result<Vec<IssueTypeWithStatuses>, JiraError> {
        let path = format!("/rest/api/3/project/{project_key}/statuses");
        self.get(&path).await
    }

    /// List the transitions available for an issue.
    pub async fn get_transitions(&self, key: &str) -> Result<TransitionsResponse, JiraError> {
        let path = format!("/rest/api/3/issue/{key}/transitions");
        self.get(&path).await
    }

    /// Transition an issue to a new status.
    pub async fn transition_issue(&self, key: &str, transition_id: &str) -> Result<(), JiraError> {
        let path = format!("/rest/api/3/issue/{key}/transitions");
        let body = serde_json::json!({
            "transition": { "id": transition_id }
        });
        self.send_with_retry(Method::POST, &path, &[], Some(&body))
            .await?;
        Ok(())
    }

    /// List all priority levels configured in the instance.
    pub async fn get_priorities(&self) -> Result<Vec<Priority>, JiraError> {
        self.get("/rest/api/3/priority").await
    }

    // ---------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------

    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, JiraError> {
        let empty: [(&str, String); 0] = [];
        self.get_with_query(path, &empty).await
    }

    async fn get_with_query<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<T, JiraError> {
        let bytes = self
            .send_with_retry(Method::GET, path, query, None::<&()>)
            .await?;
        serde_json::from_slice(&bytes).map_err(|e| JiraError::Deserialize(e.to_string()))
    }

    /// Build, send, and retry a request. Returns the raw response bytes on
    /// success.
    async fn send_with_retry<B: serde::Serialize>(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<&B>,
    ) -> Result<Vec<u8>, JiraError> {
        let method_clone = method.clone();
        let path = path.to_string();

        (|| async {
            self.send_once(method_clone.clone(), &path, query, body)
                .await
        })
        .retry(
            ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &JiraError| e.should_retry())
        .notify(|err: &JiraError, dur: Duration| {
            warn!(
                "Jira API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn send_once<B: serde::Serialize>(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<&B>,
    ) -> Result<Vec<u8>, JiraError> {
        let url = format!("{}{}", self.config.base_url.trim_end_matches('/'), path);

        let mut req = self
            .http
            .request(method, &url)
            .basic_auth(&self.config.email, Some(&self.config.api_token))
            .header("Accept", "application/json");

        if !query.is_empty() {
            req = req.query(query);
        }

        if let Some(b) = body {
            req = req.header("Content-Type", "application/json").json(b);
        }

        let response = req.send().await?;
        let status = response.status();

        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(JiraError::Auth);
        }

        if status == StatusCode::NOT_FOUND {
            return Err(JiraError::NotFound(url));
        }

        if status == StatusCode::TOO_MANY_REQUESTS {
            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .map(Duration::from_secs);
            return Err(JiraError::RateLimited { retry_after });
        }

        // For 204 No Content (e.g. transition_issue), return empty bytes.
        if status == StatusCode::NO_CONTENT {
            return Ok(Vec::new());
        }

        if !status.is_success() {
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "<failed to read body>".into());
            return Err(JiraError::Http {
                status: status.as_u16(),
                body,
            });
        }

        let bytes = response.bytes().await.map_err(JiraError::from)?;
        Ok(bytes.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_builds_client() {
        let config = JiraConfig {
            base_url: "https://example.atlassian.net".into(),
            email: "user@example.com".into(),
            api_token: "token".into(),
        };
        let client = JiraClient::new(config);
        assert!(client.is_ok());
    }
}
