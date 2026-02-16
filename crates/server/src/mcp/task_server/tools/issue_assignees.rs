use api_types::{
    CreateIssueAssigneeRequest, IssueAssignee, ListIssueAssigneesResponse, MutationResponse,
};
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListIssueAssigneesRequest {
    #[schemars(description = "Issue ID to list assignees for")]
    issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct IssueAssigneeSummary {
    #[schemars(description = "Issue assignee ID")]
    id: String,
    #[schemars(description = "Issue ID")]
    issue_id: String,
    #[schemars(description = "User ID")]
    user_id: String,
    #[schemars(description = "Assignment timestamp")]
    assigned_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListIssueAssigneesResponse {
    issue_id: String,
    issue_assignees: Vec<IssueAssigneeSummary>,
    count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpAssignIssueRequest {
    #[schemars(description = "Issue ID to assign")]
    issue_id: Uuid,
    #[schemars(description = "User ID to assign to the issue")]
    user_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpAssignIssueResponse {
    issue_assignee_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpUnassignIssueRequest {
    #[schemars(description = "Issue assignee ID to remove")]
    issue_assignee_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpUnassignIssueResponse {
    success: bool,
    issue_assignee_id: String,
}

#[tool_router(router = issue_assignees_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(description = "List assignees for an issue.")]
    async fn list_issue_assignees(
        &self,
        Parameters(McpListIssueAssigneesRequest { issue_id }): Parameters<
            McpListIssueAssigneesRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!(
            "/api/remote/issue-assignees?issue_id={}",
            issue_id
        ));
        let response: ListIssueAssigneesResponse = match self.send_json(self.client.get(&url)).await
        {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let assignees = response
            .issue_assignees
            .into_iter()
            .map(|assignee| IssueAssigneeSummary {
                id: assignee.id.to_string(),
                issue_id: assignee.issue_id.to_string(),
                user_id: assignee.user_id.to_string(),
                assigned_at: assignee.assigned_at.to_rfc3339(),
            })
            .collect::<Vec<_>>();

        TaskServer::success(&McpListIssueAssigneesResponse {
            issue_id: issue_id.to_string(),
            count: assignees.len(),
            issue_assignees: assignees,
        })
    }

    #[tool(description = "Assign a user to an issue.")]
    async fn assign_issue(
        &self,
        Parameters(McpAssignIssueRequest { issue_id, user_id }): Parameters<McpAssignIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let payload = CreateIssueAssigneeRequest {
            id: None,
            issue_id,
            user_id,
        };

        let url = self.url("/api/remote/issue-assignees");
        let response: MutationResponse<IssueAssignee> =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(e),
            };

        TaskServer::success(&McpAssignIssueResponse {
            issue_assignee_id: response.data.id.to_string(),
        })
    }

    #[tool(description = "Remove an assignee from an issue using issue_assignee_id.")]
    async fn unassign_issue(
        &self,
        Parameters(McpUnassignIssueRequest { issue_assignee_id }): Parameters<
            McpUnassignIssueRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!(
            "/api/remote/issue-assignees/{}",
            issue_assignee_id
        ));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(e);
        }

        TaskServer::success(&McpUnassignIssueResponse {
            success: true,
            issue_assignee_id: issue_assignee_id.to_string(),
        })
    }
}
