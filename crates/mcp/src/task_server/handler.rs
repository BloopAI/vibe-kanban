use rmcp::{
    ServerHandler,
    model::{Implementation, ProtocolVersion, ServerCapabilities, ServerInfo},
    tool_handler,
};

use super::TaskServer;

#[tool_handler]
impl ServerHandler for TaskServer {
    fn get_info(&self) -> ServerInfo {
        let mut instruction = "A task and project/workspace management server. Use list tools first to discover IDs, then call mutation tools with those IDs. TOOLS: 'list_workspaces', 'update_workspace', 'delete_workspace', 'list_organizations', 'list_org_members', 'list_projects', 'list_issue_priorities', 'list_issues', 'create_issue', 'get_issue', 'update_issue', 'delete_issue', 'list_issue_assignees', 'assign_issue', 'unassign_issue', 'list_tags', 'list_issue_tags', 'add_issue_tag', 'remove_issue_tag', 'create_issue_relationship', 'delete_issue_relationship', 'start_workspace_session', 'link_workspace', 'list_repos', 'get_repo', 'update_setup_script', 'update_cleanup_script', 'update_dev_server_script'. Issues have a simple_id (e.g. 'PROJ-42') for human-readable reference. get_issue returns embedded tags, relationships, and sub-issues.".to_string();
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
