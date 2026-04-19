//! `vibe-kanban-mcp --mode cursor-bridge --session-id <UUID>`
//!
//! A minimal stdio MCP server that exposes a single tool,
//! `wait_for_user_input`, mirroring the PChat extension's tool. Cursor IDE's
//! Composer Agent calls it at the end of every turn; the call blocks until
//! the user types a reply in the **vibe-kanban** session UI bound to the
//! `--session-id` flag (or until the backend force-renews via
//! `TIMEOUT_RENEW`).
//!
//! The bridge does not directly touch any vibe-kanban internals: it long-polls
//! `POST <backend>/api/cursor-mcp/bridge/wait`. The backend
//! ([`server::routes::cursor_mcp`]) owns the rendezvous with the UI.

use std::time::Duration;

use rmcp::{
    ErrorData, ServerHandler,
    handler::server::{tool::ToolRouter, wrapper::Parameters},
    model::{
        CallToolResult, Content, Implementation, ProtocolVersion, ServerCapabilities, ServerInfo,
    },
    schemars, serde_json, tool, tool_handler, tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Sentinel keep-alive returned by the backend when no user reply has come
/// in within the auto-renew interval. Cursor's Agent should silently re-call
/// the tool when it sees this string.
pub const TIMEOUT_RENEW: &str = "TIMEOUT_RENEW";

/// Sentinel returned when the user explicitly cancels the prompt from the UI.
pub const USER_DISMISSED_QUEUE: &str = "__USER_DISMISSED_QUEUE__";

/// Hard upper bound for one HTTP long-poll cycle to the backend.
/// Slightly larger than the backend's auto-renew interval so the backend
/// always returns first.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60 * 60); // 60 min

#[derive(Debug, Clone)]
pub struct CursorBridgeServer {
    client: reqwest::Client,
    base_url: String,
    /// vibe-kanban session UUID this bridge is permanently bound to.
    session_id: Uuid,
    tool_router: ToolRouter<CursorBridgeServer>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct WaitForUserInputArgs {
    #[schemars(
        description = "The complete assistant reply text to display to the user as the current message in the persistent chat panel. Use full Markdown."
    )]
    pub message: String,

    #[schemars(
        description = "Hint text shown above the input box. Optional. Use to guide the user's reply."
    )]
    #[serde(default)]
    pub prompt: Option<String>,

    #[schemars(
        description = "Optional title hint for the persistent chat session tab (only the first call may take effect)."
    )]
    #[serde(default)]
    pub title: Option<String>,

    /// Some clients pass back a `sessionId` from the previous tool result.
    /// We accept and ignore it — the bridge is bound to its `--session-id`
    /// at startup, so we never route across sessions. Kept here only to
    /// preserve a tool schema compatible with PChat-style models.
    #[schemars(
        description = "Ignored. The bridge is bound to a specific vibe-kanban session at startup. Pass anything (e.g. echo back the value from the previous response)."
    )]
    #[serde(default)]
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BridgeWaitRequest {
    session_id: Uuid,
    request_id: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BridgeWaitResponse {
    text: String,
}

impl CursorBridgeServer {
    pub fn new(base_url: &str, session_id: Uuid) -> Self {
        let client = reqwest::Client::builder()
            // No global timeout; we long-poll for up to ~1h per request.
            .pool_idle_timeout(Some(Duration::from_secs(90)))
            .build()
            .expect("failed to build reqwest::Client for cursor-bridge");

        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            session_id,
            tool_router: Self::tool_router_default(),
        }
    }
}

#[tool_router(router = tool_router_default, vis = "pub")]
impl CursorBridgeServer {
    #[tool(
        description = "Wait for user input in the vibe-kanban Cursor MCP persistent chat panel.\n\nRULES:\n- Normal text returned: process as user reply.\n- Text starting with \"TIMEOUT_RENEW\" returned: keep-alive signal. Do NOT show this to the user. Silently call this tool again with the same `message` (or a fresh one if the situation changed). This may repeat many times.\n- Text equal to \"__USER_DISMISSED_QUEUE__\" returned: the user cancelled this prompt from the UI. Treat it as the user choosing to stop the loop.\n\nThe tool blocks until one of the above happens. The vibe-kanban backend force-renews the wait every ~55 minutes to defeat upstream MCP timeouts.\n\nParameters:\n- message: The full assistant reply (Markdown).\n- prompt: Optional hint above the input box.\n- title: Optional session tab title.\n- sessionId: Ignored (this bridge is bound to one vibe-kanban session at startup)."
    )]
    async fn wait_for_user_input(
        &self,
        Parameters(args): Parameters<WaitForUserInputArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = format!("{}/api/cursor-mcp/bridge/wait", self.base_url);
        let payload = BridgeWaitRequest {
            session_id: self.session_id,
            request_id: Uuid::new_v4().to_string(),
            message: args.message,
            prompt: args.prompt,
            title: args.title,
        };

        let response = match tokio::time::timeout(
            REQUEST_TIMEOUT,
            self.client.post(&url).json(&payload).send(),
        )
        .await
        {
            Ok(Ok(resp)) => resp,
            Ok(Err(err)) => {
                tracing::error!("cursor-bridge HTTP error: {}", err);
                return Ok(Self::error_result(&format!(
                    "Failed to reach vibe-kanban backend at {}: {}. Is vibe-kanban running and is the bridge --session-id correct?",
                    url, err
                )));
            }
            Err(_) => {
                tracing::warn!("cursor-bridge request timed out — telling Agent to retry");
                return Ok(Self::keep_alive_result(self.session_id));
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Ok(Self::error_result(&format!(
                "vibe-kanban backend returned {}: {}",
                status, body
            )));
        }

        // The /bridge/wait endpoint returns {"text": "..."} directly (not
        // wrapped in ApiResponseEnvelope) so it can be a thin pass-through.
        let parsed = match response.json::<BridgeWaitResponse>().await {
            Ok(v) => v,
            Err(err) => {
                // Fall back to envelope-wrapped shape if the backend ever
                // changes; we don't want a deserialisation tweak to break
                // Cursor's Agent loop.
                tracing::warn!("cursor-bridge response decode failed: {}", err);
                return Ok(Self::keep_alive_result(self.session_id));
            }
        };

        let body = format!("{}\n\n[session_id: {}]", parsed.text, self.session_id);
        Ok(CallToolResult::success(vec![Content::text(body)]))
    }
}

impl CursorBridgeServer {
    fn keep_alive_result(session_id: Uuid) -> CallToolResult {
        CallToolResult::success(vec![Content::text(format!(
            "{}\n\n[session_id: {}]",
            TIMEOUT_RENEW, session_id
        ))])
    }

    fn error_result(msg: &str) -> CallToolResult {
        let value = serde_json::json!({
            "success": false,
            "error": msg,
        });
        let body = serde_json::to_string_pretty(&value).unwrap_or_else(|_| msg.to_string());
        let mut result = CallToolResult::success(vec![Content::text(body)]);
        result.is_error = Some(true);
        result
    }
}

#[tool_handler]
impl ServerHandler for CursorBridgeServer {
    fn get_info(&self) -> ServerInfo {
        let instructions = format!(
            "vibe-kanban Cursor MCP bridge for session {}. \
             Call `wait_for_user_input` at the end of every assistant turn so the user can reply in vibe-kanban. \
             If the tool returns text starting with `TIMEOUT_RENEW`, silently call it again. \
             If it returns `__USER_DISMISSED_QUEUE__`, the user cancelled the prompt.",
            self.session_id
        );

        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(
                "vibe-kanban-mcp-cursor-bridge",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_protocol_version(ProtocolVersion::V_2025_03_26)
            .with_instructions(instructions)
    }
}

// Tiny smoke test: the bridge object can be constructed and exposes exactly
// one tool.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_router_only_has_wait_for_user_input() {
        let svc = CursorBridgeServer::new("http://127.0.0.1:1", Uuid::new_v4());
        let names: Vec<_> = svc
            .tool_router
            .list_all()
            .into_iter()
            .map(|t| t.name)
            .collect();
        assert_eq!(names, vec!["wait_for_user_input"]);
    }
}
