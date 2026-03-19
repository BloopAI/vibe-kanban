use std::collections::HashMap;

use api_types::{
    Issue, IssuePriority, ListIssuesResponse, ListMembersResponse, ListOrganizationsResponse,
    ListProjectsResponse, MemberRole, OrganizationMemberWithProfile, SearchIssuesRequest,
};
use axum::http::request::Parts;
use rmcp::{
    ErrorData,
    handler::server::{common::Extension, tool::ToolRouter, wrapper::Parameters},
    model::CallToolResult,
    schemars, tool, tool_router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::RequestContext,
    db::{
        issues::IssueRepository, organization_members, organizations::OrganizationRepository,
        project_statuses::ProjectStatusRepository, projects::ProjectRepository,
    },
    mcp::handler::RemoteMcpServer,
};

#[derive(Debug, Clone, sqlx::FromRow)]
struct OrganizationMemberRow {
    user_id: Uuid,
    role: MemberRole,
    joined_at: chrono::DateTime<chrono::Utc>,
    first_name: Option<String>,
    last_name: Option<String>,
    username: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

impl RemoteMcpServer {
    pub fn build_router() -> ToolRouter<Self> {
        Self::organization_tools_router() + Self::project_issue_tools_router()
    }

    fn request_context(parts: &Parts) -> Result<RequestContext, ErrorData> {
        parts
            .extensions
            .get::<RequestContext>()
            .cloned()
            .ok_or_else(|| ErrorData::internal_error("missing authenticated request context", None))
    }

    fn success<T: Serialize>(value: &T) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::success(vec![rmcp::model::Content::text(
            serde_json::to_string_pretty(value).unwrap_or_else(|_| "{}".to_string()),
        )]))
    }

    fn tool_error(message: impl Into<String>) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::error(vec![rmcp::model::Content::text(
            serde_json::json!({
                "success": false,
                "error": message.into(),
            })
            .to_string(),
        )]))
    }

    async fn list_members_for_org(
        pool: &PgPool,
        organization_id: Uuid,
    ) -> Result<ListMembersResponse, sqlx::Error> {
        let members = sqlx::query_as::<_, OrganizationMemberRow>(
            r#"
            SELECT
                omm.user_id,
                omm.role,
                omm.joined_at,
                u.first_name,
                u.last_name,
                u.username,
                u.email,
                oa.avatar_url
            FROM organization_member_metadata omm
            INNER JOIN users u ON omm.user_id = u.id
            LEFT JOIN LATERAL (
                SELECT avatar_url
                FROM oauth_accounts
                WHERE user_id = omm.user_id
                ORDER BY created_at ASC
                LIMIT 1
            ) oa ON true
            WHERE omm.organization_id = $1
            ORDER BY omm.joined_at ASC
            "#,
        )
        .bind(organization_id)
        .fetch_all(pool)
        .await?;

        Ok(ListMembersResponse {
            members: members
                .into_iter()
                .map(|member| OrganizationMemberWithProfile {
                    user_id: member.user_id,
                    role: member.role,
                    joined_at: member.joined_at,
                    first_name: member.first_name,
                    last_name: member.last_name,
                    username: member.username,
                    email: member.email,
                    avatar_url: member.avatar_url,
                })
                .collect(),
        })
    }

    async fn project_status_map(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<HashMap<Uuid, String>, ErrorData> {
        let statuses = ProjectStatusRepository::list_by_project(pool, project_id)
            .await
            .map_err(|error| ErrorData::internal_error(error.to_string(), None))?;
        Ok(statuses
            .into_iter()
            .map(|status| (status.id, status.name))
            .collect())
    }
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct OrganizationSummary {
    id: String,
    name: String,
    slug: String,
    is_personal: bool,
    role: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListOrganizationsResponse {
    organizations: Vec<OrganizationSummary>,
    count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListOrgMembersRequest {
    #[schemars(description = "The organization ID to list members from")]
    organization_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct OrganizationMemberSummary {
    user_id: String,
    role: String,
    joined_at: String,
    first_name: Option<String>,
    last_name: Option<String>,
    username: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListOrgMembersResponse {
    organization_id: String,
    members: Vec<OrganizationMemberSummary>,
    count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListProjectsRequest {
    #[schemars(description = "The ID of the organization to list projects from")]
    organization_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ProjectSummary {
    id: String,
    organization_id: String,
    name: String,
    color: String,
    sort_order: i32,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListProjectsResponse {
    organization_id: String,
    projects: Vec<ProjectSummary>,
    count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListIssuesRequest {
    #[schemars(description = "The ID of the project to list issues from")]
    project_id: Uuid,
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
    #[schemars(
        description = "Field to sort by. Allowed values: 'sort_order', 'priority', 'created_at', 'updated_at', 'title'."
    )]
    sort_field: Option<String>,
    #[schemars(description = "Sort direction. Allowed values: 'asc', 'desc'.")]
    sort_direction: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpGetIssueRequest {
    #[schemars(description = "The ID of the issue to retrieve")]
    issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct IssueSummary {
    id: String,
    project_id: String,
    simple_id: String,
    title: String,
    status: String,
    priority: Option<String>,
    parent_issue_id: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListIssuesResponse {
    project_id: String,
    total_count: usize,
    returned_count: usize,
    limit: usize,
    offset: usize,
    issues: Vec<IssueSummary>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct IssueDetails {
    id: String,
    project_id: String,
    simple_id: String,
    title: String,
    description: Option<String>,
    status: String,
    status_id: String,
    priority: Option<String>,
    parent_issue_id: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpGetIssueResponse {
    issue: IssueDetails,
}

#[tool_router(router = organization_tools_router, vis = "pub")]
impl RemoteMcpServer {
    #[tool(description = "List all organizations visible to the authenticated user")]
    async fn list_organizations(
        &self,
        Extension(parts): Extension<Parts>,
    ) -> Result<CallToolResult, ErrorData> {
        let ctx = Self::request_context(&parts)?;
        let response: ListOrganizationsResponse = OrganizationRepository::new(self.pool())
            .list_user_organizations(ctx.user.id)
            .await
            .map(|organizations| ListOrganizationsResponse { organizations })
            .map_err(|error| ErrorData::internal_error(error.to_string(), None))?;

        let organizations = response
            .organizations
            .into_iter()
            .map(|organization| OrganizationSummary {
                id: organization.id.to_string(),
                name: organization.name,
                slug: organization.slug,
                is_personal: organization.is_personal,
                role: format!("{:?}", organization.user_role).to_uppercase(),
            })
            .collect::<Vec<_>>();

        Self::success(&McpListOrganizationsResponse {
            count: organizations.len(),
            organizations,
        })
    }

    #[tool(description = "List members of an organization the authenticated user belongs to")]
    async fn list_org_members(
        &self,
        Extension(parts): Extension<Parts>,
        Parameters(McpListOrgMembersRequest { organization_id }): Parameters<
            McpListOrgMembersRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let ctx = Self::request_context(&parts)?;
        organization_members::assert_membership(self.pool(), organization_id, ctx.user.id)
            .await
            .map_err(|_| ErrorData::invalid_params("organization not accessible", None))?;

        let members = Self::list_members_for_org(self.pool(), organization_id)
            .await
            .map_err(|error| ErrorData::internal_error(error.to_string(), None))?;

        let summaries = members
            .members
            .into_iter()
            .map(|member| OrganizationMemberSummary {
                user_id: member.user_id.to_string(),
                role: format!("{:?}", member.role).to_uppercase(),
                joined_at: member.joined_at.to_rfc3339(),
                first_name: member.first_name,
                last_name: member.last_name,
                username: member.username,
                email: member.email,
                avatar_url: member.avatar_url,
            })
            .collect::<Vec<_>>();

        Self::success(&McpListOrgMembersResponse {
            organization_id: organization_id.to_string(),
            count: summaries.len(),
            members: summaries,
        })
    }
}

#[tool_router(router = project_issue_tools_router, vis = "pub")]
impl RemoteMcpServer {
    #[tool(description = "List projects in an organization the authenticated user belongs to")]
    async fn list_projects(
        &self,
        Extension(parts): Extension<Parts>,
        Parameters(McpListProjectsRequest { organization_id }): Parameters<McpListProjectsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let ctx = Self::request_context(&parts)?;
        organization_members::assert_membership(self.pool(), organization_id, ctx.user.id)
            .await
            .map_err(|_| ErrorData::invalid_params("organization not accessible", None))?;

        let response: ListProjectsResponse =
            ProjectRepository::list_by_organization(self.pool(), organization_id)
                .await
                .map(|projects| ListProjectsResponse { projects })
                .map_err(|error| ErrorData::internal_error(error.to_string(), None))?;

        let projects = response
            .projects
            .into_iter()
            .map(|project| ProjectSummary {
                id: project.id.to_string(),
                organization_id: project.organization_id.to_string(),
                name: project.name,
                color: project.color,
                sort_order: project.sort_order,
                created_at: project.created_at.to_rfc3339(),
                updated_at: project.updated_at.to_rfc3339(),
            })
            .collect::<Vec<_>>();

        Self::success(&McpListProjectsResponse {
            organization_id: organization_id.to_string(),
            count: projects.len(),
            projects,
        })
    }

    #[tool(description = "List issues in a project the authenticated user can access")]
    async fn list_issues(
        &self,
        Extension(parts): Extension<Parts>,
        Parameters(params): Parameters<McpListIssuesRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let ctx = Self::request_context(&parts)?;
        organization_members::assert_project_access(self.pool(), params.project_id, ctx.user.id)
            .await
            .map_err(|_| ErrorData::invalid_params("project not accessible", None))?;

        let status_id = if let Some(status_name) = params.status.as_deref() {
            let status =
                ProjectStatusRepository::find_by_name(self.pool(), params.project_id, status_name)
                    .await
                    .map_err(|error| ErrorData::internal_error(error.to_string(), None))?;
            match status {
                Some(status) => Some(status.id),
                None => return Self::tool_error(format!("status `{status_name}` not found")),
            }
        } else {
            None
        };

        let priority = match params.priority.as_deref() {
            Some(value) => Some(parse_issue_priority(value)?),
            None => None,
        };

        let query = SearchIssuesRequest {
            project_id: params.project_id,
            status_id,
            status_ids: None,
            priority,
            parent_issue_id: params.parent_issue_id,
            search: params.search,
            simple_id: params.simple_id,
            assignee_user_id: params.assignee_user_id,
            tag_id: params.tag_id,
            tag_ids: None,
            sort_field: parse_issue_sort_field(params.sort_field.as_deref())?,
            sort_direction: parse_sort_direction(params.sort_direction.as_deref())?,
            limit: params.limit,
            offset: params.offset,
        };

        let response: ListIssuesResponse = IssueRepository::search(self.pool(), &query)
            .await
            .map_err(|error| ErrorData::internal_error(error.to_string(), None))?;
        let statuses = Self::project_status_map(self.pool(), params.project_id).await?;

        let issues = response
            .issues
            .into_iter()
            .map(|issue| issue_summary(issue, &statuses))
            .collect::<Vec<_>>();

        Self::success(&McpListIssuesResponse {
            project_id: params.project_id.to_string(),
            total_count: response.total_count,
            returned_count: issues.len(),
            limit: response.limit,
            offset: response.offset,
            issues,
        })
    }

    #[tool(description = "Get a single issue the authenticated user can access")]
    async fn get_issue(
        &self,
        Extension(parts): Extension<Parts>,
        Parameters(McpGetIssueRequest { issue_id }): Parameters<McpGetIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let ctx = Self::request_context(&parts)?;
        let issue = IssueRepository::find_by_id(self.pool(), issue_id)
            .await
            .map_err(|error| ErrorData::internal_error(error.to_string(), None))?
            .ok_or_else(|| ErrorData::invalid_params("issue not found", None))?;

        organization_members::assert_project_access(self.pool(), issue.project_id, ctx.user.id)
            .await
            .map_err(|_| ErrorData::invalid_params("issue not accessible", None))?;

        let statuses = Self::project_status_map(self.pool(), issue.project_id).await?;
        Self::success(&McpGetIssueResponse {
            issue: issue_details(issue, &statuses),
        })
    }
}

fn issue_summary(issue: Issue, statuses: &HashMap<Uuid, String>) -> IssueSummary {
    IssueSummary {
        id: issue.id.to_string(),
        project_id: issue.project_id.to_string(),
        simple_id: issue.simple_id,
        title: issue.title,
        status: statuses
            .get(&issue.status_id)
            .cloned()
            .unwrap_or_else(|| issue.status_id.to_string()),
        priority: issue
            .priority
            .map(|priority| format!("{priority:?}").to_lowercase()),
        parent_issue_id: issue.parent_issue_id.map(|id| id.to_string()),
        created_at: issue.created_at.to_rfc3339(),
        updated_at: issue.updated_at.to_rfc3339(),
    }
}

fn issue_details(issue: Issue, statuses: &HashMap<Uuid, String>) -> IssueDetails {
    IssueDetails {
        id: issue.id.to_string(),
        project_id: issue.project_id.to_string(),
        simple_id: issue.simple_id,
        title: issue.title,
        description: issue.description,
        status: statuses
            .get(&issue.status_id)
            .cloned()
            .unwrap_or_else(|| issue.status_id.to_string()),
        status_id: issue.status_id.to_string(),
        priority: issue
            .priority
            .map(|priority| format!("{priority:?}").to_lowercase()),
        parent_issue_id: issue.parent_issue_id.map(|id| id.to_string()),
        created_at: issue.created_at.to_rfc3339(),
        updated_at: issue.updated_at.to_rfc3339(),
    }
}

fn parse_issue_priority(value: &str) -> Result<IssuePriority, ErrorData> {
    match value.to_ascii_lowercase().as_str() {
        "urgent" => Ok(IssuePriority::Urgent),
        "high" => Ok(IssuePriority::High),
        "medium" => Ok(IssuePriority::Medium),
        "low" => Ok(IssuePriority::Low),
        _ => Err(ErrorData::invalid_params(
            format!("invalid issue priority `{value}`"),
            None,
        )),
    }
}

fn parse_issue_sort_field(
    value: Option<&str>,
) -> Result<Option<api_types::IssueSortField>, ErrorData> {
    let Some(value) = value else {
        return Ok(None);
    };

    match value.to_ascii_lowercase().as_str() {
        "sort_order" => Ok(Some(api_types::IssueSortField::SortOrder)),
        "priority" => Ok(Some(api_types::IssueSortField::Priority)),
        "created_at" => Ok(Some(api_types::IssueSortField::CreatedAt)),
        "updated_at" => Ok(Some(api_types::IssueSortField::UpdatedAt)),
        "title" => Ok(Some(api_types::IssueSortField::Title)),
        _ => Err(ErrorData::invalid_params(
            format!("invalid issue sort field `{value}`"),
            None,
        )),
    }
}

fn parse_sort_direction(
    value: Option<&str>,
) -> Result<Option<api_types::SortDirection>, ErrorData> {
    let Some(value) = value else {
        return Ok(None);
    };

    match value.to_ascii_lowercase().as_str() {
        "asc" => Ok(Some(api_types::SortDirection::Asc)),
        "desc" => Ok(Some(api_types::SortDirection::Desc)),
        _ => Err(ErrorData::invalid_params(
            format!("invalid sort direction `{value}`"),
            None,
        )),
    }
}
