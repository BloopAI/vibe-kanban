use api_types::{ListMembersResponse, ListOrganizationsResponse};
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct OrganizationSummary {
    #[schemars(description = "The unique identifier of the organization")]
    id: String,
    #[schemars(description = "The name of the organization")]
    name: String,
    #[schemars(description = "The slug of the organization")]
    slug: String,
    #[schemars(description = "Whether this is a personal organization")]
    is_personal: bool,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListOrganizationsResponse {
    organizations: Vec<OrganizationSummary>,
    count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListOrgMembersRequest {
    #[schemars(
        description = "The organization ID to list members from. Optional if running inside a workspace linked to a remote organization."
    )]
    organization_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct OrganizationMemberSummary {
    #[schemars(description = "The user ID of the organization member")]
    user_id: String,
    #[schemars(description = "The member role in the organization")]
    role: String,
    #[schemars(description = "When the member joined the organization")]
    joined_at: String,
    #[schemars(description = "Optional first name")]
    first_name: Option<String>,
    #[schemars(description = "Optional last name")]
    last_name: Option<String>,
    #[schemars(description = "Optional username")]
    username: Option<String>,
    #[schemars(description = "Optional email")]
    email: Option<String>,
    #[schemars(description = "Optional avatar URL")]
    avatar_url: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListOrgMembersResponse {
    organization_id: String,
    members: Vec<OrganizationMemberSummary>,
    count: usize,
}

#[tool_router(router = organizations_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(description = "List all the available organizations")]
    async fn list_organizations(&self) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/organizations");
        let response: ListOrganizationsResponse = match self.send_json(self.client.get(&url)).await
        {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let org_summaries: Vec<OrganizationSummary> = response
            .organizations
            .into_iter()
            .map(|o| OrganizationSummary {
                id: o.id.to_string(),
                name: o.name,
                slug: o.slug,
                is_personal: o.is_personal,
            })
            .collect();

        TaskServer::success(&McpListOrganizationsResponse {
            count: org_summaries.len(),
            organizations: org_summaries,
        })
    }

    #[tool(
        description = "List members of an organization. `organization_id` is optional if running inside a workspace linked to a remote organization."
    )]
    async fn list_org_members(
        &self,
        Parameters(McpListOrgMembersRequest { organization_id }): Parameters<
            McpListOrgMembersRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let organization_id = match self.resolve_organization_id(organization_id) {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let url = self.url(&format!("/api/organizations/{}/members", organization_id));
        let response: ListMembersResponse = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let members: Vec<OrganizationMemberSummary> = response
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
            .collect();

        TaskServer::success(&McpListOrgMembersResponse {
            organization_id: organization_id.to_string(),
            count: members.len(),
            members,
        })
    }
}
