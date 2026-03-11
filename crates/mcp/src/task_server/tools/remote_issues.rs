use std::collections::HashMap;

use api_types::{
    CreateIssueRequest, Issue, IssuePriority, IssueRelationshipType, IssueSortField,
    ListIssueRelationshipsResponse, ListIssueTagsResponse, ListIssuesQuery, ListIssuesResponse,
    ListPullRequestsResponse, ListTagsResponse, MutationResponse, PullRequestStatus, SortDirection,
    UpdateIssueRequest,
};
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::McpServer;

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

        let priority = match priority {
            Some(p) => match Self::parse_issue_priority(&p) {
                Ok(priority) => Some(priority),
                Err(e) => return Ok(e),
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
                Err(e) => return Ok(e),
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
            Err(e) => return Ok(e),
        };

        let project_statuses = match self.fetch_project_statuses(project_id).await {
            Ok(statuses) => Some(statuses),
            Err(e) => {
                if status.is_some() {
                    return Ok(e);
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

        let status_filter_provided = status.is_some();
        let tag_filter_provided = tag_id.is_some() || tag_name.is_some();

        let status_id = match status {
            Some(status) => match Uuid::parse_str(&status) {
                Ok(status_id) => Some(Some(status_id)),
                Err(_) => match self.find_status_id_by_name(project_id, &status).await {
                    Ok(status_id) => Some(status_id),
                    Err(e) => return Ok(e),
                },
            },
            None => None,
        };

        let priority = match priority {
            Some(priority) => match Self::parse_issue_priority(&priority) {
                Ok(priority) => Some(priority),
                Err(e) => return Ok(e),
            },
            None => None,
        };

        let sort_field = match Self::parse_issue_sort_field(sort_field.as_deref()) {
            Ok(value) => Some(value),
            Err(e) => return Ok(e),
        };
        let sort_direction = match Self::parse_sort_direction(sort_direction.as_deref()) {
            Ok(value) => Some(value),
            Err(e) => return Ok(e),
        };

        let resolved_tag_id = match (tag_id, tag_name) {
            (Some(tag_id), Some(tag_name)) => {
                let resolved_tag_id = match self.find_tag_id_by_name(project_id, &tag_name).await {
                    Ok(tag_id) => tag_id,
                    Err(e) => return Ok(e),
                };
                if resolved_tag_id != Some(tag_id) {
                    None
                } else {
                    Some(Some(tag_id))
                }
            }
            (Some(tag_id), None) => Some(Some(tag_id)),
            (None, Some(tag_name)) => match self.find_tag_id_by_name(project_id, &tag_name).await {
                Ok(tag_id) => Some(tag_id),
                Err(e) => return Ok(e),
            },
            (None, None) => Some(None),
        };

        let response = if (status_filter_provided && status_id.flatten().is_none())
            || (tag_filter_provided && resolved_tag_id.flatten().is_none())
            || resolved_tag_id.is_none()
        {
            ListIssuesResponse {
                issues: Vec::new(),
                total_count: 0,
                limit: limit.unwrap_or(50).max(0) as usize,
                offset: offset.unwrap_or(0).max(0) as usize,
            }
        } else if let Some(tag_id) = resolved_tag_id {
            let query = ListIssuesQuery {
                project_id,
                status_id: status_id.flatten(),
                priority,
                parent_issue_id,
                search,
                simple_id,
                assignee_user_id,
                tag_id,
                sort_field,
                sort_direction,
                limit: Some(limit.unwrap_or(50).max(0)),
                offset: Some(offset.unwrap_or(0).max(0)),
            };
            let url = self.url("/api/remote/issues");
            match self.send_json(self.client.get(&url).query(&query)).await {
                Ok(r) => r,
                Err(e) => return Ok(e),
            }
        } else {
            unreachable!()
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
            Err(e) => return Ok(e),
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

        let priority = if let Some(priority) = priority {
            match Self::parse_issue_priority(&priority) {
                Ok(parsed) => Some(Some(parsed)),
                Err(e) => return Ok(e),
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
                Err(e) => return Ok(e),
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
            return Ok(e);
        }

        McpServer::success(&McpDeleteIssueResponse {
            deleted_issue_id: Some(issue_id.to_string()),
        })
    }
}

impl McpServer {
    fn parse_issue_sort_field(sort_field: Option<&str>) -> Result<IssueSortField, CallToolResult> {
        match sort_field.unwrap_or("sort_order").trim().to_ascii_lowercase().as_str() {
            "sort_order" => Ok(IssueSortField::SortOrder),
            "priority" => Ok(IssueSortField::Priority),
            "created_at" => Ok(IssueSortField::CreatedAt),
            "updated_at" => Ok(IssueSortField::UpdatedAt),
            "title" => Ok(IssueSortField::Title),
            other => Err(Self::err(
                format!(
                    "Unknown sort_field '{}'. Allowed values: ['sort_order', 'priority', 'created_at', 'updated_at', 'title']",
                    other
                ),
                None::<String>,
            )
            .unwrap()),
        }
    }

    fn parse_sort_direction(sort_direction: Option<&str>) -> Result<SortDirection, CallToolResult> {
        match sort_direction
            .unwrap_or("asc")
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "asc" => Ok(SortDirection::Asc),
            "desc" => Ok(SortDirection::Desc),
            other => Err(Self::err(
                format!(
                    "Unknown sort_direction '{}'. Allowed values: ['asc', 'desc']",
                    other
                ),
                None::<String>,
            )
            .unwrap()),
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

    fn parse_issue_priority(priority: &str) -> Result<IssuePriority, CallToolResult> {
        match priority.trim().to_ascii_lowercase().as_str() {
            "urgent" => Ok(IssuePriority::Urgent),
            "high" => Ok(IssuePriority::High),
            "medium" => Ok(IssuePriority::Medium),
            "low" => Ok(IssuePriority::Low),
            _ => Err(Self::err(
                format!(
                    "Unknown priority '{}'. Allowed values: ['urgent', 'high', 'medium', 'low']",
                    priority
                ),
                None::<String>,
            )
            .unwrap()),
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

    async fn find_status_id_by_name(
        &self,
        project_id: Uuid,
        status_name: &str,
    ) -> Result<Option<Uuid>, CallToolResult> {
        let statuses = self.fetch_project_statuses(project_id).await?;
        Ok(statuses
            .iter()
            .find(|status| status.name.eq_ignore_ascii_case(status_name))
            .map(|status| status.id))
    }

    async fn find_tag_id_by_name(
        &self,
        project_id: Uuid,
        tag_name: &str,
    ) -> Result<Option<Uuid>, CallToolResult> {
        let url = self.url(&format!("/api/remote/tags?project_id={}", project_id));
        let tags: ListTagsResponse = self.send_json(self.client.get(&url)).await?;
        Ok(tags
            .tags
            .into_iter()
            .find(|tag| tag.name.eq_ignore_ascii_case(tag_name))
            .map(|tag| tag.id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_default_issue_sort_field() {
        assert_eq!(
            McpServer::parse_issue_sort_field(None).unwrap(),
            IssueSortField::SortOrder
        );
    }

    #[test]
    fn rejects_invalid_sort_direction() {
        assert!(McpServer::parse_sort_direction(Some("sideways")).is_err());
    }
}
