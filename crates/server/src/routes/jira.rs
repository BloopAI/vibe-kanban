use axum::{
    Router,
    extract::State,
    response::Json as ResponseJson,
    routing::{get, post},
};
use deployment::Deployment;
use services::services::jira::{JiraError, JiraIssuesResponse, JiraService};
use utils::response::ApiResponse;

use crate::DeploymentImpl;

/// Error response type for Jira API
#[derive(Debug, serde::Serialize)]
struct JiraErrorInfo {
    code: &'static str,
    details: String,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/jira/my-issues", get(fetch_my_jira_issues))
        .route("/jira/refresh", post(refresh_jira_issues))
}

/// Fetch Jira issues (uses 5-minute cache)
#[axum::debug_handler]
async fn fetch_my_jira_issues(
    State(deployment): State<DeploymentImpl>,
) -> ResponseJson<ApiResponse<JiraIssuesResponse, JiraErrorInfo>> {
    handle_jira_result(JiraService::fetch_my_issues(&deployment.db().pool).await)
}

/// Force refresh Jira issues (bypasses cache)
#[axum::debug_handler]
async fn refresh_jira_issues(
    State(deployment): State<DeploymentImpl>,
) -> ResponseJson<ApiResponse<JiraIssuesResponse, JiraErrorInfo>> {
    handle_jira_result(JiraService::refresh_my_issues(&deployment.db().pool).await)
}

/// Convert JiraService result to API response
fn handle_jira_result(
    result: Result<JiraIssuesResponse, JiraError>,
) -> ResponseJson<ApiResponse<JiraIssuesResponse, JiraErrorInfo>> {
    match result {
        Ok(response) => {
            tracing::info!("Successfully fetched {} Jira issues", response.total);
            ResponseJson(ApiResponse::success(response))
        }
        Err(JiraError::NotConfigured(msg)) => {
            tracing::warn!("Claude MCP not configured: {}", msg);
            ResponseJson(ApiResponse::error_with_data(JiraErrorInfo {
                code: "NOT_CONFIGURED",
                details: msg,
            }))
        }
        Err(JiraError::ExecutionError(msg)) => {
            tracing::error!("Failed to execute Claude CLI: {}", msg);
            ResponseJson(ApiResponse::error_with_data(JiraErrorInfo {
                code: "EXECUTION_ERROR",
                details: msg,
            }))
        }
        Err(JiraError::ParseError(msg)) => {
            tracing::error!("Failed to parse Jira response: {}", msg);
            ResponseJson(ApiResponse::error_with_data(JiraErrorInfo {
                code: "PARSE_ERROR",
                details: msg,
            }))
        }
        Err(JiraError::ClaudeError(msg)) => {
            tracing::error!("Claude returned an error: {}", msg);
            ResponseJson(ApiResponse::error_with_data(JiraErrorInfo {
                code: "CLAUDE_ERROR",
                details: msg,
            }))
        }
        Err(JiraError::Timeout(secs)) => {
            tracing::error!("Jira fetch timed out after {} seconds", secs);
            ResponseJson(ApiResponse::error_with_data(JiraErrorInfo {
                code: "TIMEOUT",
                details: format!("Request timed out after {} seconds. Please try again.", secs),
            }))
        }
        Err(JiraError::CacheError(e)) => {
            tracing::error!("Jira cache error: {}", e);
            ResponseJson(ApiResponse::error_with_data(JiraErrorInfo {
                code: "CACHE_ERROR",
                details: format!("Cache error: {}", e),
            }))
        }
    }
}
