use api_types::ListOrganizationsResponse;
use rmcp::{ErrorData, model::CallToolResult, schemars, tool, tool_router};
use serde::Serialize;

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
}
