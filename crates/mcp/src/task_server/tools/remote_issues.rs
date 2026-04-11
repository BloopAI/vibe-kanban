use std::collections::HashMap;

use api_types::{
    CreateIssueRequest, Issue, IssuePriority, IssueRelationshipType, IssueSortField,
    ListIssueRelationshipsResponse, ListIssueTagsResponse, ListIssuesResponse,
    ListPullRequestsResponse, ListTagsResponse, MutationResponse, PullRequestStatus,
    SearchIssuesRequest, SortDirection, UpdateIssueRequest,
};
use rmcp::{
    ErrorData, handler::server::wrapper::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{McpServer, ToolError};

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
    #[schemars(
        description = "Optional priority of the issue. Allowed values: 'urgent', 'high', 'medium', 'low'."
    )]
    priority: Option<String>,
    #[schemars(description = "Optional parent issue ID to create a subissue")]
    parent_issue_id: Option<Uuid>,
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
    #[schemars(description = "Number of results to skip before returning rows (default: 0)")]
    offset: Option<i32>,
    #[schemars(description = "Filter by status name (case-insensitive)")]
    status: Option<String>,
    #[schemars(
        description = "Filter by priority. Allowed values: 'urgent', 'high', 'medium', 'low'."
    )]
    priority: Option<String>,
    #[schemars(description = "Filter by parent issue ID (subissues of this issue)")]
    parent_issue_id: Option<Uuid>,
    #[schemars(description = "Case-insensitive substring match against title and description")]
    search: Option<String>,
    #[schemars(description = "Filter by issue simple ID (case-insensitive exact match)")]
    simple_id: Option<String>,
    #[schemars(description = "Filter to issues assigned to this user ID")]
    assignee_user_id: Option<Uuid>,
    #[schemars(description = "Filter to issues having this tag ID")]
    tag_id: Option<Uuid>,
    #[schemars(description = "Filter to issues having a tag with this name (case-insensitive)")]
    tag_name: Option<String>,
    #[schemars(
        description = "Field to sort by. Allowed values: 'sort_order', 'priority', 'created_at', 'updated_at', 'title'. Default: 'sort_order'."
    )]
    sort_field: Option<String>,
    #[schemars(description = "Sort direction. Allowed values: 'asc', 'desc'. Default: 'asc'.")]
    sort_direction: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct IssueSummary {
    #[schemars(description = "The unique identifier of the issue")]
    id: String,
    #[schemars(description = "The title of the issue")]
    title: String,
    #[schemars(description = "The human-readable issue simple ID")]
    simple_id: String,
    #[schemars(description = "Current status of the issue")]
    status: String,
    #[schemars(description = "Current priority of the issue")]
    priority: Option<String>,
    #[schemars(description = "Parent issue ID if this is a subissue")]
    parent_issue_id: Option<String>,
    #[schemars(description = "When the issue was created")]
    created_at: String,
    #[schemars(description = "When the issue was last updated")]
    updated_at: String,
    #[schemars(description = "Number of pull requests linked to this issue")]
    pull_request_count: usize,
    #[schemars(description = "URL of the most recent pull request, if any")]
    latest_pr_url: Option<String>,
    #[schemars(
        description = "Status of the most recent pull request: 'open', 'merged', or 'closed'"
    )]
    latest_pr_status: Option<PullRequestStatus>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct PullRequestSummary {
    #[schemars(description = "PR number")]
    number: i32,
    #[schemars(description = "URL of the pull request")]
    url: String,
    #[schemars(description = "Status of the pull request: 'open', 'merged', or 'closed'")]
    status: PullRequestStatus,
    #[schemars(description = "When the PR was merged, if applicable")]
    merged_at: Option<String>,
    #[schemars(description = "Target branch for the PR")]
    target_branch_name: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpTagSummary {
    #[schemars(description = "The tag ID")]
    id: String,
    #[schemars(description = "The tag name")]
    name: String,
    #[schemars(description = "The tag color")]
    color: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpRelationshipSummary {
    #[schemars(description = "The relationship ID (use this to delete)")]
    id: String,
    #[schemars(description = "The related issue ID")]
    related_issue_id: String,
    #[schemars(description = "The related issue's simple ID (e.g. 'PROJ-42')")]
    related_simple_id: String,
    #[schemars(description = "Relationship type: blocking, related, or has_duplicate")]
    relationship_type: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpSubIssueSummary {
    #[schemars(description = "The sub-issue ID")]
    id: String,
    #[schemars(description = "Short human-readable identifier (e.g. 'PROJ-43')")]
    simple_id: String,
    #[schemars(description = "The sub-issue title")]
    title: String,
    #[schemars(description = "Current status of the sub-issue")]
    status: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct IssueDetails {
    #[schemars(description = "The unique identifier of the issue")]
    id: String,
    #[schemars(description = "The title of the issue")]
    title: String,
    #[schemars(description = "The human-readable issue simple ID")]
    simple_id: String,
    #[schemars(description = "Optional description of the issue")]
    description: Option<String>,
    #[schemars(description = "Current status of the issue")]
    status: String,
    #[schemars(description = "The status ID (UUID)")]
    status_id: String,
    #[schemars(description = "Current priority of the issue")]
    priority: Option<String>,
    #[schemars(description = "Parent issue ID if this is a subissue")]
    parent_issue_id: Option<String>,
    #[schemars(description = "Optional planned start date")]
    start_date: Option<String>,
    #[schemars(description = "Optional planned target date")]
    target_date: Option<String>,
    #[schemars(description = "Optional completion date")]
    completed_at: Option<String>,
    #[schemars(description = "When the issue was created")]
    created_at: String,
    #[schemars(description = "When the issue was last updated")]
    updated_at: String,
    #[schemars(description = "Pull requests linked to this issue")]
    pull_requests: Vec<PullRequestSummary>,
    #[schemars(description = "Tags attached to this issue")]
    tags: Vec<McpTagSummary>,
    #[schemars(description = "Relationships to other issues")]
    relationships: Vec<McpRelationshipSummary>,
    #[schemars(description = "Sub-issues under this issue")]
    sub_issues: Vec<McpSubIssueSummary>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListIssuesResponse {
    issues: Vec<IssueSummary>,
    total_count: usize,
    returned_count: usize,
    limit: usize,
    offset: usize,
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
    #[schemars(
        description = "New priority for the issue. Allowed values: 'urgent', 'high', 'medium', 'low'."
    )]
    priority: Option<String>,
    #[schemars(
        description = "Parent issue ID to set this as a subissue. Pass null to un-nest from parent."
    )]
    parent_issue_id: Option<Option<Uuid>>,
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

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListIssuePrioritiesResponse {
    priorities: Vec<String>,
}

#[tool_router(router = remote_issues_tools_router, vis = "pub")]
impl McpServer {
    #[tool(
        description = "Create a new issue in a project. `project_id` is optional if running inside a workspace linked to a remote project."
    )]
    async fn create_issue(
        &self,
        Parameters(McpCreateIssueRequest {
            project_id,
            title,
            description,
            priority,
            parent_issue_id,
        }): Parameters<McpCreateIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let project_id = match self.resolve_project_id(project_id) {
            Ok(id) => id,
            Err(e) => return Ok(McpServer::tool_error(e)),
        };

        let expanded_description = match description {
            Some(desc) => Some(self.expand_tags(&desc).await),
            None => None,
        };

        let status_id = match self.default_status_id(project_id).await {
            Ok(id) => id,
            Err(e) => return Ok(McpServer::tool_error(e)),
        };

        let priority = match priority {
            Some(p) => match Self::parse_issue_priority(&p) {
                Ok(priority) => Some(priority),
                Err(e) => return Ok(McpServer::tool_error(e)),
            },
            None => None,
        };

        let payload = CreateIssueRequest {
            id: None,
            project_id,
            status_id,
            title,
            description: expanded_description,
            priority,
            start_date: None,
            target_date: None,
            completed_at: None,
            sort_order: 0.0,
            parent_issue_id,
            parent_issue_sort_order: None,
            extension_metadata: serde_json::json!({}),
        };

        let url = self.url("/api/remote/issues");
        let response: MutationResponse<Issue> =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(McpServer::tool_error(e)),
            };

        McpServer::success(&McpCreateIssueResponse {
            issue_id: response.data.id.to_string(),
        })
    }

    #[tool(
        description = "List all the issues in a project. `project_id` is optional if running inside a workspace linked to a remote project."
    )]
    async fn list_issues(
        &self,
        Parameters(McpListIssuesRequest {
            project_id,
            limit,
            offset,
            status,
            priority,
            parent_issue_id,
            search,
            simple_id,
            assignee_user_id,
            tag_id,
            tag_name,
            sort_field,
            sort_direction,
        }): Parameters<McpListIssuesRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let project_id = match self.resolve_project_id(project_id) {
            Ok(id) => id,
            Err(e) => return Ok(McpServer::tool_error(e)),
        };

        let project_statuses = match self.fetch_project_statuses(project_id).await {
            Ok(statuses) => Some(statuses),
            Err(e) => {
                if status.is_some() {
                    return Ok(McpServer::tool_error(e));
                }
                None
            }
        };
        let status_names_by_id = project_statuses.as_ref().map(|statuses| {
            statuses
                .iter()
                .map(|status| (status.id, status.name.clone()))
                .collect::<HashMap<_, _>>()
        });

        let (status_id, status_ids, missing_status_name_match) = match status.as_deref() {
            Some(status) => match Uuid::parse_str(status) {
                Ok(status_id) => (Some(status_id), None, false),
                Err(_) => {
                    let matching_status_ids = project_statuses
                        .as_deref()
                        .map(|statuses| {
                            Self::matching_ids_by_name(
                                statuses
                                    .iter()
                                    .map(|status| (status.id, status.name.as_str())),
                                status,
                            )
                        })
                        .unwrap_or_default();
                    let missing_status_name_match = matching_status_ids.is_empty();
                    (
                        None,
                        (!missing_status_name_match).then_some(matching_status_ids),
                        missing_status_name_match,
                    )
                }
            },
            None => (None, None, false),
        };

        let priority = match priority {
            Some(priority) => match Self::parse_issue_priority(&priority) {
                Ok(priority) => Some(priority),
                Err(e) => return Ok(McpServer::tool_error(e)),
            },
            None => None,
        };

        let sort_field = match Self::parse_issue_sort_field(sort_field.as_deref()) {
            Ok(value) => Some(value),
            Err(e) => return Ok(McpServer::tool_error(e)),
        };
        let sort_direction = match Self::parse_sort_direction(sort_direction.as_deref()) {
            Ok(value) => Some(value),
            Err(e) => return Ok(McpServer::tool_error(e)),
        };

        let matching_tag_ids = match tag_name.as_deref() {
            Some(tag_name) => match self.find_tag_ids_by_name(project_id, tag_name).await {
                Ok(tag_ids) => Some(tag_ids),
                Err(e) => return Ok(McpServer::tool_error(e)),
            },
            None => None,
        };
        let (tag_id, tag_ids, missing_tag_name_match) =
            Self::resolve_tag_filters(tag_id, matching_tag_ids);

        let response = if missing_status_name_match || missing_tag_name_match {
            ListIssuesResponse {
                issues: Vec::new(),
                total_count: 0,
                limit: limit.unwrap_or(50).max(0) as usize,
                offset: offset.unwrap_or(0).max(0) as usize,
            }
        } else {
            let query = SearchIssuesRequest {
                project_id,
                status_id,
                status_ids,
                priority,
                parent_issue_id,
                search,
                simple_id,
                assignee_user_id,
                tag_id,
                tag_ids,
                sort_field,
                sort_direction,
                limit: Some(limit.unwrap_or(50).max(0)),
                offset: Some(offset.unwrap_or(0).max(0)),
            };
            let url = self.url("/api/remote/issues/search");
            match self.send_json(self.client.post(&url).json(&query)).await {
                Ok(r) => r,
                Err(e) => return Ok(McpServer::tool_error(e)),
            }
        };

        let mut summaries = Vec::with_capacity(response.issues.len());
        for issue in &response.issues {
            let pull_requests = self.fetch_pull_requests(issue.id).await;
            summaries.push(self.issue_to_summary(
                issue,
                status_names_by_id.as_ref(),
                &pull_requests,
            ));
        }

        McpServer::success(&McpListIssuesResponse {
            total_count: response.total_count,
            returned_count: summaries.len(),
            limit: response.limit,
            offset: response.offset,
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
            Err(e) => return Ok(McpServer::tool_error(e)),
        };

        let pull_requests = self.fetch_pull_requests(issue_id).await;
        let details = self.issue_to_details(&issue, pull_requests).await;
        McpServer::success(&McpGetIssueResponse { issue: details })
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
            priority,
            parent_issue_id,
        }): Parameters<McpUpdateIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // First get the issue to know its project_id for status resolution
        let get_url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let existing_issue: Issue = match self.send_json(self.client.get(&get_url)).await {
            Ok(i) => i,
            Err(e) => return Ok(McpServer::tool_error(e)),
        };

        // Resolve status name to status_id if provided
        let status_id = if let Some(ref status_name) = status {
            match self
                .resolve_status_id(existing_issue.project_id, status_name)
                .await
            {
                Ok(id) => Some(id),
                Err(e) => return Ok(McpServer::tool_error(e)),
            }
        } else {
            None
        };

        // Expand @tagname references in description
        let expanded_description = match description {
            Some(desc) => Some(Some(self.expand_tags(&desc).await)),
            None => None,
        };

        let priority = if let Some(priority) = priority {
            match Self::parse_issue_priority(&priority) {
                Ok(parsed) => Some(Some(parsed)),
                Err(e) => return Ok(McpServer::tool_error(e)),
            }
        } else {
            None
        };

        let payload = UpdateIssueRequest {
            status_id,
            title,
            description: expanded_description,
            priority,
            start_date: None,
            target_date: None,
            completed_at: None,
            sort_order: None,
            parent_issue_id,
            parent_issue_sort_order: None,
            extension_metadata: None,
        };

        let url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let response: MutationResponse<Issue> =
            match self.send_json(self.client.patch(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(McpServer::tool_error(e)),
            };

        let pull_requests = self.fetch_pull_requests(issue_id).await;
        let details = self.issue_to_details(&response.data, pull_requests).await;
        McpServer::success(&McpUpdateIssueResponse { issue: details })
    }

    #[tool(description = "List allowed issue priority values.")]
    async fn list_issue_priorities(&self) -> Result<CallToolResult, ErrorData> {
        McpServer::success(&McpListIssuePrioritiesResponse {
            priorities: ["urgent", "high", "medium", "low"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
        })
    }

    #[tool(description = "Delete an issue. `issue_id` is required.")]
    async fn delete_issue(
        &self,
        Parameters(McpDeleteIssueRequest { issue_id }): Parameters<McpDeleteIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/remote/issues/{}", issue_id));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(McpServer::tool_error(e));
        }

        McpServer::success(&McpDeleteIssueResponse {
            deleted_issue_id: Some(issue_id.to_string()),
        })
    }
}

impl McpServer {
    fn parse_issue_sort_field(sort_field: Option<&str>) -> Result<IssueSortField, ToolError> {
        match sort_field
            .unwrap_or("sort_order")
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "sort_order" => Ok(IssueSortField::SortOrder),
            "priority" => Ok(IssueSortField::Priority),
            "created_at" => Ok(IssueSortField::CreatedAt),
            "updated_at" => Ok(IssueSortField::UpdatedAt),
            "title" => Ok(IssueSortField::Title),
            other => Err(ToolError::message(format!(
                "Unknown sort_field '{}'. Allowed values: ['sort_order', 'priority', 'created_at', 'updated_at', 'title']",
                other
            ))),
        }
    }

    fn parse_sort_direction(sort_direction: Option<&str>) -> Result<SortDirection, ToolError> {
        match sort_direction
            .unwrap_or("asc")
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "asc" => Ok(SortDirection::Asc),
            "desc" => Ok(SortDirection::Desc),
            other => Err(ToolError::message(format!(
                "Unknown sort_direction '{}'. Allowed values: ['asc', 'desc']",
                other
            ))),
        }
    }

    fn issue_to_summary(
        &self,
        issue: &Issue,
        status_names_by_id: Option<&HashMap<Uuid, String>>,
        pull_requests: &ListPullRequestsResponse,
    ) -> IssueSummary {
        let status = status_names_by_id
            .and_then(|status_map| status_map.get(&issue.status_id).cloned())
            .unwrap_or_else(|| issue.status_id.to_string());
        let latest_pr = pull_requests.pull_requests.first();
        IssueSummary {
            id: issue.id.to_string(),
            title: issue.title.clone(),
            simple_id: issue.simple_id.clone(),
            status,
            priority: issue
                .priority
                .map(Self::issue_priority_label)
                .map(str::to_string),
            parent_issue_id: issue.parent_issue_id.map(|id| id.to_string()),
            created_at: issue.created_at.to_rfc3339(),
            updated_at: issue.updated_at.to_rfc3339(),
            pull_request_count: pull_requests.pull_requests.len(),
            latest_pr_url: latest_pr.map(|pr| pr.url.clone()),
            latest_pr_status: latest_pr.map(|pr| pr.status),
        }
    }

    async fn issue_to_details(
        &self,
        issue: &Issue,
        pull_requests: ListPullRequestsResponse,
    ) -> IssueDetails {
        let status = self
            .resolve_status_name(issue.project_id, issue.status_id)
            .await;

        let tags = self
            .fetch_issue_tags_resolved(issue.project_id, issue.id)
            .await;

        let relationships = self
            .fetch_issue_relationships_resolved(issue.project_id, issue.id)
            .await;

        let sub_issues = self.fetch_sub_issues(issue.project_id, issue.id).await;

        IssueDetails {
            id: issue.id.to_string(),
            title: issue.title.clone(),
            simple_id: issue.simple_id.clone(),
            description: issue.description.clone(),
            status,
            status_id: issue.status_id.to_string(),
            priority: issue
                .priority
                .map(Self::issue_priority_label)
                .map(str::to_string),
            parent_issue_id: issue.parent_issue_id.map(|id| id.to_string()),
            start_date: issue.start_date.map(|date| date.to_rfc3339()),
            target_date: issue.target_date.map(|date| date.to_rfc3339()),
            completed_at: issue.completed_at.map(|date| date.to_rfc3339()),
            created_at: issue.created_at.to_rfc3339(),
            updated_at: issue.updated_at.to_rfc3339(),
            pull_requests: pull_requests
                .pull_requests
                .into_iter()
                .map(|pr| PullRequestSummary {
                    number: pr.number,
                    url: pr.url,
                    status: pr.status,
                    merged_at: pr.merged_at.map(|dt| dt.to_rfc3339()),
                    target_branch_name: pr.target_branch_name,
                })
                .collect(),
            tags,
            relationships,
            sub_issues,
        }
    }

    async fn fetch_pull_requests(&self, issue_id: Uuid) -> ListPullRequestsResponse {
        let url = self.url(&format!("/api/remote/pull-requests?issue_id={}", issue_id));
        match self
            .send_json::<ListPullRequestsResponse>(self.client.get(&url))
            .await
        {
            Ok(response) => response,
            Err(_) => ListPullRequestsResponse {
                pull_requests: vec![],
            },
        }
    }

    /// Fetches tags for an issue, resolving tag_ids to names via project tags.
    async fn fetch_issue_tags_resolved(
        &self,
        project_id: Uuid,
        issue_id: Uuid,
    ) -> Vec<McpTagSummary> {
        let tags_url = self.url(&format!("/api/remote/tags?project_id={}", project_id));
        let project_tags: ListTagsResponse = match self.send_json(self.client.get(&tags_url)).await
        {
            Ok(r) => r,
            Err(_) => return Vec::new(),
        };
        let tag_map: HashMap<Uuid, &api_types::Tag> =
            project_tags.tags.iter().map(|t| (t.id, t)).collect();

        let url = self.url(&format!("/api/remote/issue-tags?issue_id={}", issue_id));
        let response: ListIssueTagsResponse = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(_) => return Vec::new(),
        };

        response
            .issue_tags
            .iter()
            .filter_map(|it| {
                tag_map.get(&it.tag_id).map(|tag| McpTagSummary {
                    id: tag.id.to_string(),
                    name: tag.name.clone(),
                    color: tag.color.clone(),
                })
            })
            .collect()
    }

    /// Fetches relationships for an issue, resolving related issue simple_ids.
    async fn fetch_issue_relationships_resolved(
        &self,
        project_id: Uuid,
        issue_id: Uuid,
    ) -> Vec<McpRelationshipSummary> {
        let rel_url = self.url(&format!(
            "/api/remote/issue-relationships?issue_id={}",
            issue_id
        ));
        let response: ListIssueRelationshipsResponse =
            match self.send_json(self.client.get(&rel_url)).await {
                Ok(r) => r,
                Err(_) => return Vec::new(),
            };

        if response.issue_relationships.is_empty() {
            return Vec::new();
        }

        let issues_url = self.url(&format!("/api/remote/issues?project_id={}", project_id));
        let issues_response: api_types::ListIssuesResponse = self
            .send_json(self.client.get(&issues_url))
            .await
            .unwrap_or(api_types::ListIssuesResponse {
                issues: Vec::new(),
                total_count: 0,
                limit: 0,
                offset: 0,
            });
        let simple_id_map: HashMap<Uuid, &str> = issues_response
            .issues
            .iter()
            .map(|i| (i.id, i.simple_id.as_str()))
            .collect();

        response
            .issue_relationships
            .into_iter()
            .map(|r| {
                let related_simple_id = simple_id_map
                    .get(&r.related_issue_id)
                    .unwrap_or(&"")
                    .to_string();
                McpRelationshipSummary {
                    id: r.id.to_string(),
                    related_issue_id: r.related_issue_id.to_string(),
                    related_simple_id,
                    relationship_type: match r.relationship_type {
                        IssueRelationshipType::Blocking => "blocking".to_string(),
                        IssueRelationshipType::Related => "related".to_string(),
                        IssueRelationshipType::HasDuplicate => "has_duplicate".to_string(),
                    },
                }
            })
            .collect()
    }

    /// Fetches sub-issues for a given parent issue.
    async fn fetch_sub_issues(
        &self,
        project_id: Uuid,
        parent_issue_id: Uuid,
    ) -> Vec<McpSubIssueSummary> {
        let url = self.url(&format!("/api/remote/issues?project_id={}", project_id));
        let response: api_types::ListIssuesResponse =
            match self.send_json(self.client.get(&url)).await {
                Ok(r) => r,
                Err(_) => return Vec::new(),
            };

        let status_names = self
            .fetch_project_statuses(project_id)
            .await
            .ok()
            .map(|statuses| {
                statuses
                    .into_iter()
                    .map(|s| (s.id, s.name))
                    .collect::<HashMap<_, _>>()
            });

        response
            .issues
            .iter()
            .filter(|i| i.parent_issue_id == Some(parent_issue_id))
            .map(|i| {
                let status = status_names
                    .as_ref()
                    .and_then(|m| m.get(&i.status_id).cloned())
                    .unwrap_or_else(|| i.status_id.to_string());
                McpSubIssueSummary {
                    id: i.id.to_string(),
                    simple_id: i.simple_id.clone(),
                    title: i.title.clone(),
                    status,
                }
            })
            .collect()
    }

    fn parse_issue_priority(priority: &str) -> Result<IssuePriority, ToolError> {
        match priority.trim().to_ascii_lowercase().as_str() {
            "urgent" => Ok(IssuePriority::Urgent),
            "high" => Ok(IssuePriority::High),
            "medium" => Ok(IssuePriority::Medium),
            "low" => Ok(IssuePriority::Low),
            _ => Err(ToolError::message(format!(
                "Unknown priority '{}'. Allowed values: ['urgent', 'high', 'medium', 'low']",
                priority
            ))),
        }
    }

    fn issue_priority_label(priority: IssuePriority) -> &'static str {
        match priority {
            IssuePriority::Urgent => "urgent",
            IssuePriority::High => "high",
            IssuePriority::Medium => "medium",
            IssuePriority::Low => "low",
        }
    }

    async fn find_tag_ids_by_name(
        &self,
        project_id: Uuid,
        tag_name: &str,
    ) -> Result<Vec<Uuid>, ToolError> {
        let url = self.url(&format!("/api/remote/tags?project_id={}", project_id));
        let tags: ListTagsResponse = self.send_json(self.client.get(&url)).await?;
        Ok(Self::matching_ids_by_name(
            tags.tags.iter().map(|tag| (tag.id, tag.name.as_str())),
            tag_name,
        ))
    }

    fn matching_ids_by_name<'a>(
        items: impl IntoIterator<Item = (Uuid, &'a str)>,
        name: &str,
    ) -> Vec<Uuid> {
        items
            .into_iter()
            .filter(|(_, item_name)| item_name.eq_ignore_ascii_case(name))
            .map(|(id, _)| id)
            .collect()
    }

    fn resolve_tag_filters(
        tag_id: Option<Uuid>,
        matching_tag_ids: Option<Vec<Uuid>>,
    ) -> (Option<Uuid>, Option<Vec<Uuid>>, bool) {
        match (tag_id, matching_tag_ids) {
            (Some(tag_id), Some(matching_tag_ids)) => {
                if matching_tag_ids.contains(&tag_id) {
                    (Some(tag_id), None, false)
                } else {
                    (None, None, true)
                }
            }
            (None, Some(matching_tag_ids)) => {
                let missing_tag_name_match = matching_tag_ids.is_empty();
                (
                    None,
                    (!missing_tag_name_match).then_some(matching_tag_ids),
                    missing_tag_name_match,
                )
            }
            (Some(tag_id), None) => (Some(tag_id), None, false),
            (None, None) => (None, None, false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_all_matching_status_ids_case_insensitively() {
        let first_id = Uuid::new_v4();
        let second_id = Uuid::new_v4();
        let statuses = [
            (first_id, "In Progress"),
            (second_id, "in progress"),
            (Uuid::new_v4(), "Todo"),
        ];

        assert_eq!(
            McpServer::matching_ids_by_name(statuses, "IN PROGRESS"),
            vec![first_id, second_id]
        );
    }

    #[test]
    fn collects_all_matching_tag_ids_case_insensitively() {
        let first_id = Uuid::new_v4();
        let second_id = Uuid::new_v4();
        let tags = [
            (first_id, "bug"),
            (second_id, "Bug"),
            (Uuid::new_v4(), "feature"),
        ];

        assert_eq!(
            McpServer::matching_ids_by_name(tags, "BUG"),
            vec![first_id, second_id]
        );
    }

    #[test]
    fn resolve_tag_filters_requires_explicit_tag_id_to_match_tag_name() {
        let tag_id = Uuid::new_v4();
        let other_tag_id = Uuid::new_v4();

        assert_eq!(
            McpServer::resolve_tag_filters(Some(tag_id), Some(vec![other_tag_id])),
            (None, None, true)
        );
    }

    #[test]
    fn resolve_tag_filters_preserves_exact_tag_id_intersection() {
        let tag_id = Uuid::new_v4();
        let other_tag_id = Uuid::new_v4();

        assert_eq!(
            McpServer::resolve_tag_filters(Some(tag_id), Some(vec![other_tag_id, tag_id])),
            (Some(tag_id), None, false)
        );
    }
}
