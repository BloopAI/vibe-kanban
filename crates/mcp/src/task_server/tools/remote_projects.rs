use api_types::{ListProjectsResponse, McpListProjectsResponse, McpProjectSummary};
use rmcp::{
    ErrorData, handler::server::wrapper::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::Deserialize;
use uuid::Uuid;

use super::McpServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListProjectsRequest {
    #[schemars(description = "The ID of the organization to list projects from")]
    organization_id: Uuid,
}

#[tool_router(router = remote_projects_tools_router, vis = "pub")]
impl McpServer {
    #[tool(description = "List all the available projects")]
    async fn list_projects(
        &self,
        Parameters(McpListProjectsRequest { organization_id }): Parameters<McpListProjectsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!(
            "/api/remote/projects?organization_id={}",
            organization_id
        ));
        let response: ListProjectsResponse = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let projects: Vec<_> = response
            .projects
            .into_iter()
            .map(McpProjectSummary::from_project)
            .collect();

        McpServer::success(&McpListProjectsResponse {
            organization_id: organization_id.to_string(),
            count: projects.len(),
            projects,
        })
    }
}
