use db::models::repo::Repo;
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpRepoSummary {
    #[schemars(description = "The unique identifier of the repository")]
    id: String,
    #[schemars(description = "The name of the repository")]
    name: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetRepoRequest {
    #[schemars(description = "The ID of the repository to retrieve")]
    repo_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct RepoDetails {
    #[schemars(description = "The unique identifier of the repository")]
    id: String,
    #[schemars(description = "The name of the repository")]
    name: String,
    #[schemars(description = "The display name of the repository")]
    display_name: String,
    #[schemars(description = "The setup script that runs when initializing a workspace")]
    setup_script: Option<String>,
    #[schemars(description = "The cleanup script that runs when tearing down a workspace")]
    cleanup_script: Option<String>,
    #[schemars(description = "The dev server script that starts the development server")]
    dev_server_script: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateSetupScriptRequest {
    #[schemars(description = "The ID of the repository to update")]
    repo_id: Uuid,
    #[schemars(description = "The new setup script content (use empty string to clear)")]
    script: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateCleanupScriptRequest {
    #[schemars(description = "The ID of the repository to update")]
    repo_id: Uuid,
    #[schemars(description = "The new cleanup script content (use empty string to clear)")]
    script: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateDevServerScriptRequest {
    #[schemars(description = "The ID of the repository to update")]
    repo_id: Uuid,
    #[schemars(description = "The new dev server script content (use empty string to clear)")]
    script: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct UpdateRepoScriptResponse {
    #[schemars(description = "Whether the update was successful")]
    success: bool,
    #[schemars(description = "The repository ID that was updated")]
    repo_id: String,
    #[schemars(description = "The script field that was updated")]
    field: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ListReposResponse {
    repos: Vec<McpRepoSummary>,
    count: usize,
}

#[tool_router(router = repos_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(description = "List all repositories.")]
    async fn list_repos(&self) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/repos");
        let repos: Vec<Repo> = match self.send_json(self.client.get(&url)).await {
            Ok(rs) => rs,
            Err(e) => return Ok(e),
        };

        let repo_summaries: Vec<McpRepoSummary> = repos
            .into_iter()
            .map(|r| McpRepoSummary {
                id: r.id.to_string(),
                name: r.name,
            })
            .collect();

        let response = ListReposResponse {
            count: repo_summaries.len(),
            repos: repo_summaries,
        };

        TaskServer::success(&response)
    }

    #[tool(
        description = "Get detailed information about a repository including its scripts. Use `list_repos` to find available repo IDs."
    )]
    async fn get_repo(
        &self,
        Parameters(GetRepoRequest { repo_id }): Parameters<GetRepoRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/repos/{}", repo_id));
        let repo: Repo = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };
        TaskServer::success(&RepoDetails {
            id: repo.id.to_string(),
            name: repo.name,
            display_name: repo.display_name,
            setup_script: repo.setup_script,
            cleanup_script: repo.cleanup_script,
            dev_server_script: repo.dev_server_script,
        })
    }

    #[tool(
        description = "Update a repository's setup script. The setup script runs when initializing a workspace."
    )]
    async fn update_setup_script(
        &self,
        Parameters(UpdateSetupScriptRequest { repo_id, script }): Parameters<
            UpdateSetupScriptRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/repos/{}", repo_id));
        let script_value = if script.is_empty() {
            None
        } else {
            Some(script)
        };
        let payload = serde_json::json!({
            "setup_script": script_value
        });
        let _repo: Repo = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };
        TaskServer::success(&UpdateRepoScriptResponse {
            success: true,
            repo_id: repo_id.to_string(),
            field: "setup_script".to_string(),
        })
    }

    #[tool(
        description = "Update a repository's cleanup script. The cleanup script runs when tearing down a workspace."
    )]
    async fn update_cleanup_script(
        &self,
        Parameters(UpdateCleanupScriptRequest { repo_id, script }): Parameters<
            UpdateCleanupScriptRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/repos/{}", repo_id));
        let script_value = if script.is_empty() {
            None
        } else {
            Some(script)
        };
        let payload = serde_json::json!({
            "cleanup_script": script_value
        });
        let _repo: Repo = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };
        TaskServer::success(&UpdateRepoScriptResponse {
            success: true,
            repo_id: repo_id.to_string(),
            field: "cleanup_script".to_string(),
        })
    }

    #[tool(
        description = "Update a repository's dev server script. The dev server script starts the development server for the repository."
    )]
    async fn update_dev_server_script(
        &self,
        Parameters(UpdateDevServerScriptRequest { repo_id, script }): Parameters<
            UpdateDevServerScriptRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/repos/{}", repo_id));
        let script_value = if script.is_empty() {
            None
        } else {
            Some(script)
        };
        let payload = serde_json::json!({
            "dev_server_script": script_value
        });
        let _repo: Repo = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };
        TaskServer::success(&UpdateRepoScriptResponse {
            success: true,
            repo_id: repo_id.to_string(),
            field: "dev_server_script".to_string(),
        })
    }
}
