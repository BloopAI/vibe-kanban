use rmcp::{
    ServerHandler,
    model::{Implementation, ProtocolVersion, ServerCapabilities, ServerInfo},
    tool_handler,
};

use super::TaskServer;

#[tool_handler]
impl ServerHandler for TaskServer {
    fn get_info(&self) -> ServerInfo {
        let mut instruction = "A task and project management server. If you need to create or update tickets or issues then use these tools. Most of them absolutely require that you pass the `project_id` of the project that you are currently working on. You can get project ids by using `list projects`. Call `list_issues` to fetch the `issue_ids` of all the issues in a project. TOOLS: 'list_organizations', 'list_projects', 'list_issues', 'create_issue', 'start_workspace_session', 'get_issue', 'update_issue', 'delete_issue', 'list_repos', 'get_repo', 'update_setup_script', 'update_cleanup_script', 'update_dev_server_script'. Make sure to pass `project_id`, `issue_id`, or `repo_id` where required. You can use list tools to get the available ids.".to_string();
        if self.context.is_some() {
            let context_instruction = "Use 'get_context' to fetch project/issue/workspace metadata for the active Vibe Kanban workspace session when available.";
            instruction = format!("{} {}", context_instruction, instruction);
        }

        ServerInfo {
            protocol_version: ProtocolVersion::V_2025_03_26,
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: "vibe-kanban".to_string(),
                version: "1.0.0".to_string(),
            },
            instructions: Some(instruction),
        }
    }
}
