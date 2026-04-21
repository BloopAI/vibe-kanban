use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessStatus},
    session::Session,
};
use rmcp::{
    ErrorData, handler::server::wrapper::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::McpServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateSessionRequest {
    #[schemars(
        description = "Workspace ID to create the session in. Optional when running inside a scoped orchestrator MCP."
    )]
    workspace_id: Option<Uuid>,
    #[schemars(description = "Optional executor to pin this session to")]
    executor: Option<String>,
    #[schemars(description = "Optional display name for the session")]
    name: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateSessionPayload {
    workspace_id: Uuid,
    executor: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct SessionSummary {
    #[schemars(description = "Session ID")]
    id: String,
    #[schemars(description = "Workspace ID")]
    workspace_id: String,
    #[schemars(description = "Session display name (if set)")]
    name: Option<String>,
    #[schemars(description = "Session executor (if set)")]
    executor: Option<String>,
    #[schemars(description = "Creation timestamp")]
    created_at: String,
    #[schemars(description = "Last update timestamp")]
    updated_at: String,
    #[schemars(description = "True if this is the orchestrator session for this MCP server")]
    is_orchestrator_session: bool,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct CreateSessionResponse {
    session: SessionSummary,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListSessionsRequest {
    #[schemars(
        description = "Workspace ID to inspect. Optional when running inside a scoped orchestrator MCP."
    )]
    workspace_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ListSessionsResponse {
    #[schemars(description = "Workspace ID this result is scoped to")]
    workspace_id: String,
    total_count: usize,
    sessions: Vec<SessionSummary>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RunCodingAgentInSessionRequest {
    #[schemars(description = "Session ID to run the coding agent in")]
    session_id: Uuid,
    #[schemars(description = "Prompt for the coding agent")]
    prompt: String,
}

#[derive(Debug, Serialize)]
struct FollowUpPayload {
    prompt: String,
    executor_config: ExecutorConfigPayload,
    retry_process_id: Option<Uuid>,
    force_when_dirty: Option<bool>,
    perform_git_reset: Option<bool>,
}

#[derive(Debug, Serialize)]
struct ExecutorConfigPayload {
    executor: String,
    variant: Option<String>,
    model_id: Option<String>,
    agent_id: Option<String>,
    reasoning_id: Option<String>,
    permission_policy: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct RunCodingAgentInSessionResponse {
    session_id: String,
    execution_id: String,
    execution: serde_json::Value,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateSessionRequest {
    #[schemars(description = "Session ID to update")]
    session_id: Uuid,
    #[schemars(description = "Set session display name (empty string clears it)")]
    name: Option<String>,
}

#[derive(Debug, Serialize)]
struct UpdateSessionPayload {
    name: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct UpdateSessionResponse {
    success: bool,
    session_id: String,
    name: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetExecutionRequest {
    #[schemars(description = "Execution ID to inspect")]
    execution_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct GetExecutionResponse {
    execution_id: String,
    session_id: String,
    /// Machine-readable execution status (wire format: lowercase string).
    #[schemars(with = "String")]
    status: db::models::execution_process::ExecutionProcessStatus,
    is_finished: bool,
    execution: serde_json::Value,
    /// Structured failure info populated by the server on error paths.
    /// Currently always `None` for `get_execution` because failure metadata
    /// is not persisted on `ExecutionProcess` yet — surfaces only on
    /// in-flight spawn failures via `follow_up` / `create_and_start_workspace`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<serde_json::Value>")]
    error: Option<utils::response::ApiErrorEnvelope>,
    /// Deprecated — always `null`. Use `read_session_messages`.
    #[schemars(description = "DEPRECATED — always null. Use read_session_messages instead.")]
    final_message: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ReadSessionMessagesRequest {
    #[schemars(
        description = "Workspace ID to read messages from. Optional when running inside a scoped orchestrator MCP."
    )]
    workspace_id: Option<Uuid>,
    #[schemars(
        description = "Session ID to read from. If omitted, the most recently used session in the workspace is used."
    )]
    session_id: Option<Uuid>,
    #[schemars(description = "Return only the last N messages (server clamps to its maximum)")]
    last_n: Option<u32>,
    #[schemars(description = "Return messages starting from this (0-based) index")]
    from_index: Option<u32>,
    #[schemars(description = "If true, include thinking/reasoning entries in the output")]
    include_thinking: Option<bool>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct SessionMessageSummary {
    index: u32,
    entry_type: String,
    content: String,
    timestamp: Option<String>,
    #[schemars(with = "Option<serde_json::Value>")]
    metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ReadSessionMessagesResponse {
    #[schemars(description = "Session ID the messages were read from")]
    session_id: String,
    messages: Vec<SessionMessageSummary>,
    total_count: u32,
    has_more: bool,
    final_assistant_message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RestSessionMessagesResponse {
    messages: Vec<RestSessionMessage>,
    total_count: u32,
    has_more: bool,
    final_assistant_message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RestSessionMessage {
    index: u32,
    entry_type: String,
    content: String,
    timestamp: Option<String>,
    metadata: Option<serde_json::Value>,
}

#[tool_router(router = session_tools_router, vis = "pub")]
impl McpServer {
    #[tool(description = "Create a new session in a workspace.")]
    async fn create_session(
        &self,
        Parameters(CreateSessionRequest {
            workspace_id,
            executor,
            name,
        }): Parameters<CreateSessionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match self.resolve_workspace_id(workspace_id) {
            Ok(id) => id,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };
        if let Err(error_result) = self.scope_allows_workspace(workspace_id) {
            return Ok(Self::tool_error(error_result));
        }

        let payload = CreateSessionPayload {
            workspace_id,
            executor: executor.and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }),
            name: name.and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }),
        };

        let url = self.url("/api/sessions");
        let session: Session = match self.send_json(self.client.post(&url).json(&payload)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };

        Self::success(&CreateSessionResponse {
            session: self.session_summary(session),
        })
    }

    #[tool(description = "List all sessions for a workspace.")]
    async fn list_sessions(
        &self,
        Parameters(ListSessionsRequest { workspace_id }): Parameters<ListSessionsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match self.resolve_workspace_id(workspace_id) {
            Ok(id) => id,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };
        if let Err(error_result) = self.scope_allows_workspace(workspace_id) {
            return Ok(Self::tool_error(error_result));
        }

        let url = self.url(&format!("/api/sessions?workspace_id={workspace_id}"));
        let sessions: Vec<Session> = match self.send_json(self.client.get(&url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };

        let sessions = sessions
            .into_iter()
            .map(|session| self.session_summary(session))
            .collect::<Vec<_>>();

        Self::success(&ListSessionsResponse {
            workspace_id: workspace_id.to_string(),
            total_count: sessions.len(),
            sessions,
        })
    }

    #[tool(description = "Update a session's name. `session_id` is required.")]
    async fn update_session(
        &self,
        Parameters(UpdateSessionRequest { session_id, name }): Parameters<UpdateSessionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Verify session exists and check scope
        let session_url = self.url(&format!("/api/sessions/{session_id}"));
        let session: Session = match self.send_json(self.client.get(&session_url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };
        if let Err(error_result) = self.scope_allows_workspace(session.workspace_id) {
            return Ok(Self::tool_error(error_result));
        }

        let payload = UpdateSessionPayload {
            name: name.map(|value| value.trim().to_string()),
        };
        let url = self.url(&format!("/api/sessions/{session_id}"));
        let updated: Session = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };

        Self::success(&UpdateSessionResponse {
            success: true,
            session_id: updated.id.to_string(),
            name: updated.name,
        })
    }

    #[tool(
        description = "Run a coding agent turn in an existing session and return immediately with the execution process."
    )]
    async fn run_session_prompt(
        &self,
        Parameters(RunCodingAgentInSessionRequest { session_id, prompt }): Parameters<
            RunCodingAgentInSessionRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let prompt = prompt.trim();
        if prompt.is_empty() {
            return Self::err("prompt must not be empty", None);
        }

        let session_url = self.url(&format!("/api/sessions/{session_id}"));
        let session: Session = match self.send_json(self.client.get(&session_url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };
        if let Err(error_result) = self.scope_allows_workspace(session.workspace_id) {
            return Ok(Self::tool_error(error_result));
        }
        if self.orchestrator_session_id() == Some(session_id) {
            return Self::err(
                "Cannot run coding agent in the orchestrator session".to_string(),
                Some(
                    "Create or re-use a different session and run the coding agent there."
                        .to_string(),
                ),
            );
        }

        let executor_config = match Self::executor_config_payload_for_session(&session) {
            Ok(config) => config,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };

        let payload = FollowUpPayload {
            prompt: prompt.to_string(),
            executor_config,
            retry_process_id: None,
            force_when_dirty: None,
            perform_git_reset: None,
        };

        let url = self.url(&format!("/api/sessions/{session_id}/follow-up"));
        let execution_process: ExecutionProcess =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(value) => value,
                Err(error_result) => return Ok(Self::tool_error(error_result)),
            };

        let execution_id = execution_process.id.to_string();
        let execution = match Self::serialize_execution_process(&execution_process) {
            Ok(value) => value,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };

        Self::success(&RunCodingAgentInSessionResponse {
            session_id: session_id.to_string(),
            execution_id,
            execution,
        })
    }

    #[tool(description = "Get status for an execution.")]
    async fn get_execution(
        &self,
        Parameters(GetExecutionRequest { execution_id }): Parameters<GetExecutionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let process_url = self.url(&format!("/api/execution-processes/{execution_id}"));
        let execution_process: ExecutionProcess =
            match self.send_json(self.client.get(&process_url)).await {
                Ok(value) => value,
                Err(error_result) => return Ok(Self::tool_error(error_result)),
            };

        let session_url = self.url(&format!("/api/sessions/{}", execution_process.session_id));
        let session: Session = match self.send_json(self.client.get(&session_url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };
        if let Err(error_result) = self.scope_allows_workspace(session.workspace_id) {
            return Ok(Self::tool_error(error_result));
        }

        let is_finished = execution_process.status != ExecutionProcessStatus::Running;

        let execution_process_value = match Self::serialize_execution_process(&execution_process) {
            Ok(value) => value,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };

        Self::success(&GetExecutionResponse {
            execution_id: execution_process.id.to_string(),
            session_id: execution_process.session_id.to_string(),
            status: execution_process.status.clone(),
            is_finished,
            execution: execution_process_value,
            // TODO: populate from persisted failure metadata once `ExecutionProcess`
            // carries failure columns (e.g. `failure_kind`, `stderr_tail`). Today the
            // in-flight spawn-failure path surfaces `ApiErrorEnvelope` via the
            // `follow_up` / `create_and_start_workspace` HTTP error body (Task 1.5),
            // but `get_execution` reads a stored row that has no envelope yet.
            error: None,
            final_message: None,
        })
    }

    #[tool(
        description = "Read normalized conversation messages for a session. If `session_id` is omitted, the most recently used session in `workspace_id` is selected. Server defaults apply to paging when `last_n`/`from_index` are not provided; `include_thinking` defaults to false."
    )]
    async fn read_session_messages(
        &self,
        Parameters(ReadSessionMessagesRequest {
            workspace_id,
            session_id,
            last_n,
            from_index,
            include_thinking,
        }): Parameters<ReadSessionMessagesRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match self.resolve_workspace_id(workspace_id) {
            Ok(id) => id,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };
        if let Err(error_result) = self.scope_allows_workspace(workspace_id) {
            return Ok(Self::tool_error(error_result));
        }

        let session_id = match session_id {
            Some(id) => id,
            None => {
                let list_url = self.url(&format!("/api/sessions?workspace_id={workspace_id}"));
                let sessions: Vec<Session> = match self.send_json(self.client.get(&list_url)).await
                {
                    Ok(value) => value,
                    Err(error_result) => return Ok(Self::tool_error(error_result)),
                };
                // Server returns sessions ordered by `last_used DESC`, so the first
                // element is the most recently used session.
                match sessions.into_iter().next() {
                    Some(session) => session.id,
                    None => {
                        return Self::err(
                            format!("No sessions found for workspace_id={workspace_id}"),
                            Some(
                                "Create a session first via `create_session`, or pass an explicit `session_id`."
                                    .to_string(),
                            ),
                        );
                    }
                }
            }
        };

        let mut query_params: Vec<(String, String)> = Vec::new();
        if let Some(value) = last_n {
            query_params.push(("last_n".to_string(), value.to_string()));
        }
        if let Some(value) = from_index {
            query_params.push(("from_index".to_string(), value.to_string()));
        }
        if let Some(value) = include_thinking {
            query_params.push(("include_thinking".to_string(), value.to_string()));
        }

        let path = format!("/api/sessions/{session_id}/messages");
        let url = self.url(&path);
        let request = self.client.get(&url).query(&query_params);

        let response: RestSessionMessagesResponse = match self.send_json(request).await {
            Ok(value) => value,
            Err(error_result) => return Ok(Self::tool_error(error_result)),
        };

        let messages = response
            .messages
            .into_iter()
            .map(|message| SessionMessageSummary {
                index: message.index,
                entry_type: message.entry_type,
                content: message.content,
                timestamp: message.timestamp,
                metadata: message.metadata,
            })
            .collect::<Vec<_>>();

        Self::success(&ReadSessionMessagesResponse {
            session_id: session_id.to_string(),
            messages,
            total_count: response.total_count,
            has_more: response.has_more,
            final_assistant_message: response.final_assistant_message,
        })
    }
}

impl McpServer {
    fn executor_config_payload_for_session(
        session: &Session,
    ) -> Result<ExecutorConfigPayload, super::ToolError> {
        Ok(ExecutorConfigPayload {
            executor: Self::normalize_executor_name(session.executor.as_deref())?,
            variant: None,
            model_id: None,
            agent_id: None,
            reasoning_id: None,
            permission_policy: None,
        })
    }

    fn session_summary(&self, session: Session) -> SessionSummary {
        let is_orchestrator_session = self.orchestrator_session_id() == Some(session.id);
        SessionSummary {
            id: session.id.to_string(),
            workspace_id: session.workspace_id.to_string(),
            name: session.name,
            executor: session.executor,
            created_at: session.created_at.to_rfc3339(),
            updated_at: session.updated_at.to_rfc3339(),
            is_orchestrator_session,
        }
    }

    fn serialize_execution_process(
        execution_process: &ExecutionProcess,
    ) -> Result<serde_json::Value, super::ToolError> {
        serde_json::to_value(execution_process).map_err(|error| {
            super::ToolError::new(
                "Failed to serialize execution process response",
                Some(error.to_string()),
            )
        })
    }
}

#[cfg(test)]
mod get_execution_tests {
    use db::models::execution_process::ExecutionProcessStatus;

    use super::*;

    #[test]
    fn status_serializes_lowercase() {
        let resp = GetExecutionResponse {
            execution_id: "abc".into(),
            session_id: "def".into(),
            status: ExecutionProcessStatus::Failed,
            is_finished: true,
            execution: serde_json::json!({}),
            error: Some(utils::response::ApiErrorEnvelope {
                kind: "auth_required".into(),
                retryable: false,
                human_intervention_required: true,
                stderr_tail: None,
                program: None,
            }),
            final_message: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["status"], "failed");
        assert_eq!(v["error"]["kind"], "auth_required");
        assert_eq!(v["error"]["retryable"], false);
        assert_eq!(v["error"]["human_intervention_required"], true);
    }

    #[test]
    fn final_message_stays_none() {
        // D11: final_message always None; manager must use read_session_messages.
        let resp = GetExecutionResponse {
            execution_id: "a".into(),
            session_id: "b".into(),
            status: ExecutionProcessStatus::Completed,
            is_finished: true,
            execution: serde_json::json!({}),
            error: None,
            final_message: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(
            v["final_message"].is_null(),
            "final_message should be null: {json}"
        );
        assert!(
            v.get("error").is_none(),
            "error should be omitted when None: {json}"
        );
    }
}

#[cfg(test)]
mod read_session_messages_tests {
    use super::*;

    #[test]
    fn request_deserialises_with_defaults() {
        let workspace_id = Uuid::new_v4();
        let value = serde_json::json!({ "workspace_id": workspace_id });
        let req: ReadSessionMessagesRequest = serde_json::from_value(value).unwrap();
        assert_eq!(req.workspace_id, Some(workspace_id));
        assert!(req.session_id.is_none());
        assert!(req.last_n.is_none());
        assert!(req.from_index.is_none());
        assert!(req.include_thinking.is_none());
    }

    #[test]
    fn request_accepts_explicit_session_id() {
        let session_id = Uuid::new_v4();
        let value = serde_json::json!({
            "session_id": session_id,
            "last_n": 25,
            "include_thinking": true,
        });
        let req: ReadSessionMessagesRequest = serde_json::from_value(value).unwrap();
        assert!(req.workspace_id.is_none());
        assert_eq!(req.session_id, Some(session_id));
        assert_eq!(req.last_n, Some(25));
        assert!(req.from_index.is_none());
        assert_eq!(req.include_thinking, Some(true));
    }

    #[test]
    fn response_serialises_empty_state() {
        let resp = ReadSessionMessagesResponse {
            session_id: "abc".into(),
            messages: Vec::new(),
            total_count: 0,
            has_more: false,
            final_assistant_message: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["session_id"], "abc");
        assert!(v["messages"].is_array());
        assert_eq!(v["messages"].as_array().unwrap().len(), 0);
        assert_eq!(v["total_count"], 0);
        assert_eq!(v["has_more"], false);
        assert!(v["final_assistant_message"].is_null());
    }

    #[test]
    fn response_round_trips_messages() {
        let resp = ReadSessionMessagesResponse {
            session_id: "s1".into(),
            messages: vec![SessionMessageSummary {
                index: 3,
                entry_type: "assistant_message".into(),
                content: "hello".into(),
                timestamp: Some("2026-04-21T00:00:00Z".into()),
                metadata: Some(serde_json::json!({ "model": "claude" })),
            }],
            total_count: 1,
            has_more: true,
            final_assistant_message: Some("hello".into()),
        };
        let json = serde_json::to_string(&resp).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["session_id"], "s1");
        assert_eq!(v["total_count"], 1);
        assert_eq!(v["has_more"], true);
        assert_eq!(v["final_assistant_message"], "hello");
        let messages = v["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["index"], 3);
        assert_eq!(messages[0]["entry_type"], "assistant_message");
        assert_eq!(messages[0]["content"], "hello");
        assert_eq!(messages[0]["timestamp"], "2026-04-21T00:00:00Z");
        assert_eq!(messages[0]["metadata"]["model"], "claude");
    }

    #[test]
    fn rest_response_deserialises() {
        let value = serde_json::json!({
            "messages": [
                {
                    "index": 0,
                    "entry_type": "user_message",
                    "content": "hi",
                    "timestamp": null,
                    "metadata": null,
                },
                {
                    "index": 1,
                    "entry_type": "assistant_message",
                    "content": "hello back",
                    "timestamp": "2026-04-21T01:02:03Z",
                    "metadata": { "tokens": 7 },
                }
            ],
            "total_count": 2,
            "has_more": false,
            "final_assistant_message": "hello back",
        });
        let parsed: RestSessionMessagesResponse = serde_json::from_value(value).unwrap();
        assert_eq!(parsed.total_count, 2);
        assert!(!parsed.has_more);
        assert_eq!(
            parsed.final_assistant_message.as_deref(),
            Some("hello back")
        );
        assert_eq!(parsed.messages.len(), 2);
        assert_eq!(parsed.messages[0].index, 0);
        assert_eq!(parsed.messages[0].entry_type, "user_message");
        assert_eq!(parsed.messages[0].content, "hi");
        assert!(parsed.messages[0].timestamp.is_none());
        assert!(parsed.messages[0].metadata.is_none());
        assert_eq!(parsed.messages[1].index, 1);
        assert_eq!(
            parsed.messages[1].timestamp.as_deref(),
            Some("2026-04-21T01:02:03Z")
        );
        assert_eq!(
            parsed.messages[1]
                .metadata
                .as_ref()
                .and_then(|m| m.get("tokens"))
                .and_then(|v| v.as_u64()),
            Some(7)
        );
    }
}
