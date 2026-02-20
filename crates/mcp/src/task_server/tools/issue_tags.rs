use api_types::{
    CreateIssueTagRequest, IssueTag, ListIssueTagsResponse, ListTagsResponse, MutationResponse,
};
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListTagsRequest {
    #[schemars(
        description = "The project ID to list tags from. Optional if running inside a workspace linked to a remote project."
    )]
    project_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct TagSummary {
    #[schemars(description = "Tag ID")]
    id: String,
    #[schemars(description = "Project ID")]
    project_id: String,
    #[schemars(description = "Tag name")]
    name: String,
    #[schemars(description = "Tag color value")]
    color: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListTagsResponse {
    project_id: String,
    tags: Vec<TagSummary>,
    count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListIssueTagsRequest {
    #[schemars(description = "Issue ID to list tags for")]
    issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct IssueTagSummary {
    #[schemars(description = "Issue-tag relation ID")]
    id: String,
    #[schemars(description = "Issue ID")]
    issue_id: String,
    #[schemars(description = "Tag ID")]
    tag_id: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListIssueTagsResponse {
    issue_id: String,
    issue_tags: Vec<IssueTagSummary>,
    count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpAddIssueTagRequest {
    #[schemars(description = "Issue ID to attach the tag to")]
    issue_id: Uuid,
    #[schemars(description = "Tag ID to attach")]
    tag_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpAddIssueTagResponse {
    issue_tag_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpRemoveIssueTagRequest {
    #[schemars(description = "Issue-tag relation ID to remove")]
    issue_tag_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpRemoveIssueTagResponse {
    success: bool,
    issue_tag_id: String,
}

#[tool_router(router = issue_tags_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(
        description = "List tags for a project. `project_id` is optional if running inside a workspace linked to a remote project."
    )]
    async fn list_tags(
        &self,
        Parameters(McpListTagsRequest { project_id }): Parameters<McpListTagsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let project_id = match self.resolve_project_id(project_id) {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let url = self.url(&format!("/api/remote/tags?project_id={}", project_id));
        let response: ListTagsResponse = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let tags = response
            .tags
            .into_iter()
            .map(|tag| TagSummary {
                id: tag.id.to_string(),
                project_id: tag.project_id.to_string(),
                name: tag.name,
                color: tag.color,
            })
            .collect::<Vec<_>>();

        TaskServer::success(&McpListTagsResponse {
            project_id: project_id.to_string(),
            count: tags.len(),
            tags,
        })
    }

    #[tool(description = "List tags attached to an issue.")]
    async fn list_issue_tags(
        &self,
        Parameters(McpListIssueTagsRequest { issue_id }): Parameters<McpListIssueTagsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/remote/issue-tags?issue_id={}", issue_id));
        let response: ListIssueTagsResponse = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let issue_tags = response
            .issue_tags
            .into_iter()
            .map(|issue_tag| IssueTagSummary {
                id: issue_tag.id.to_string(),
                issue_id: issue_tag.issue_id.to_string(),
                tag_id: issue_tag.tag_id.to_string(),
            })
            .collect::<Vec<_>>();

        TaskServer::success(&McpListIssueTagsResponse {
            issue_id: issue_id.to_string(),
            count: issue_tags.len(),
            issue_tags,
        })
    }

    #[tool(description = "Attach a tag to an issue.")]
    async fn add_issue_tag(
        &self,
        Parameters(McpAddIssueTagRequest { issue_id, tag_id }): Parameters<McpAddIssueTagRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let payload = CreateIssueTagRequest {
            id: None,
            issue_id,
            tag_id,
        };

        let url = self.url("/api/remote/issue-tags");
        let response: MutationResponse<IssueTag> =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(e),
            };

        TaskServer::success(&McpAddIssueTagResponse {
            issue_tag_id: response.data.id.to_string(),
        })
    }

    #[tool(description = "Remove a tag from an issue using issue_tag_id.")]
    async fn remove_issue_tag(
        &self,
        Parameters(McpRemoveIssueTagRequest { issue_tag_id }): Parameters<McpRemoveIssueTagRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/remote/issue-tags/{}", issue_tag_id));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(e);
        }

        TaskServer::success(&McpRemoveIssueTagResponse {
            success: true,
            issue_tag_id: issue_tag_id.to_string(),
        })
    }
}
