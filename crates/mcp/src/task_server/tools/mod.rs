use std::str::FromStr;

use api_types::{Issue, ListProjectStatusesResponse, ProjectStatus};
use db::models::{execution_process::ExecutionProcessStatus, tag::Tag};
use executors::executors::BaseCodingAgent;
use regex::Regex;
use rmcp::{
    ErrorData,
    model::{CallToolResult, Content},
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use uuid::Uuid;

use super::{ApiResponseEnvelope, McpMode, McpServer};

mod context;
mod issue_assignees;
mod issue_relationships;
mod issue_tags;
mod organizations;
mod remote_issues;
mod remote_projects;
mod repos;
mod sessions;
mod task_attempts;
mod workspaces;

impl McpServer {
    pub fn global_mode_router() -> rmcp::handler::server::tool::ToolRouter<Self> {
        Self::context_tools_router()
            + Self::workspaces_tools_router()
            + Self::organizations_tools_router()
            + Self::repos_tools_router()
            + Self::remote_projects_tools_router()
            + Self::remote_issues_tools_router()
            + Self::issue_assignees_tools_router()
            + Self::issue_tags_tools_router()
            + Self::issue_relationships_tools_router()
            + Self::task_attempts_tools_router()
            + Self::session_tools_router()
    }

    pub fn orchestrator_mode_router() -> rmcp::handler::server::tool::ToolRouter<Self> {
        let mut router = Self::context_tools_router()
            + Self::workspaces_tools_router()
            + Self::session_tools_router();
        router.remove_route::<(), ()>("list_workspaces");
        router.remove_route::<(), ()>("delete_workspace");
        router
    }
}

impl McpServer {
    fn attached_session_id(&self) -> Option<Uuid> {
        self.context
            .as_ref()
            .and_then(|ctx| ctx.session_id)
            .or_else(|| self.orchestrator_session.as_ref().map(|session| session.id))
    }

    fn scoped_workspace_id(&self) -> Option<Uuid> {
        self.context
            .as_ref()
            .map(|ctx| ctx.workspace_id)
            .or_else(|| {
                self.orchestrator_session
                    .as_ref()
                    .map(|session| session.workspace_id)
            })
    }

    fn success<T: Serialize>(data: &T) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(data)
                .unwrap_or_else(|_| "Failed to serialize response".to_string()),
        )]))
    }

    fn err_value(v: serde_json::Value) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::error(vec![Content::text(
            serde_json::to_string_pretty(&v)
                .unwrap_or_else(|_| "Failed to serialize error".to_string()),
        )]))
    }

    fn err<S: Into<String>>(msg: S, details: Option<S>) -> Result<CallToolResult, ErrorData> {
        let mut v = serde_json::json!({"success": false, "error": msg.into()});
        if let Some(d) = details {
            v["details"] = serde_json::json!(d.into());
        };
        Self::err_value(v)
    }

    async fn send_json<T: DeserializeOwned>(
        &self,
        rb: reqwest::RequestBuilder,
    ) -> Result<T, CallToolResult> {
        let resp = rb
            .send()
            .await
            .map_err(|e| Self::err("Failed to connect to VK API", Some(&e.to_string())).unwrap())?;

        if !resp.status().is_success() {
            let status = resp.status();
            return Err(
                Self::err(format!("VK API returned error status: {}", status), None).unwrap(),
            );
        }

        let api_response = resp.json::<ApiResponseEnvelope<T>>().await.map_err(|e| {
            Self::err("Failed to parse VK API response", Some(&e.to_string())).unwrap()
        })?;

        if !api_response.success {
            let msg = api_response.message.as_deref().unwrap_or("Unknown error");
            return Err(Self::err("VK API returned error", Some(msg)).unwrap());
        }

        api_response
            .data
            .ok_or_else(|| Self::err("VK API response missing data field", None).unwrap())
    }

    async fn send_empty_json(&self, rb: reqwest::RequestBuilder) -> Result<(), CallToolResult> {
        let resp = rb
            .send()
            .await
            .map_err(|e| Self::err("Failed to connect to VK API", Some(&e.to_string())).unwrap())?;

        if !resp.status().is_success() {
            let status = resp.status();
            return Err(
                Self::err(format!("VK API returned error status: {}", status), None).unwrap(),
            );
        }

        #[derive(Deserialize)]
        struct EmptyApiResponse {
            success: bool,
            message: Option<String>,
        }

        let api_response = resp.json::<EmptyApiResponse>().await.map_err(|e| {
            Self::err("Failed to parse VK API response", Some(&e.to_string())).unwrap()
        })?;

        if !api_response.success {
            let msg = api_response.message.as_deref().unwrap_or("Unknown error");
            return Err(Self::err("VK API returned error", Some(msg)).unwrap());
        }

        Ok(())
    }

    fn resolve_workspace_id(&self, explicit: Option<Uuid>) -> Result<Uuid, CallToolResult> {
        if let Some(id) = explicit {
            return Ok(id);
        }
        if let Some(workspace_id) = self.scoped_workspace_id() {
            return Ok(workspace_id);
        }
        Err(Self::err(
            "workspace_id is required (not available from current MCP context)",
            None::<&str>,
        )
        .unwrap())
    }

    fn scope_allows_workspace(&self, workspace_id: Uuid) -> Result<(), CallToolResult> {
        if matches!(self.mode(), McpMode::Orchestrator)
            && let Some(scoped_workspace_id) = self.scoped_workspace_id()
            && scoped_workspace_id != workspace_id
        {
            return Err(Self::err(
                "Operation is outside the configured workspace scope".to_string(),
                Some(format!(
                    "requested workspace_id={}, configured workspace_id={}",
                    workspace_id, scoped_workspace_id
                )),
            )
            .unwrap());
        }

        Ok(())
    }

    // Expands @tagname references in text by replacing them with tag content.
    async fn expand_tags(&self, text: &str) -> String {
        let tag_pattern = match Regex::new(r"@([^\s@]+)") {
            Ok(re) => re,
            Err(_) => return text.to_string(),
        };

        let tag_names: Vec<String> = tag_pattern
            .captures_iter(text)
            .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        if tag_names.is_empty() {
            return text.to_string();
        }

        let url = self.url("/api/tags");
        let tags: Vec<Tag> = match self.client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<ApiResponseEnvelope<Vec<Tag>>>().await {
                    Ok(envelope) if envelope.success => envelope.data.unwrap_or_default(),
                    _ => return text.to_string(),
                }
            }
            _ => return text.to_string(),
        };

        let tag_map: std::collections::HashMap<&str, &str> = tags
            .iter()
            .map(|t| (t.tag_name.as_str(), t.content.as_str()))
            .collect();

        let result = tag_pattern.replace_all(text, |caps: &regex::Captures| {
            let tag_name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            match tag_map.get(tag_name) {
                Some(content) => (*content).to_string(),
                None => caps.get(0).map(|m| m.as_str()).unwrap_or("").to_string(),
            }
        });

        result.into_owned()
    }

    // Resolves a project_id from an explicit parameter or falls back to context.
    fn resolve_project_id(&self, explicit: Option<Uuid>) -> Result<Uuid, CallToolResult> {
        if let Some(id) = explicit {
            return Ok(id);
        }
        if let Some(ctx) = &self.context
            && let Some(id) = ctx.project_id
        {
            return Ok(id);
        }
        Err(Self::err(
            "project_id is required (not available from workspace context)",
            None::<&str>,
        )
        .unwrap())
    }

    // Resolves an organization_id from an explicit parameter or falls back to context.
    fn resolve_organization_id(&self, explicit: Option<Uuid>) -> Result<Uuid, CallToolResult> {
        if let Some(id) = explicit {
            return Ok(id);
        }
        if let Some(ctx) = &self.context
            && let Some(id) = ctx.organization_id
        {
            return Ok(id);
        }
        Err(Self::err(
            "organization_id is required (not available from workspace context)",
            None::<&str>,
        )
        .unwrap())
    }

    // Fetches project statuses for a project.
    async fn fetch_project_statuses(
        &self,
        project_id: Uuid,
    ) -> Result<Vec<ProjectStatus>, CallToolResult> {
        let url = self.url(&format!(
            "/api/remote/project-statuses?project_id={}",
            project_id
        ));
        let response: ListProjectStatusesResponse = self.send_json(self.client.get(&url)).await?;
        Ok(response.project_statuses)
    }

    // Resolves a status name to status_id.
    async fn resolve_status_id(
        &self,
        project_id: Uuid,
        status_name: &str,
    ) -> Result<Uuid, CallToolResult> {
        let statuses = self.fetch_project_statuses(project_id).await?;
        statuses
            .iter()
            .find(|s| s.name.eq_ignore_ascii_case(status_name))
            .map(|s| s.id)
            .ok_or_else(|| {
                let available: Vec<&str> = statuses.iter().map(|s| s.name.as_str()).collect();
                Self::err(
                    format!(
                        "Unknown status '{}'. Available statuses: {:?}",
                        status_name, available
                    ),
                    None::<String>,
                )
                .unwrap()
            })
    }

    // Gets the default status_id for a project (first non-hidden status by sort_order).
    async fn default_status_id(&self, project_id: Uuid) -> Result<Uuid, CallToolResult> {
        let statuses = self.fetch_project_statuses(project_id).await?;
        statuses
            .iter()
            .filter(|s| !s.hidden)
            .min_by_key(|s| s.sort_order)
            .map(|s| s.id)
            .ok_or_else(|| {
                Self::err("No visible statuses found for project", None::<&str>).unwrap()
            })
    }

    // Resolves a status_id to its display name. Falls back to UUID string if lookup fails.
    async fn resolve_status_name(&self, project_id: Uuid, status_id: Uuid) -> String {
        match self.fetch_project_statuses(project_id).await {
            Ok(statuses) => statuses
                .iter()
                .find(|s| s.id == status_id)
                .map(|s| s.name.clone())
                .unwrap_or_else(|| status_id.to_string()),
            Err(_) => status_id.to_string(),
        }
    }

    // Links a workspace to a remote issue by fetching issue.project_id and calling link endpoint.
    async fn link_workspace_to_issue(
        &self,
        workspace_id: Uuid,
        issue_id: Uuid,
    ) -> Result<(), CallToolResult> {
        let issue_url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let issue: Issue = self.send_json(self.client.get(&issue_url)).await?;

        let link_url = self.url(&format!("/api/task-attempts/{}/link", workspace_id));
        let link_payload = serde_json::json!({
            "project_id": issue.project_id,
            "issue_id": issue_id,
        });
        self.send_empty_json(self.client.post(&link_url).json(&link_payload))
            .await
    }

    fn parse_executor_agent(executor: &str) -> Result<BaseCodingAgent, CallToolResult> {
        let normalized = executor.replace('-', "_").to_ascii_uppercase();
        BaseCodingAgent::from_str(&normalized).map_err(|_| {
            Self::err(format!("Unknown executor '{executor}'."), None::<String>).unwrap()
        })
    }

    fn normalize_executor_name(executor: Option<&str>) -> Result<String, CallToolResult> {
        let Some(executor) = executor.map(str::trim).filter(|value| !value.is_empty()) else {
            return Ok("CODEX".to_string());
        };

        Self::parse_executor_agent(executor)
            .map(|agent| agent.to_string())
            .map_err(|_| {
                Self::err(
                    format!("Unknown executor '{}' configured for session", executor),
                    None::<String>,
                )
                .unwrap()
            })
    }

    fn execution_process_status_label(status: &ExecutionProcessStatus) -> &'static str {
        match status {
            ExecutionProcessStatus::Running => "running",
            ExecutionProcessStatus::Completed => "completed",
            ExecutionProcessStatus::Failed => "failed",
            ExecutionProcessStatus::Killed => "killed",
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeSet, sync::Once};

    use db::models::session::Session;
    use rmcp::handler::server::tool::ToolRouter;
    use serde_json::json;
    use uuid::Uuid;

    use super::McpServer;
    use crate::task_server::{McpContext, McpMode, McpRepoContext};

    static RUSTLS_PROVIDER: Once = Once::new();

    fn install_rustls_provider() {
        RUSTLS_PROVIDER.call_once(|| {
            rustls::crypto::aws_lc_rs::default_provider()
                .install_default()
                .expect("Failed to install rustls crypto provider");
        });
    }

    fn tool_names(router: rmcp::handler::server::tool::ToolRouter<McpServer>) -> BTreeSet<String> {
        router
            .list_all()
            .into_iter()
            .map(|tool| tool.name.to_string())
            .collect()
    }

    #[test]
    fn orchestrator_mode_exposes_only_scoped_workflow_tools() {
        let actual = tool_names(McpServer::orchestrator_mode_router());
        let expected = BTreeSet::from([
            "create_session".to_string(),
            "get_context".to_string(),
            "get_execution".to_string(),
            "list_sessions".to_string(),
            "run_session_prompt".to_string(),
            "update_workspace".to_string(),
        ]);

        assert_eq!(actual, expected);
    }

    #[test]
    fn global_mode_keeps_workspace_admin_and_discovery_tools() {
        let actual = tool_names(McpServer::global_mode_router());

        assert!(actual.contains("list_workspaces"));
        assert!(actual.contains("delete_workspace"));
        assert!(!actual.contains("output_markdown"));
    }

    #[test]
    fn attached_session_id_is_resolved_from_context() {
        install_rustls_provider();
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let server = McpServer {
            client: reqwest::Client::new(),
            base_url: "http://127.0.0.1:3000".to_string(),
            tool_router: ToolRouter::default(),
            context: Some(McpContext {
                organization_id: None,
                project_id: None,
                issue_id: None,
                session_id: Some(session_id),
                workspace_id,
                workspace_branch: "main".to_string(),
                workspace_repos: vec![McpRepoContext {
                    repo_id: Uuid::new_v4(),
                    repo_name: "repo".to_string(),
                    target_branch: "main".to_string(),
                }],
            }),
            mode: McpMode::Global,
            orchestrator_session: None,
        };

        assert_eq!(server.attached_session_id(), Some(session_id));
        assert_eq!(server.resolve_workspace_id(None).unwrap(), workspace_id);
    }

    #[test]
    fn orchestrator_scope_falls_back_to_attached_session_when_context_is_missing() {
        install_rustls_provider();
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let server = McpServer {
            client: reqwest::Client::new(),
            base_url: "http://127.0.0.1:3000".to_string(),
            tool_router: ToolRouter::default(),
            context: None,
            mode: McpMode::Orchestrator,
            orchestrator_session: Some(
                serde_json::from_value::<Session>(json!({
                    "id": session_id,
                    "workspace_id": workspace_id,
                    "executor": "CODEX",
                    "agent_working_dir": null,
                    "created_at": "2026-03-07T00:00:00Z",
                    "updated_at": "2026-03-07T00:00:00Z"
                }))
                .expect("session fixture should deserialize"),
            ),
        };

        assert_eq!(server.attached_session_id(), Some(session_id));
        assert_eq!(server.resolve_workspace_id(None).unwrap(), workspace_id);
        assert!(server.scope_allows_workspace(workspace_id).is_ok());
        assert!(server.scope_allows_workspace(Uuid::new_v4()).is_err());
    }
}
