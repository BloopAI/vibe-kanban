use api_types::{
    CreateIssueRelationshipRequest, IssueRelationship, IssueRelationshipType, MutationResponse,
};
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpCreateIssueRelationshipRequest {
    #[schemars(description = "The source issue ID")]
    issue_id: Uuid,
    #[schemars(description = "The related issue ID")]
    related_issue_id: Uuid,
    #[schemars(description = "Relationship type: 'blocking', 'related', or 'has_duplicate'")]
    relationship_type: IssueRelationshipType,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpCreateIssueRelationshipResponse {
    relationship_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpDeleteIssueRelationshipRequest {
    #[schemars(
        description = "The relationship ID to delete (from get_issue or create_issue_relationship)"
    )]
    relationship_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpDeleteIssueRelationshipResponse {
    success: bool,
    deleted_relationship_id: String,
}

#[tool_router(router = issue_relationships_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(
        description = "Create a relationship between two issues. Types: 'blocking', 'related', 'has_duplicate'."
    )]
    async fn create_issue_relationship(
        &self,
        Parameters(McpCreateIssueRelationshipRequest {
            issue_id,
            related_issue_id,
            relationship_type,
        }): Parameters<McpCreateIssueRelationshipRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let payload = CreateIssueRelationshipRequest {
            id: None,
            issue_id,
            related_issue_id,
            relationship_type,
        };

        let url = self.url("/api/remote/issue-relationships");
        let response: MutationResponse<IssueRelationship> =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(e),
            };

        TaskServer::success(&McpCreateIssueRelationshipResponse {
            relationship_id: response.data.id.to_string(),
        })
    }

    #[tool(description = "Delete a relationship between two issues.")]
    async fn delete_issue_relationship(
        &self,
        Parameters(McpDeleteIssueRelationshipRequest { relationship_id }): Parameters<
            McpDeleteIssueRelationshipRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!(
            "/api/remote/issue-relationships/{}",
            relationship_id
        ));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(e);
        }

        TaskServer::success(&McpDeleteIssueRelationshipResponse {
            success: true,
            deleted_relationship_id: relationship_id.to_string(),
        })
    }
}
