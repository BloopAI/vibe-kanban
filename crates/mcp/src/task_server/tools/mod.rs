use std::str::FromStr;

use api_types::{Issue, ListProjectStatusesResponse, ProjectStatus};
use db::models::tag::Tag;
use executors::executors::BaseCodingAgent;
use regex::Regex;
use rmcp::{
    ErrorData,
    model::{CallToolResult, Content},
};
use serde::{Serialize, de::DeserializeOwned};
use thiserror::Error;
use uuid::Uuid;

use super::{ApiResponseEnvelope, McpMode, McpServer};

type ToolCallResult = Result<CallToolResult, ErrorData>;

/// Upper bound on the size of the non-JSON body tail surfaced to the caller
/// when a VK API error response can't be parsed as an `ApiResponse` envelope.
/// We keep the tail (not the head) because stack traces / error strings tend
/// to live at the end of a body; we also prefix with `"…"` when truncated.
const BODY_TAIL_MAX: usize = 2048;

// Optional fields are boxed so that `Result<_, ToolError>` fits well under
// clippy's `result_large_err` threshold (<128 bytes). `ToolError` is a rare
// path, so the extra allocation on error construction is free in practice.
#[derive(Debug, Error)]
#[error("{message}")]
struct ToolError {
    message: String,
    details: Option<Box<str>>,
    /// HTTP status from the upstream VK API, when applicable.
    status: Option<u16>,
    /// Typed error category emitted by the VK API (forward-compat: server
    /// does not populate this yet but will in a follow-up PR).
    error_kind: Option<Box<str>>,
    /// Structured error payload from `ApiResponse.error_data`, when the
    /// server returned one.
    error_data: Option<Box<serde_json::Value>>,
    /// Truncated tail of the raw response body, populated when the body
    /// couldn't be parsed as an `ApiResponse` envelope.
    body_tail: Option<Box<str>>,
}

impl ToolError {
    fn new(message: impl Into<String>, details: Option<impl Into<String>>) -> Self {
        Self {
            message: message.into(),
            details: details.map(|d| d.into().into_boxed_str()),
            status: None,
            error_kind: None,
            error_data: None,
            body_tail: None,
        }
    }

    fn message(message: impl Into<String>) -> Self {
        Self::new(message, None::<String>)
    }

    fn with_status(mut self, status: u16) -> Self {
        self.status = Some(status);
        self
    }

    fn with_error_kind(mut self, kind: impl Into<String>) -> Self {
        self.error_kind = Some(kind.into().into_boxed_str());
        self
    }

    fn with_error_data(mut self, data: serde_json::Value) -> Self {
        self.error_data = Some(Box::new(data));
        self
    }

    fn with_body_tail(mut self, tail: impl Into<String>) -> Self {
        self.body_tail = Some(tail.into().into_boxed_str());
        self
    }
}

fn truncate_body_tail(body: &str) -> String {
    if body.len() <= BODY_TAIL_MAX {
        return body.to_string();
    }
    let mut cut = body.len() - BODY_TAIL_MAX;
    while cut < body.len() && !body.is_char_boundary(cut) {
        cut += 1;
    }
    format!("…{}", &body[cut..])
}

/// Classifies an HTTP response (given its status + already-read body) into
/// either the parsed success payload or a fully-populated `ToolError` that
/// surfaces the upstream `ApiResponse.error_*` fields (or the raw body tail
/// when the response wasn't JSON at all).
fn classify_response<T: DeserializeOwned>(
    status: reqwest::StatusCode,
    body: String,
) -> Result<T, ToolError> {
    let parsed = serde_json::from_str::<ApiResponseEnvelope<T>>(&body);

    if !status.is_success() {
        return Err(match parsed {
            Ok(env) => envelope_to_error(env, status),
            Err(parse_err) => ToolError::new(
                format!("VK API returned HTTP {}", status.as_u16()),
                Some(parse_err.to_string()),
            )
            .with_status(status.as_u16())
            .with_body_tail(truncate_body_tail(&body)),
        });
    }

    let env = parsed.map_err(|parse_err| {
        ToolError::new(
            "Failed to parse VK API response",
            Some(parse_err.to_string()),
        )
        .with_status(status.as_u16())
        .with_body_tail(truncate_body_tail(&body))
    })?;

    if !env.success {
        return Err(envelope_to_error(env, status));
    }

    env.data
        .ok_or_else(|| ToolError::message("VK API response missing data field"))
}

/// Same as `classify_response`, but ignores the `data` field so it can be used
/// for endpoints that return `{"success": true}` with no payload.
fn classify_empty_response(status: reqwest::StatusCode, body: String) -> Result<(), ToolError> {
    let parsed = serde_json::from_str::<ApiResponseEnvelope<serde_json::Value>>(&body);

    if !status.is_success() {
        return Err(match parsed {
            Ok(env) => envelope_to_error(env, status),
            Err(parse_err) => ToolError::new(
                format!("VK API returned HTTP {}", status.as_u16()),
                Some(parse_err.to_string()),
            )
            .with_status(status.as_u16())
            .with_body_tail(truncate_body_tail(&body)),
        });
    }

    let env = parsed.map_err(|parse_err| {
        ToolError::new(
            "Failed to parse VK API response",
            Some(parse_err.to_string()),
        )
        .with_status(status.as_u16())
        .with_body_tail(truncate_body_tail(&body))
    })?;

    if !env.success {
        return Err(envelope_to_error(env, status));
    }

    Ok(())
}

fn envelope_to_error<T>(env: ApiResponseEnvelope<T>, status: reqwest::StatusCode) -> ToolError {
    let message = env
        .message
        .clone()
        .unwrap_or_else(|| format!("VK API returned error (HTTP {})", status.as_u16()));
    let mut err = ToolError::new(message, env.message.clone()).with_status(status.as_u16());
    if let Some(kind) = env.error_kind {
        err = err.with_error_kind(kind);
    }
    if let Some(data) = env.error_data {
        err = err.with_error_data(data);
    }
    err
}

use std::collections::HashMap;

/// Async, memoised scope check for orchestrator mode.
///
/// Returns `true` if `target` is allowed under the server's configured scope:
/// - Non-orchestrator mode: always allowed.
/// - No scoped workspace set: always allowed.
/// - Same workspace as scope: allowed (no HTTP needed).
/// - Child workspace (target's task points back to scope): allowed after HTTP lookup.
/// - Anything else: denied.
///
/// Decisions are stored in `scope_cache` keyed by `target` so a caller can
/// re-check the same workspace within a request without extra round-trips.
// Task 3.12 will migrate all call-sites; suppress dead_code until then.
#[allow(dead_code)]
pub(crate) async fn check_scope_allows_workspace(
    server: &McpServer,
    scope_cache: &mut HashMap<Uuid, bool>,
    target: Uuid,
) -> bool {
    if !matches!(server.mode(), McpMode::Orchestrator) {
        return true;
    }
    let scoped = match server.scoped_workspace_id() {
        Some(x) => x,
        None => return true,
    };
    if target == scoped {
        return true;
    }
    if let Some(cached) = scope_cache.get(&target) {
        return *cached;
    }

    let allowed = async {
        let ws = server.api().get_workspace(target).await.ok()?;
        let tid = ws.task_id?;
        let t = server.api().get_task(tid).await.ok()?;
        Some(t.parent_workspace_id == Some(scoped))
    }
    .await
    .unwrap_or(false);

    scope_cache.insert(target, allowed);
    allowed
}

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
        router.remove_route("list_workspaces");
        router.remove_route("delete_workspace");
        router
    }
}

impl McpServer {
    fn orchestrator_session_id(&self) -> Option<Uuid> {
        self.context
            .as_ref()
            .and_then(|ctx| ctx.orchestrator_session_id)
    }

    fn scoped_workspace_id(&self) -> Option<Uuid> {
        self.context.as_ref().map(|ctx| ctx.workspace_id)
    }

    fn success<T: Serialize>(data: &T) -> ToolCallResult {
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(data)
                .unwrap_or_else(|_| "Failed to serialize response".to_string()),
        )]))
    }

    fn err<S: Into<String>>(msg: S, details: Option<S>) -> ToolCallResult {
        Ok(Self::tool_error(ToolError::new(msg, details)))
    }

    fn tool_error_value(error: ToolError) -> serde_json::Value {
        let mut value = serde_json::json!({
            "success": false,
            "error": error.message,
        });
        if let Some(details) = error.details {
            value["details"] = serde_json::json!(details);
        }
        if let Some(status) = error.status {
            value["status"] = serde_json::json!(status);
        }
        if let Some(kind) = error.error_kind {
            value["error_kind"] = serde_json::json!(kind);
        }
        if let Some(data) = error.error_data {
            value["error_data"] = *data;
        }
        if let Some(tail) = error.body_tail {
            value["body_tail"] = serde_json::json!(tail);
        }
        value
    }

    fn tool_error(error: ToolError) -> CallToolResult {
        let value = Self::tool_error_value(error);
        CallToolResult::error(vec![Content::text(
            serde_json::to_string_pretty(&value)
                .unwrap_or_else(|_| "Failed to serialize error".to_string()),
        )])
    }

    async fn send_json<T: DeserializeOwned>(
        &self,
        rb: reqwest::RequestBuilder,
    ) -> Result<T, ToolError> {
        let resp = rb.send().await.map_err(|error| {
            ToolError::new("Failed to connect to VK API", Some(error.to_string()))
        })?;
        let status = resp.status();
        let body = resp.text().await.map_err(|error| {
            ToolError::new(
                format!(
                    "Failed to read VK API response body (HTTP {})",
                    status.as_u16()
                ),
                Some(error.to_string()),
            )
            .with_status(status.as_u16())
        })?;
        classify_response::<T>(status, body)
    }

    async fn send_empty_json(&self, rb: reqwest::RequestBuilder) -> Result<(), ToolError> {
        let resp = rb.send().await.map_err(|error| {
            ToolError::new("Failed to connect to VK API", Some(error.to_string()))
        })?;
        let status = resp.status();
        let body = resp.text().await.map_err(|error| {
            ToolError::new(
                format!(
                    "Failed to read VK API response body (HTTP {})",
                    status.as_u16()
                ),
                Some(error.to_string()),
            )
            .with_status(status.as_u16())
        })?;
        classify_empty_response(status, body)
    }

    fn resolve_workspace_id(&self, explicit: Option<Uuid>) -> Result<Uuid, ToolError> {
        if let Some(id) = explicit {
            return Ok(id);
        }
        if let Some(workspace_id) = self.scoped_workspace_id() {
            return Ok(workspace_id);
        }
        Err(ToolError::message(
            "workspace_id is required (not available from current MCP context)",
        ))
    }

    fn scope_allows_workspace_sync(&self, workspace_id: Uuid) -> Result<(), ToolError> {
        if matches!(self.mode(), McpMode::Orchestrator)
            && let Some(scoped_workspace_id) = self.scoped_workspace_id()
            && scoped_workspace_id != workspace_id
        {
            return Err(ToolError::new(
                "Operation is outside the configured workspace scope",
                Some(format!(
                    "requested workspace_id={}, configured workspace_id={}",
                    workspace_id, scoped_workspace_id
                )),
            ));
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
    fn resolve_project_id(&self, explicit: Option<Uuid>) -> Result<Uuid, ToolError> {
        if let Some(id) = explicit {
            return Ok(id);
        }
        if let Some(ctx) = &self.context
            && let Some(id) = ctx.project_id
        {
            return Ok(id);
        }
        Err(ToolError::message(
            "project_id is required (not available from workspace context)",
        ))
    }

    // Resolves an organization_id from an explicit parameter or falls back to context.
    fn resolve_organization_id(&self, explicit: Option<Uuid>) -> Result<Uuid, ToolError> {
        if let Some(id) = explicit {
            return Ok(id);
        }
        if let Some(ctx) = &self.context
            && let Some(id) = ctx.organization_id
        {
            return Ok(id);
        }
        Err(ToolError::message(
            "organization_id is required (not available from workspace context)",
        ))
    }

    // Fetches project statuses for a project.
    async fn fetch_project_statuses(
        &self,
        project_id: Uuid,
    ) -> Result<Vec<ProjectStatus>, ToolError> {
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
    ) -> Result<Uuid, ToolError> {
        let statuses = self.fetch_project_statuses(project_id).await?;
        statuses
            .iter()
            .find(|s| s.name.eq_ignore_ascii_case(status_name))
            .map(|s| s.id)
            .ok_or_else(|| {
                let available: Vec<&str> = statuses.iter().map(|s| s.name.as_str()).collect();
                ToolError::message(format!(
                    "Unknown status '{}'. Available statuses: {:?}",
                    status_name, available
                ))
            })
    }

    // Gets the default status_id for a project (first non-hidden status by sort_order).
    async fn default_status_id(&self, project_id: Uuid) -> Result<Uuid, ToolError> {
        let statuses = self.fetch_project_statuses(project_id).await?;
        statuses
            .iter()
            .filter(|s| !s.hidden)
            .min_by_key(|s| s.sort_order)
            .map(|s| s.id)
            .ok_or_else(|| ToolError::message("No visible statuses found for project"))
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
    ) -> Result<(), ToolError> {
        let issue_url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let issue: Issue = self.send_json(self.client.get(&issue_url)).await?;

        let link_url = self.url(&format!("/api/workspaces/{}/links", workspace_id));
        let link_payload = serde_json::json!({
            "project_id": issue.project_id,
            "issue_id": issue_id,
        });
        self.send_empty_json(self.client.post(&link_url).json(&link_payload))
            .await
    }

    fn parse_executor_agent(executor: &str) -> Result<BaseCodingAgent, ToolError> {
        let normalized = executor.replace('-', "_").to_ascii_uppercase();
        BaseCodingAgent::from_str(&normalized)
            .map_err(|_| ToolError::message(format!("Unknown executor '{executor}'.")))
    }

    fn normalize_executor_name(executor: Option<&str>) -> Result<String, ToolError> {
        let Some(executor) = executor.map(str::trim).filter(|value| !value.is_empty()) else {
            return Ok("CODEX".to_string());
        };

        Self::parse_executor_agent(executor)
            .map(|agent| agent.to_string())
            .map_err(|_| {
                ToolError::message(format!(
                    "Unknown executor '{}' configured for session",
                    executor
                ))
            })
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeSet, sync::Once};

    use rmcp::handler::server::tool::ToolRouter;
    use uuid::Uuid;

    use super::McpServer;
    use crate::task_server::{McpContext, McpMode, McpRepoContext};

    static RUSTLS_PROVIDER: Once = Once::new();

    fn install_rustls_provider() {
        RUSTLS_PROVIDER.call_once(|| {
            // Ignore error: another thread may have already installed the default
            // provider (e.g. the check_scope_tests module), which is fine.
            let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
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
            "read_session_messages".to_string(),
            "run_session_prompt".to_string(),
            "update_session".to_string(),
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
    fn orchestrator_session_id_is_resolved_from_context() {
        install_rustls_provider();
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let client = reqwest::Client::new();
        let server = McpServer {
            api_client: crate::task_server::api_client::ApiClient::new(
                client.clone(),
                "http://127.0.0.1:3000",
            ),
            client,
            base_url: "http://127.0.0.1:3000".to_string(),
            tool_router: ToolRouter::default(),
            context: Some(McpContext {
                organization_id: None,
                project_id: None,
                issue_id: None,
                orchestrator_session_id: Some(session_id),
                workspace_id,
                workspace_branch: "main".to_string(),
                workspace_repos: vec![McpRepoContext {
                    repo_id: Uuid::new_v4(),
                    repo_name: "repo".to_string(),
                    target_branch: "main".to_string(),
                }],
            }),
            mode: McpMode::Global,
        };

        assert_eq!(server.orchestrator_session_id(), Some(session_id));
        assert_eq!(server.resolve_workspace_id(None).unwrap(), workspace_id);
    }

    #[test]
    fn orchestrator_scope_requires_context_when_missing() {
        install_rustls_provider();
        let client = reqwest::Client::new();
        let server = McpServer {
            api_client: crate::task_server::api_client::ApiClient::new(
                client.clone(),
                "http://127.0.0.1:3000",
            ),
            client,
            base_url: "http://127.0.0.1:3000".to_string(),
            tool_router: ToolRouter::default(),
            context: None,
            mode: McpMode::Orchestrator,
        };

        assert_eq!(server.orchestrator_session_id(), None);
        assert!(server.resolve_workspace_id(None).is_err());
        assert!(server.scope_allows_workspace_sync(Uuid::new_v4()).is_ok());
    }

    #[test]
    fn global_context_omits_orchestrator_session_id_from_serialized_output() {
        install_rustls_provider();
        let context = McpContext {
            organization_id: None,
            project_id: None,
            issue_id: None,
            orchestrator_session_id: None,
            workspace_id: Uuid::new_v4(),
            workspace_branch: "main".to_string(),
            workspace_repos: vec![],
        };

        let serialized = serde_json::to_value(&context).expect("context should serialize");

        assert!(serialized.get("orchestrator_session_id").is_none());
    }

    mod response_classification {
        use reqwest::StatusCode;
        use serde::Deserialize;
        use serde_json::json;

        use super::super::{
            BODY_TAIL_MAX, McpServer, ToolError, classify_empty_response, classify_response,
            truncate_body_tail,
        };

        #[derive(Debug, Deserialize, PartialEq, Eq)]
        struct Sample {
            id: u32,
            name: String,
        }

        #[test]
        fn success_envelope_returns_payload() {
            let body = json!({
                "success": true,
                "data": { "id": 7, "name": "ok" }
            })
            .to_string();
            let out: Sample = classify_response(StatusCode::OK, body).expect("success");
            assert_eq!(
                out,
                Sample {
                    id: 7,
                    name: "ok".to_string()
                }
            );
        }

        #[test]
        fn success_true_missing_data_is_an_error() {
            let body = json!({ "success": true }).to_string();
            let err: ToolError = classify_response::<Sample>(StatusCode::OK, body).unwrap_err();
            assert!(err.message.contains("missing data field"));
        }

        #[test]
        fn envelope_error_at_2xx_propagates_all_fields() {
            let body = json!({
                "success": false,
                "message": "session is busy",
                "error_kind": "session_busy",
                "error_data": { "session_id": "abc" }
            })
            .to_string();
            let err: ToolError = classify_response::<Sample>(StatusCode::OK, body).unwrap_err();
            assert_eq!(err.message, "session is busy");
            assert_eq!(err.status, Some(200));
            assert_eq!(err.error_kind.as_deref(), Some("session_busy"));
            assert_eq!(
                err.error_data.as_ref().and_then(|v| v.get("session_id")),
                Some(&json!("abc"))
            );
            assert!(err.body_tail.is_none());
        }

        #[test]
        fn http_500_with_envelope_preserves_error_kind() {
            let body = json!({
                "success": false,
                "message": "executor binary not found",
                "error_kind": "executor_not_found"
            })
            .to_string();
            let err: ToolError =
                classify_response::<Sample>(StatusCode::INTERNAL_SERVER_ERROR, body).unwrap_err();
            assert!(err.message.contains("executor binary not found"));
            assert_eq!(err.status, Some(500));
            assert_eq!(err.error_kind.as_deref(), Some("executor_not_found"));
        }

        #[test]
        fn http_500_with_non_json_body_falls_back_to_body_tail() {
            let body = "spawn: No such file or directory (os error 2)".to_string();
            let err: ToolError =
                classify_response::<Sample>(StatusCode::INTERNAL_SERVER_ERROR, body.clone())
                    .unwrap_err();
            assert_eq!(err.status, Some(500));
            assert_eq!(err.body_tail.as_deref(), Some(body.as_str()));
            assert!(err.error_kind.is_none());
            assert!(err.error_data.is_none());
        }

        #[test]
        fn body_tail_is_truncated_and_prefixed_when_over_limit() {
            let big = "x".repeat(BODY_TAIL_MAX * 2);
            let err: ToolError =
                classify_response::<Sample>(StatusCode::BAD_GATEWAY, big).unwrap_err();
            let tail = err.body_tail.expect("tail present");
            assert!(tail.starts_with('…'));
            // `…` is 3 bytes in UTF-8, followed by up to BODY_TAIL_MAX bytes of body.
            assert!(tail.len() <= BODY_TAIL_MAX + 4);
            assert!(tail.ends_with('x'));
        }

        #[test]
        fn truncate_short_body_is_unchanged() {
            let body = "short body";
            assert_eq!(truncate_body_tail(body), "short body");
        }

        #[test]
        fn truncate_respects_char_boundaries() {
            // Force a cut that would land mid-char in a multibyte string.
            let mut s = "a".repeat(BODY_TAIL_MAX);
            s.push('中');
            s.push_str(&"b".repeat(10));
            let tail = truncate_body_tail(&s);
            // Must still be valid UTF-8 (implicitly, by virtue of being a String).
            assert!(tail.starts_with('…'));
        }

        #[test]
        fn empty_response_accepts_success_without_data() {
            let body = json!({ "success": true }).to_string();
            classify_empty_response(StatusCode::OK, body).expect("empty success");
        }

        #[test]
        fn empty_response_surfaces_envelope_error() {
            let body = json!({
                "success": false,
                "message": "tag is referenced",
                "error_kind": "conflict"
            })
            .to_string();
            let err = classify_empty_response(StatusCode::CONFLICT, body).unwrap_err();
            assert_eq!(err.status, Some(409));
            assert_eq!(err.error_kind.as_deref(), Some("conflict"));
            assert!(err.message.contains("tag is referenced"));
        }

        #[test]
        fn tool_error_value_contains_all_optional_fields() {
            let err = ToolError::new("primary", Some("details here"))
                .with_status(502)
                .with_error_kind("bootstrap_failed")
                .with_error_data(json!({ "retry_safe": false }))
                .with_body_tail("stderr tail...");

            let value = McpServer::tool_error_value(err);
            assert_eq!(value["success"], json!(false));
            assert_eq!(value["error"], json!("primary"));
            assert_eq!(value["details"], json!("details here"));
            assert_eq!(value["status"], json!(502));
            assert_eq!(value["error_kind"], json!("bootstrap_failed"));
            assert_eq!(value["error_data"], json!({ "retry_safe": false }));
            assert_eq!(value["body_tail"], json!("stderr tail..."));
        }

        #[test]
        fn tool_error_value_omits_absent_fields() {
            let err = ToolError::message("just a message");
            let value = McpServer::tool_error_value(err);
            assert_eq!(value["success"], json!(false));
            assert_eq!(value["error"], json!("just a message"));
            assert!(value.get("details").is_none());
            assert!(value.get("status").is_none());
            assert!(value.get("error_kind").is_none());
            assert!(value.get("error_data").is_none());
            assert!(value.get("body_tail").is_none());
        }
    }
}

#[cfg(test)]
mod check_scope_tests {
    use std::collections::HashMap;

    use httpmock::MockServer;
    use uuid::Uuid;

    use super::{McpServer, check_scope_allows_workspace};

    fn install_rustls() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        });
    }

    fn ws_envelope(id: Uuid, task_id: Option<Uuid>) -> serde_json::Value {
        serde_json::json!({
            "success": true,
            "data": {
                "id": id.to_string(),
                "task_id": task_id.map(|t| t.to_string()),
                "container_ref": null,
                "branch": "main",
                "setup_completed_at": null,
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T00:00:00Z",
                "archived": false,
                "pinned": false,
                "name": null,
                "worktree_deleted": false
            }
        })
    }

    fn task_envelope(id: Uuid, parent: Option<Uuid>) -> serde_json::Value {
        serde_json::json!({
            "success": true,
            "data": {
                "id": id.to_string(),
                "project_id": Uuid::new_v4().to_string(),
                "title": "t",
                "description": null,
                "status": "todo",
                "parent_workspace_id": parent.map(|p| p.to_string()),
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T00:00:00Z"
            }
        })
    }

    #[tokio::test]
    async fn same_workspace_passes_without_http() {
        install_rustls();
        let mock_server = MockServer::start();
        // Register a catch-all that would fail the test if hit
        let catch_all = mock_server.mock(|when, then| {
            when.any_request();
            then.status(500);
        });

        let server = McpServer::new_orchestrator(&mock_server.base_url())
            .with_scope_for_test(Uuid::new_v4());
        let target = server.scoped_workspace_id().unwrap();
        let mut cache = HashMap::new();
        assert!(check_scope_allows_workspace(&server, &mut cache, target).await);
        assert_eq!(catch_all.hits(), 0);
    }

    #[tokio::test]
    async fn child_of_scoped_is_allowed() {
        install_rustls();
        let mock_server = MockServer::start();
        let parent = Uuid::new_v4();
        let task_id = Uuid::new_v4();
        let child = Uuid::new_v4();

        let ws_mock = mock_server.mock(|when, then| {
            when.path(format!("/api/workspaces/{child}"));
            then.status(200)
                .json_body(ws_envelope(child, Some(task_id)));
        });
        let task_mock = mock_server.mock(|when, then| {
            when.path(format!("/api/tasks/{task_id}"));
            then.status(200)
                .json_body(task_envelope(task_id, Some(parent)));
        });

        let server =
            McpServer::new_orchestrator(&mock_server.base_url()).with_scope_for_test(parent);
        let mut cache = HashMap::new();
        assert!(check_scope_allows_workspace(&server, &mut cache, child).await);
        ws_mock.assert_hits(1);
        task_mock.assert_hits(1);
    }

    #[tokio::test]
    async fn unrelated_workspace_is_rejected() {
        install_rustls();
        let mock_server = MockServer::start();
        let scope = Uuid::new_v4();
        let task_id = Uuid::new_v4();
        let child = Uuid::new_v4();
        let other_parent = Uuid::new_v4(); // different from scope

        mock_server.mock(|when, then| {
            when.path(format!("/api/workspaces/{child}"));
            then.status(200)
                .json_body(ws_envelope(child, Some(task_id)));
        });
        mock_server.mock(|when, then| {
            when.path(format!("/api/tasks/{task_id}"));
            then.status(200)
                .json_body(task_envelope(task_id, Some(other_parent)));
        });

        let server =
            McpServer::new_orchestrator(&mock_server.base_url()).with_scope_for_test(scope);
        let mut cache = HashMap::new();
        assert!(!check_scope_allows_workspace(&server, &mut cache, child).await);
    }

    #[tokio::test]
    async fn cache_short_circuits_second_call() {
        install_rustls();
        let mock_server = MockServer::start();
        let parent = Uuid::new_v4();
        let task_id = Uuid::new_v4();
        let child = Uuid::new_v4();

        // Each mock endpoint only responds successfully once; httpmock serves
        // the same response every time, but we assert hits == 1 after two calls.
        let ws_mock = mock_server.mock(|when, then| {
            when.path(format!("/api/workspaces/{child}"));
            then.status(200)
                .json_body(ws_envelope(child, Some(task_id)));
        });
        let task_mock = mock_server.mock(|when, then| {
            when.path(format!("/api/tasks/{task_id}"));
            then.status(200)
                .json_body(task_envelope(task_id, Some(parent)));
        });

        let server =
            McpServer::new_orchestrator(&mock_server.base_url()).with_scope_for_test(parent);
        let mut cache = HashMap::new();

        // First call — performs HTTP.
        assert!(check_scope_allows_workspace(&server, &mut cache, child).await);
        // Second call — must be served from cache.
        assert!(check_scope_allows_workspace(&server, &mut cache, child).await);

        ws_mock.assert_hits(1);
        task_mock.assert_hits(1);
    }
}
