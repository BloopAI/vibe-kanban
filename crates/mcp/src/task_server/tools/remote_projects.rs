use api_types::ListProjectsResponse;
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListProjectsRequest {
    #[schemars(description = "The ID of the organization to list projects from")]
    organization_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ProjectSummary {
    #[schemars(description = "The unique identifier of the project")]
    id: String,
    #[schemars(description = "The name of the project")]
    name: String,
    #[schemars(description = "When the project was created")]
    created_at: String,
    #[schemars(description = "When the project was last updated")]
    updated_at: String,
}

impl ProjectSummary {
    fn from_remote_project(project: api_types::Project) -> Self {
        Self {
            id: project.id.to_string(),
            name: project.name,
            created_at: project.created_at.to_rfc3339(),
            updated_at: project.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListProjectsResponse {
    projects: Vec<ProjectSummary>,
    count: usize,
}

#[tool_router(router = remote_projects_tools_router, vis = "pub")]
impl TaskServer {
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

        let project_summaries: Vec<ProjectSummary> = response
            .projects
            .into_iter()
            .map(ProjectSummary::from_remote_project)
            .collect();

        TaskServer::success(&McpListProjectsResponse {
            count: project_summaries.len(),
            projects: project_summaries,
        })
    }
}
