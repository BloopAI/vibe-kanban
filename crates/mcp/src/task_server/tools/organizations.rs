use api_types::{
    ListMembersResponse, ListOrganizationsResponse, McpListOrgMembersResponse,
    McpListOrganizationsResponse, McpOrganizationMemberSummary, McpOrganizationSummary,
};
use rmcp::{
    ErrorData, handler::server::wrapper::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::Deserialize;
use uuid::Uuid;

use super::McpServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListOrgMembersRequest {
    #[schemars(
        description = "The organization ID to list members from. Optional if running inside a workspace linked to a remote organization."
    )]
    organization_id: Option<Uuid>,
}

#[tool_router(router = organizations_tools_router, vis = "pub")]
impl McpServer {
    #[tool(description = "List all the available organizations")]
    async fn list_organizations(&self) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/organizations");
        let response: ListOrganizationsResponse = match self.send_json(self.client.get(&url)).await
        {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let organizations: Vec<_> = response
            .organizations
            .into_iter()
            .map(McpOrganizationSummary::from_org_with_role)
            .collect();

        McpServer::success(&McpListOrganizationsResponse {
            count: organizations.len(),
            organizations,
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
            Err(e) => return Ok(*e),
        };

        let url = self.url(&format!("/api/organizations/{}/members", organization_id));
        let response: ListMembersResponse = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let members: Vec<_> = response
            .members
            .into_iter()
            .map(McpOrganizationMemberSummary::from_member_with_profile)
            .collect();

        McpServer::success(&McpListOrgMembersResponse {
            organization_id: organization_id.to_string(),
            count: members.len(),
            members,
        })
    }
}
