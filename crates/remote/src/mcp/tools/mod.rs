use std::collections::HashMap;

use api_types::{
    ListIssuesResponse, ListMembersResponse, ListOrganizationsResponse, ListProjectsResponse,
    McpIssueDetails, McpIssueSummary, McpListIssuesResponse, McpListOrgMembersResponse,
    McpListOrganizationsResponse, McpListProjectsResponse, McpOrganizationMemberSummary,
    McpOrganizationSummary, McpProjectSummary, MemberRole, OrganizationMemberWithProfile,
    SearchIssuesRequest,
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

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListOrgMembersRequest {
    #[schemars(description = "The organization ID to list members from")]
    organization_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListProjectsRequest {
    #[schemars(description = "The ID of the organization to list projects from")]
    organization_id: Uuid,
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
struct McpGetIssueResponse {
    issue: McpIssueDetails,
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

        let organizations: Vec<_> = response
            .organizations
            .into_iter()
            .map(McpOrganizationSummary::from_org_with_role)
            .collect();

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

        let summaries: Vec<_> = members
            .members
            .into_iter()
            .map(McpOrganizationMemberSummary::from_member_with_profile)
            .collect();

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

        let projects: Vec<_> = response
            .projects
            .into_iter()
            .map(McpProjectSummary::from_project)
            .collect();

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
            Some(value) => Some(api_types::mcp::parse_priority(value)
                .map_err(|msg| ErrorData::invalid_params(msg, None))?),
            None => None,
        };

        let sort_field = api_types::mcp::parse_sort_field(params.sort_field.as_deref())
            .map_err(|msg| ErrorData::invalid_params(msg, None))?;
        let sort_direction = api_types::mcp::parse_sort_direction(params.sort_direction.as_deref())
            .map_err(|msg| ErrorData::invalid_params(msg, None))?;

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
            sort_field,
            sort_direction,
            limit: params.limit,
            offset: params.offset,
        };

        let response: ListIssuesResponse = IssueRepository::search(self.pool(), &query)
            .await
            .map_err(|error| ErrorData::internal_error(error.to_string(), None))?;
        let statuses = Self::project_status_map(self.pool(), params.project_id).await?;

        let issues: Vec<_> = response
            .issues
            .into_iter()
            .map(|issue| {
                let status_name = api_types::mcp::resolve_status_name(issue.status_id, &statuses);
                McpIssueSummary::from_issue(issue, &status_name)
            })
            .collect();

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
        let status_name = api_types::mcp::resolve_status_name(issue.status_id, &statuses);
        Self::success(&McpGetIssueResponse {
            issue: McpIssueDetails::from_issue(issue, &status_name),
        })
    }
}

