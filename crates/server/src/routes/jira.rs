use axum::{Router, response::Json as ResponseJson, routing::get};
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
    Router::new().route("/jira/my-issues", get(fetch_my_jira_issues))
}

#[axum::debug_handler]
async fn fetch_my_jira_issues() -> ResponseJson<ApiResponse<JiraIssuesResponse, JiraErrorInfo>> {
    match JiraService::fetch_my_issues().await {
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
    }
}
