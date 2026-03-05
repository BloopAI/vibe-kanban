use std::str::FromStr;

use executors::executors::BaseCodingAgent;
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::Deserialize;
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListSessionsRequest {
    #[schemars(
        description = "Workspace ID to list sessions for. Optional if running inside a workspace context."
    )]
    workspace_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpGetSessionRequest {
    #[schemars(description = "The session ID to retrieve")]
    session_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpSessionFollowUpRequest {
    #[schemars(description = "The session ID to send a follow-up to")]
    session_id: Uuid,
    #[schemars(description = "The prompt/instruction for the coding agent")]
    prompt: String,
    #[schemars(
        description = "The coding agent executor to run ('CLAUDE_CODE', 'AMP', 'CODEX', 'GEMINI', 'OPENCODE', 'CURSOR_AGENT', 'QWEN_CODE', 'COPILOT', 'DROID')"
    )]
    executor: String,
    #[schemars(description = "Optional executor variant")]
    variant: Option<String>,
    #[schemars(
        description = "Optional model override (e.g. 'anthropic/claude-sonnet-4-20250514')"
    )]
    model_id: Option<String>,
    #[schemars(
        description = "Optional process ID to retry from (resets session to that process first)"
    )]
    retry_process_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpSessionQueueMessageRequest {
    #[schemars(description = "The session ID to queue a message for")]
    session_id: Uuid,
    #[schemars(description = "The follow-up message to queue")]
    message: String,
    #[schemars(
        description = "The coding agent executor ('CLAUDE_CODE', 'AMP', 'CODEX', 'GEMINI', etc.)"
    )]
    executor: String,
    #[schemars(description = "Optional executor variant")]
    variant: Option<String>,
    #[schemars(description = "Optional model override")]
    model_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpSessionGetQueueRequest {
    #[schemars(description = "The session ID to check queue status for")]
    session_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpSessionCancelQueueRequest {
    #[schemars(description = "The session ID to cancel queued message for")]
    session_id: Uuid,
    #[schemars(
        description = "Optional cancel mode: 'latest' (default), 'all', 'queue', or 'steer'"
    )]
    mode: Option<String>,
}

/// Validate and normalize executor, returning the canonical name or an MCP error.
fn validate_executor(executor: &str) -> Result<String, Result<CallToolResult, ErrorData>> {
    let trimmed = executor.trim();
    if trimmed.is_empty() {
        return Err(TaskServer::err("Executor must not be empty.", None::<&str>));
    }
    let normalized = trimmed.replace('-', "_").to_ascii_uppercase();
    match BaseCodingAgent::from_str(&normalized) {
        Ok(_) => Ok(normalized),
        Err(_) => Err(TaskServer::err(
            format!("Unknown executor '{trimmed}'."),
            None::<String>,
        )),
    }
}

/// Build an executor_config JSON object from validated parameters.
fn build_executor_config(
    executor: &str,
    variant: &Option<String>,
    model_id: &Option<String>,
) -> serde_json::Value {
    let mut config = serde_json::json!({ "executor": executor });
    if let Some(v) = variant {
        let trimmed = v.trim();
        if !trimmed.is_empty() {
            config["variant"] = serde_json::json!(trimmed);
        }
    }
    if let Some(m) = model_id {
        let trimmed = m.trim();
        if !trimmed.is_empty() {
            config["model_id"] = serde_json::json!(trimmed);
        }
    }
    config
}

fn validate_queue_cancel_mode(
    mode: Option<String>,
) -> Result<Option<String>, Result<CallToolResult, ErrorData>> {
    let Some(mode) = mode else {
        return Ok(None);
    };

    let normalized = mode.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Ok(None);
    }

    match normalized.as_str() {
        "latest" | "all" | "queue" | "steer" => Ok(Some(normalized)),
        _ => Err(TaskServer::err(
            format!(
                "Unknown queue cancel mode '{mode}'. Expected one of: latest, all, queue, steer."
            ),
            None::<String>,
        )),
    }
}

#[tool_router(router = sessions_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(
        description = "List sessions for a workspace. Returns session IDs, executor info, and timestamps. Use workspace_id or relies on workspace context."
    )]
    async fn list_sessions(
        &self,
        Parameters(McpListSessionsRequest { workspace_id }): Parameters<McpListSessionsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match workspace_id {
            Some(id) => id,
            None => match self.context.as_ref() {
                Some(ctx) => ctx.workspace_id,
                None => {
                    return Self::err(
                        "workspace_id is required (not available from workspace context)",
                        None::<&str>,
                    );
                }
            },
        };

        let url = self.url(&format!("/api/sessions?workspace_id={}", workspace_id));
        let sessions: serde_json::Value = match self.send_json(self.client.get(&url)).await {
            Ok(v) => v,
            Err(e) => return Ok(e),
        };

        TaskServer::success(&sessions)
    }

    #[tool(
        description = "Get a session by ID. Returns session details including executor and timestamps."
    )]
    async fn get_session(
        &self,
        Parameters(McpGetSessionRequest { session_id }): Parameters<McpGetSessionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/sessions/{}", session_id));
        let session: serde_json::Value = match self.send_json(self.client.get(&url)).await {
            Ok(v) => v,
            Err(e) => return Ok(e),
        };

        TaskServer::success(&session)
    }

    #[tool(
        description = "Send a follow-up prompt to a session, starting a new execution process. The coding agent continues from where it left off. Returns the new execution process with its ID and status."
    )]
    async fn session_follow_up(
        &self,
        Parameters(McpSessionFollowUpRequest {
            session_id,
            prompt,
            executor,
            variant,
            model_id,
            retry_process_id,
        }): Parameters<McpSessionFollowUpRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let prompt = prompt.trim().to_string();
        if prompt.is_empty() {
            return Self::err("Prompt must not be empty.", None::<&str>);
        }

        let normalized_executor = match validate_executor(&executor) {
            Ok(e) => e,
            Err(err) => return err,
        };

        let url = self.url(&format!("/api/sessions/{}/follow-up", session_id));

        let executor_config = build_executor_config(&normalized_executor, &variant, &model_id);
        let mut payload = serde_json::json!({
            "prompt": prompt,
            "executor_config": executor_config,
        });
        if let Some(retry_id) = retry_process_id {
            payload["retry_process_id"] = serde_json::json!(retry_id);
        }

        let execution_process: serde_json::Value =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(v) => v,
                Err(e) => return Ok(e),
            };

        TaskServer::success(&execution_process)
    }

    #[tool(
        description = "Append a buffered follow-up message for a session. Buffered queue messages run after the current execution finishes and are consumed in FIFO order."
    )]
    async fn session_queue_message(
        &self,
        Parameters(McpSessionQueueMessageRequest {
            session_id,
            message,
            executor,
            variant,
            model_id,
        }): Parameters<McpSessionQueueMessageRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let message = message.trim().to_string();
        if message.is_empty() {
            return Self::err("Message must not be empty.", None::<&str>);
        }

        let normalized_executor = match validate_executor(&executor) {
            Ok(e) => e,
            Err(err) => return err,
        };

        let url = self.url(&format!("/api/sessions/{}/queue", session_id));

        let executor_config = build_executor_config(&normalized_executor, &variant, &model_id);
        let payload = serde_json::json!({
            "message": message,
            "executor_config": executor_config,
        });

        let status: serde_json::Value =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(v) => v,
                Err(e) => return Ok(e),
            };

        TaskServer::success(&status)
    }

    #[tool(
        description = "Queue a high-priority steer message for a session. Steer messages are consumed before buffered queue messages."
    )]
    async fn session_steer_message(
        &self,
        Parameters(McpSessionQueueMessageRequest {
            session_id,
            message,
            executor,
            variant,
            model_id,
        }): Parameters<McpSessionQueueMessageRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let message = message.trim().to_string();
        if message.is_empty() {
            return Self::err("Message must not be empty.", None::<&str>);
        }

        let normalized_executor = match validate_executor(&executor) {
            Ok(e) => e,
            Err(err) => return err,
        };

        let url = self.url(&format!("/api/sessions/{}/queue/steer", session_id));

        let executor_config = build_executor_config(&normalized_executor, &variant, &model_id);
        let payload = serde_json::json!({
            "message": message,
            "executor_config": executor_config,
        });

        let status: serde_json::Value =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(v) => v,
                Err(e) => return Ok(e),
            };

        TaskServer::success(&status)
    }

    #[tool(
        description = "Get the current queue status for a session, including next message plus dual pending lists: pending_steers and queued_messages."
    )]
    async fn session_get_queue(
        &self,
        Parameters(McpSessionGetQueueRequest { session_id }): Parameters<McpSessionGetQueueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/sessions/{}/queue", session_id));
        let status: serde_json::Value = match self.send_json(self.client.get(&url)).await {
            Ok(v) => v,
            Err(e) => return Ok(e),
        };

        TaskServer::success(&status)
    }

    #[tool(
        description = "Cancel queued messages for a session. mode='latest' pops one message for editor restore (returns cancelled_message). mode='all'|'queue'|'steer' clears that slice without restore."
    )]
    async fn session_cancel_queue(
        &self,
        Parameters(McpSessionCancelQueueRequest { session_id, mode }): Parameters<
            McpSessionCancelQueueRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let mode = match validate_queue_cancel_mode(mode) {
            Ok(v) => v,
            Err(err) => return err,
        };

        let url = self.url(&format!("/api/sessions/{}/queue", session_id));
        let request = if let Some(mode) = mode {
            self.client.delete(&url).query(&[("mode", mode)])
        } else {
            self.client.delete(&url)
        };

        let status: serde_json::Value = match self.send_json(request).await {
            Ok(v) => v,
            Err(e) => return Ok(e),
        };

        TaskServer::success(&status)
    }
}

#[cfg(test)]
mod tests {
    use rmcp::handler::server::tool::Parameters;
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{body_partial_json, method, path, query_param},
    };

    use super::*;

    async fn setup() -> (MockServer, TaskServer) {
        let mock = MockServer::start().await;
        let uri = mock.uri();
        let server = TaskServer::new(&uri);
        (mock, server)
    }

    fn assert_success(result: Result<CallToolResult, ErrorData>) {
        let r = result.expect("tool should not return Err");
        assert!(
            !r.is_error.unwrap_or(false),
            "expected success, got error: {:?}",
            r.content
        );
    }

    fn assert_error(result: Result<CallToolResult, ErrorData>) {
        let r = result.expect("tool should not return Err");
        assert!(
            r.is_error.unwrap_or(false),
            "expected error result, got success: {:?}",
            r.content
        );
    }

    #[tokio::test]
    async fn list_sessions_returns_sessions() {
        let (mock, server) = setup().await;
        let wid = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path("/api/sessions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": [{
                    "id": Uuid::new_v4(),
                    "workspace_id": wid,
                    "executor": "CLAUDE_CODE",
                    "created_at": "2025-01-01T00:00:00Z",
                    "updated_at": "2025-01-01T00:00:00Z"
                }]
            })))
            .mount(&mock)
            .await;

        let result = server
            .list_sessions(Parameters(McpListSessionsRequest {
                workspace_id: Some(wid),
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn list_sessions_requires_workspace_id() {
        let (_mock, server) = setup().await;

        let result = server
            .list_sessions(Parameters(McpListSessionsRequest { workspace_id: None }))
            .await;

        assert_error(result);
    }

    #[tokio::test]
    async fn get_session_returns_session() {
        let (mock, server) = setup().await;
        let sid = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{}", sid)))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": {
                    "id": sid,
                    "workspace_id": Uuid::new_v4(),
                    "executor": "AMP",
                    "created_at": "2025-01-01T00:00:00Z",
                    "updated_at": "2025-01-01T00:00:00Z"
                }
            })))
            .mount(&mock)
            .await;

        let result = server
            .get_session(Parameters(McpGetSessionRequest { session_id: sid }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn get_session_handles_not_found() {
        let (mock, server) = setup().await;
        let sid = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{}", sid)))
            .respond_with(ResponseTemplate::new(404))
            .mount(&mock)
            .await;

        let result = server
            .get_session(Parameters(McpGetSessionRequest { session_id: sid }))
            .await;

        assert_error(result);
    }

    #[tokio::test]
    async fn session_follow_up_creates_execution() {
        let (mock, server) = setup().await;
        let sid = Uuid::new_v4();

        Mock::given(method("POST"))
            .and(path(format!("/api/sessions/{}/follow-up", sid)))
            .and(body_partial_json(serde_json::json!({
                "prompt": "Fix the tests",
                "executor_config": { "executor": "CLAUDE_CODE" }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": {
                    "id": Uuid::new_v4(),
                    "session_id": sid,
                    "status": "running",
                    "run_reason": "codingagent",
                    "executor_action": {},
                    "exit_code": null,
                    "dropped": false,
                    "started_at": "2025-01-01T00:00:00Z",
                    "completed_at": null,
                    "created_at": "2025-01-01T00:00:00Z",
                    "updated_at": "2025-01-01T00:00:00Z"
                }
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_follow_up(Parameters(McpSessionFollowUpRequest {
                session_id: sid,
                prompt: "Fix the tests".to_string(),
                executor: "CLAUDE_CODE".to_string(),
                variant: None,
                model_id: None,
                retry_process_id: None,
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_follow_up_handles_api_error() {
        let (mock, server) = setup().await;
        let sid = Uuid::new_v4();

        Mock::given(method("POST"))
            .and(path(format!("/api/sessions/{}/follow-up", sid)))
            .respond_with(ResponseTemplate::new(409))
            .mount(&mock)
            .await;

        let result = server
            .session_follow_up(Parameters(McpSessionFollowUpRequest {
                session_id: sid,
                prompt: "Fix the tests".to_string(),
                executor: "AMP".to_string(),
                variant: None,
                model_id: None,
                retry_process_id: None,
            }))
            .await;

        assert_error(result);
    }

    #[tokio::test]
    async fn session_queue_message_queues_successfully() {
        let (mock, server) = setup().await;
        let sid = Uuid::new_v4();

        Mock::given(method("POST"))
            .and(path(format!("/api/sessions/{}/queue", sid)))
            .and(body_partial_json(serde_json::json!({
                "message": "Continue working",
                "executor_config": { "executor": "CLAUDE_CODE" }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": {
                    "status": "queued",
                    "next": {
                        "session_id": sid,
                        "data": {
                            "message": "Continue working",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:00Z",
                        "kind": "queue"
                    },
                    "pending_steers": [],
                    "queued_messages": [{
                        "session_id": sid,
                        "data": {
                            "message": "Continue working",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:00Z",
                        "kind": "queue"
                    }]
                }
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_queue_message(Parameters(McpSessionQueueMessageRequest {
                session_id: sid,
                message: "Continue working".to_string(),
                executor: "CLAUDE_CODE".to_string(),
                variant: None,
                model_id: None,
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_steer_message_queues_with_priority() {
        let (mock, server) = setup().await;
        let sid = Uuid::new_v4();

        Mock::given(method("POST"))
            .and(path(format!("/api/sessions/{}/queue/steer", sid)))
            .and(body_partial_json(serde_json::json!({
                "message": "Course correct now",
                "executor_config": { "executor": "CLAUDE_CODE" }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": {
                    "status": "queued",
                    "next": {
                        "session_id": sid,
                        "data": {
                            "message": "Course correct now",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:00Z",
                        "kind": "steer"
                    },
                    "pending_steers": [{
                        "session_id": sid,
                        "data": {
                            "message": "Course correct now",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:00Z",
                        "kind": "steer"
                    }],
                    "queued_messages": []
                }
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_steer_message(Parameters(McpSessionQueueMessageRequest {
                session_id: sid,
                message: "Course correct now".to_string(),
                executor: "CLAUDE_CODE".to_string(),
                variant: None,
                model_id: None,
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_get_queue_returns_status() {
        let (mock, server) = setup().await;
        let sid = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{}/queue", sid)))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": {
                    "status": "queued",
                    "next": {
                        "session_id": sid,
                        "data": {
                            "message": "s1",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:00Z",
                        "kind": "steer"
                    },
                    "pending_steers": [{
                        "session_id": sid,
                        "data": {
                            "message": "s1",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:00Z",
                        "kind": "steer"
                    }],
                    "queued_messages": [{
                        "session_id": sid,
                        "data": {
                            "message": "q1",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:00Z",
                        "kind": "queue"
                    }, {
                        "session_id": sid,
                        "data": {
                            "message": "q2",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:01Z",
                        "kind": "queue"
                    }, {
                        "session_id": sid,
                        "data": {
                            "message": "q3",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:02Z",
                        "kind": "queue"
                    }]
                }
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_get_queue(Parameters(McpSessionGetQueueRequest { session_id: sid }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_cancel_queue_cancels() {
        let (mock, server) = setup().await;
        let sid = Uuid::new_v4();

        Mock::given(method("DELETE"))
            .and(path(format!("/api/sessions/{}/queue", sid)))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": {
                    "status": { "status": "empty" },
                    "cancelled_message": {
                        "session_id": sid,
                        "data": {
                            "message": "last queued",
                            "executor_config": { "executor": "CLAUDE_CODE" }
                        },
                        "queued_at": "2025-01-01T00:00:00Z",
                        "kind": "queue"
                    }
                }
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_cancel_queue(Parameters(McpSessionCancelQueueRequest {
                session_id: sid,
                mode: None,
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_cancel_queue_with_mode_forwards_query() {
        let (mock, server) = setup().await;
        let sid = Uuid::new_v4();

        Mock::given(method("DELETE"))
            .and(path(format!("/api/sessions/{}/queue", sid)))
            .and(query_param("mode", "all"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": {
                    "status": { "status": "empty" },
                    "cancelled_message": null
                }
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_cancel_queue(Parameters(McpSessionCancelQueueRequest {
                session_id: sid,
                mode: Some("all".to_string()),
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_cancel_queue_rejects_invalid_mode() {
        let (_mock, server) = setup().await;
        let sid = Uuid::new_v4();

        let result = server
            .session_cancel_queue(Parameters(McpSessionCancelQueueRequest {
                session_id: sid,
                mode: Some("unknown".to_string()),
            }))
            .await;

        assert_error(result);
    }
}
