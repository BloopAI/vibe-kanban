use api_types::{
    CreateIssueRequest, Issue, ListIssuesResponse, MutationResponse, UpdateIssueRequest,
};
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpCreateIssueRequest {
    #[schemars(
        description = "The ID of the project to create the issue in. Optional if running inside a workspace linked to a remote project."
    )]
    project_id: Option<Uuid>,
    #[schemars(description = "The title of the issue")]
    title: String,
    #[schemars(description = "Optional description of the issue")]
    description: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpCreateIssueResponse {
    issue_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListIssuesRequest {
    #[schemars(
        description = "The ID of the project to list issues from. Optional if running inside a workspace linked to a remote project."
    )]
    project_id: Option<Uuid>,
    #[schemars(description = "Maximum number of issues to return (default: 50)")]
    limit: Option<i32>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct IssueSummary {
    #[schemars(description = "The unique identifier of the issue")]
    id: String,
    #[schemars(description = "The title of the issue")]
    title: String,
    #[schemars(description = "Current status of the issue")]
    status: String,
    #[schemars(description = "When the issue was created")]
    created_at: String,
    #[schemars(description = "When the issue was last updated")]
    updated_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct IssueDetails {
    #[schemars(description = "The unique identifier of the issue")]
    id: String,
    #[schemars(description = "The title of the issue")]
    title: String,
    #[schemars(description = "Optional description of the issue")]
    description: Option<String>,
    #[schemars(description = "Current status of the issue")]
    status: String,
    #[schemars(description = "The status ID (UUID)")]
    status_id: String,
    #[schemars(description = "When the issue was created")]
    created_at: String,
    #[schemars(description = "When the issue was last updated")]
    updated_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListIssuesResponse {
    issues: Vec<IssueSummary>,
    count: usize,
    project_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpUpdateIssueRequest {
    #[schemars(description = "The ID of the issue to update")]
    issue_id: Uuid,
    #[schemars(description = "New title for the issue")]
    title: Option<String>,
    #[schemars(description = "New description for the issue")]
    description: Option<String>,
    #[schemars(description = "New status name for the issue (must match a project status name)")]
    status: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpUpdateIssueResponse {
    issue: IssueDetails,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpDeleteIssueRequest {
    #[schemars(description = "The ID of the issue to delete")]
    issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpDeleteIssueResponse {
    deleted_issue_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpGetIssueRequest {
    #[schemars(description = "The ID of the issue to retrieve")]
    issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpGetIssueResponse {
    issue: IssueDetails,
}

#[tool_router(router = remote_issues_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(
        description = "Create a new issue in a project. `project_id` is optional if running inside a workspace linked to a remote project."
    )]
    async fn create_issue(
        &self,
        Parameters(McpCreateIssueRequest {
            project_id,
            title,
            description,
        }): Parameters<McpCreateIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let project_id = match self.resolve_project_id(project_id) {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let expanded_description = match description {
            Some(desc) => Some(self.expand_tags(&desc).await),
            None => None,
        };

        let status_id = match self.default_status_id(project_id).await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let payload = CreateIssueRequest {
            id: None,
            project_id,
            status_id,
            title,
            description: expanded_description,
            priority: None,
            start_date: None,
            target_date: None,
            completed_at: None,
            sort_order: 0.0,
            parent_issue_id: None,
            parent_issue_sort_order: None,
            extension_metadata: serde_json::json!({}),
        };

        let url = self.url("/api/remote/issues");
        let response: MutationResponse<Issue> =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(e),
            };

        TaskServer::success(&McpCreateIssueResponse {
            issue_id: response.data.id.to_string(),
        })
    }

    #[tool(
        description = "List all the issues in a project. `project_id` is optional if running inside a workspace linked to a remote project."
    )]
    async fn list_issues(
        &self,
        Parameters(McpListIssuesRequest { project_id, limit }): Parameters<McpListIssuesRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let project_id = match self.resolve_project_id(project_id) {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let url = self.url(&format!("/api/remote/issues?project_id={}", project_id));
        let response: ListIssuesResponse = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let issue_limit = limit.unwrap_or(50).max(0) as usize;
        let limited: Vec<&Issue> = response.issues.iter().take(issue_limit).collect();
        let status_names_by_id =
            self.fetch_project_statuses(project_id)
                .await
                .ok()
                .map(|statuses| {
                    statuses
                        .into_iter()
                        .map(|status| (status.id, status.name))
                        .collect::<std::collections::HashMap<_, _>>()
                });

        let mut summaries = Vec::with_capacity(limited.len());
        for issue in &limited {
            summaries.push(self.issue_to_summary(issue, status_names_by_id.as_ref()));
        }

        TaskServer::success(&McpListIssuesResponse {
            count: summaries.len(),
            issues: summaries,
            project_id: project_id.to_string(),
        })
    }

    #[tool(
        description = "Get detailed information about a specific issue. You can use `list_issues` to find issue IDs. `issue_id` is required."
    )]
    async fn get_issue(
        &self,
        Parameters(McpGetIssueRequest { issue_id }): Parameters<McpGetIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let issue: Issue = match self.send_json(self.client.get(&url)).await {
            Ok(i) => i,
            Err(e) => return Ok(e),
        };

        let details = self.issue_to_details(&issue).await;
        TaskServer::success(&McpGetIssueResponse { issue: details })
    }

    #[tool(
        description = "Update an existing issue's title, description, or status. `issue_id` is required. `title`, `description`, and `status` are optional."
    )]
    async fn update_issue(
        &self,
        Parameters(McpUpdateIssueRequest {
            issue_id,
            title,
            description,
            status,
        }): Parameters<McpUpdateIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // First get the issue to know its project_id for status resolution
        let get_url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let existing_issue: Issue = match self.send_json(self.client.get(&get_url)).await {
            Ok(i) => i,
            Err(e) => return Ok(e),
        };

        // Resolve status name to status_id if provided
        let status_id = if let Some(ref status_name) = status {
            match self
                .resolve_status_id(existing_issue.project_id, status_name)
                .await
            {
                Ok(id) => Some(id),
                Err(e) => return Ok(e),
            }
        } else {
            None
        };

        // Expand @tagname references in description
        let expanded_description = match description {
            Some(desc) => Some(Some(self.expand_tags(&desc).await)),
            None => None,
        };

        let payload = UpdateIssueRequest {
            status_id,
            title,
            description: expanded_description,
            priority: None,
            start_date: None,
            target_date: None,
            completed_at: None,
            sort_order: None,
            parent_issue_id: None,
            parent_issue_sort_order: None,
            extension_metadata: None,
        };

        let url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let response: MutationResponse<Issue> =
            match self.send_json(self.client.patch(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(e),
            };

        let details = self.issue_to_details(&response.data).await;
        TaskServer::success(&McpUpdateIssueResponse { issue: details })
    }

    #[tool(description = "Delete an issue. `issue_id` is required.")]
    async fn delete_issue(
        &self,
        Parameters(McpDeleteIssueRequest { issue_id }): Parameters<McpDeleteIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/remote/issues/{}", issue_id));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(e);
        }

        TaskServer::success(&McpDeleteIssueResponse {
            deleted_issue_id: Some(issue_id.to_string()),
        })
    }
}

impl TaskServer {
    fn issue_to_summary(
        &self,
        issue: &Issue,
        status_names_by_id: Option<&std::collections::HashMap<Uuid, String>>,
    ) -> IssueSummary {
        let status = status_names_by_id
            .and_then(|status_map| status_map.get(&issue.status_id).cloned())
            .unwrap_or_else(|| issue.status_id.to_string());
        IssueSummary {
            id: issue.id.to_string(),
            title: issue.title.clone(),
            status,
            created_at: issue.created_at.to_rfc3339(),
            updated_at: issue.updated_at.to_rfc3339(),
        }
    }

    async fn issue_to_details(&self, issue: &Issue) -> IssueDetails {
        let status = self
            .resolve_status_name(issue.project_id, issue.status_id)
            .await;
        IssueDetails {
            id: issue.id.to_string(),
            title: issue.title.clone(),
            description: issue.description.clone(),
            status,
            status_id: issue.status_id.to_string(),
            created_at: issue.created_at.to_rfc3339(),
            updated_at: issue.updated_at.to_rfc3339(),
        }
    }
}
