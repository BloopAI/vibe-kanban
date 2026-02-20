use api_types::{
    CreateIssueTagRequest, Issue, IssueTag, ListIssueTagsResponse, ListTagsResponse,
    MutationResponse,
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
    #[schemars(description = "Tag ID to attach (use this or tag_name)")]
    tag_id: Option<Uuid>,
    #[schemars(
        description = "Tag name to attach (resolved automatically). Use list_tags to see available names."
    )]
    tag_name: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpAddIssueTagResponse {
    issue_tag_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpRemoveIssueTagRequest {
    #[schemars(description = "Issue-tag relation ID to remove (use this or issue_id + tag_name)")]
    issue_tag_id: Option<Uuid>,
    #[schemars(description = "Issue ID (required when using tag_name to remove)")]
    issue_id: Option<Uuid>,
    #[schemars(description = "Tag name to remove (resolved automatically)")]
    tag_name: Option<String>,
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

    #[tool(
        description = "Attach a tag to an issue. Provide either tag_id or tag_name (resolved automatically)."
    )]
    async fn add_issue_tag(
        &self,
        Parameters(McpAddIssueTagRequest {
            issue_id,
            tag_id,
            tag_name,
        }): Parameters<McpAddIssueTagRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let tag_id = match (tag_id, tag_name) {
            (Some(id), _) => id,
            (None, Some(name)) => {
                let issue_url = self.url(&format!("/api/remote/issues/{}", issue_id));
                let issue: Issue = match self.send_json(self.client.get(&issue_url)).await {
                    Ok(i) => i,
                    Err(e) => return Ok(e),
                };
                match self.resolve_tag_id(issue.project_id, &name).await {
                    Ok(id) => id,
                    Err(e) => return Ok(e),
                }
            }
            (None, None) => {
                return Self::err("Either tag_id or tag_name is required", None::<&str>);
            }
        };

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

    #[tool(
        description = "Remove a tag from an issue. Provide issue_tag_id directly, or issue_id + tag_name to resolve automatically."
    )]
    async fn remove_issue_tag(
        &self,
        Parameters(McpRemoveIssueTagRequest {
            issue_tag_id,
            issue_id,
            tag_name,
        }): Parameters<McpRemoveIssueTagRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let resolved_issue_tag_id = match (issue_tag_id, issue_id, tag_name) {
            (Some(id), _, _) => id,
            (None, Some(issue_id), Some(tag_name)) => {
                let issue_url = self.url(&format!("/api/remote/issues/{}", issue_id));
                let issue: Issue = match self.send_json(self.client.get(&issue_url)).await {
                    Ok(i) => i,
                    Err(e) => return Ok(e),
                };
                let tag_id = match self.resolve_tag_id(issue.project_id, &tag_name).await {
                    Ok(id) => id,
                    Err(e) => return Ok(e),
                };
                let list_url = self.url(&format!("/api/remote/issue-tags?issue_id={}", issue_id));
                let response: ListIssueTagsResponse =
                    match self.send_json(self.client.get(&list_url)).await {
                        Ok(r) => r,
                        Err(e) => return Ok(e),
                    };
                match response.issue_tags.iter().find(|it| it.tag_id == tag_id) {
                    Some(it) => it.id,
                    None => {
                        return Self::err(
                            format!("Tag '{}' is not attached to this issue", tag_name),
                            None::<String>,
                        );
                    }
                }
            }
            _ => {
                return Self::err(
                    "Provide issue_tag_id, or both issue_id and tag_name",
                    None::<&str>,
                );
            }
        };

        let url = self.url(&format!("/api/remote/issue-tags/{}", resolved_issue_tag_id));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(e);
        }

        TaskServer::success(&McpRemoveIssueTagResponse {
            success: true,
            issue_tag_id: resolved_issue_tag_id.to_string(),
        })
    }
}
