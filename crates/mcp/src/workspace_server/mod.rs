mod handler;
mod tools;

use rmcp::handler::server::tool::ToolRouter;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct ApiResponseEnvelope<T> {
    success: bool,
    data: Option<T>,
    message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct WorkspaceServer {
    client: reqwest::Client,
    base_url: String,
    workspace_id: Uuid,
    attached_session_id: Option<Uuid>,
    tool_router: ToolRouter<WorkspaceServer>,
}

impl WorkspaceServer {
    pub fn new(base_url: &str, workspace_id: Uuid, attached_session_id: Option<Uuid>) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.to_string(),
            workspace_id,
            attached_session_id,
            tool_router: Self::workspace_tools_router(),
        }
    }

    fn url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }
}
