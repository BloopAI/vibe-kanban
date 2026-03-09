use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessStatus},
    session::Session,
};
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utils::approvals::{ApprovalOutcome, ApprovalResponse};
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
}

#[derive(Debug, Serialize)]
struct CreateSessionPayload {
    workspace_id: Uuid,
    executor: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct SessionSummary {
    #[schemars(description = "Session ID")]
    id: String,
    #[schemars(description = "Workspace ID")]
    workspace_id: String,
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

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetSessionRequest {
    #[schemars(description = "Session ID to inspect")]
    session_id: Uuid,
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
    #[schemars(description = "Optional executor override")]
    executor: Option<String>,
    #[schemars(description = "Optional executor variant override")]
    variant: Option<String>,
    #[schemars(description = "Optional model override")]
    model_id: Option<String>,
    #[schemars(description = "Optional process ID to retry from")]
    retry_process_id: Option<Uuid>,
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
struct GetExecutionRequest {
    #[schemars(description = "Execution ID to inspect")]
    execution_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct GetExecutionResponse {
    execution_id: String,
    session_id: String,
    status: String,
    is_finished: bool,
    execution: serde_json::Value,
    #[schemars(description = "Final assistant message/summary when execution has finished")]
    final_message: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SessionQueueMessageRequest {
    #[schemars(description = "Session ID to queue a message for")]
    session_id: Uuid,
    #[schemars(description = "Follow-up message to queue")]
    message: String,
    #[schemars(description = "Executor to use for the queued follow-up")]
    executor: String,
    #[schemars(description = "Optional executor variant")]
    variant: Option<String>,
    #[schemars(description = "Optional model override")]
    model_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SessionGetQueueRequest {
    #[schemars(description = "Session ID to inspect queue status for")]
    session_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SessionCancelQueueRequest {
    #[schemars(description = "Session ID to cancel a queued follow-up for")]
    session_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct StopExecutionRequest {
    #[schemars(description = "Execution ID to stop")]
    execution_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RespondApprovalRequest {
    #[schemars(description = "Approval request ID to respond to")]
    approval_id: String,
    #[schemars(description = "Execution process ID associated with this approval")]
    execution_id: Uuid,
    #[schemars(description = "Either 'approved' or 'denied'")]
    status: String,
    #[schemars(description = "Optional deny reason")]
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FinalMessageResponse {
    final_message: Option<String>,
}

#[tool_router(router = session_tools_router, vis = "pub")]
impl McpServer {
    #[tool(description = "Create a new session in a workspace.")]
    async fn create_session(
        &self,
        Parameters(CreateSessionRequest {
            workspace_id,
            executor,
        }): Parameters<CreateSessionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match self.resolve_workspace_id(workspace_id) {
            Ok(id) => id,
            Err(error_result) => return Ok(error_result),
        };
        if let Err(error_result) = self.scope_allows_workspace(workspace_id) {
            return Ok(error_result);
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
        };

        let url = self.url("/api/sessions");
        let session: Session = match self.send_json(self.client.post(&url).json(&payload)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
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
            Err(error_result) => return Ok(error_result),
        };
        if let Err(error_result) = self.scope_allows_workspace(workspace_id) {
            return Ok(error_result);
        }

        let url = self.url(&format!("/api/sessions?workspace_id={workspace_id}"));
        let sessions: Vec<Session> = match self.send_json(self.client.get(&url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
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

    #[tool(description = "Get a session by ID.")]
    async fn get_session(
        &self,
        Parameters(GetSessionRequest { session_id }): Parameters<GetSessionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let session_url = self.url(&format!("/api/sessions/{session_id}"));
        let session: Session = match self.send_json(self.client.get(&session_url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };
        if let Err(error_result) = self.scope_allows_workspace(session.workspace_id) {
            return Ok(error_result);
        }

        Self::success(&CreateSessionResponse {
            session: self.session_summary(session),
        })
    }

    #[tool(
        description = "Run a coding agent turn in an existing session and return immediately with the execution process."
    )]
    async fn run_session_prompt(
        &self,
        Parameters(RunCodingAgentInSessionRequest {
            session_id,
            prompt,
            executor,
            variant,
            model_id,
            retry_process_id,
        }): Parameters<RunCodingAgentInSessionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let prompt = prompt.trim();
        if prompt.is_empty() {
            return Self::err("prompt must not be empty", None);
        }

        let session_url = self.url(&format!("/api/sessions/{session_id}"));
        let session: Session = match self.send_json(self.client.get(&session_url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };
        if let Err(error_result) = self.scope_allows_workspace(session.workspace_id) {
            return Ok(error_result);
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

        let executor_config = match Self::executor_config_payload_for_request(
            &session, executor, variant, model_id,
        ) {
            Ok(config) => config,
            Err(error_result) => return Ok(error_result),
        };

        let payload = FollowUpPayload {
            prompt: prompt.to_string(),
            executor_config,
            retry_process_id,
            force_when_dirty: None,
            perform_git_reset: None,
        };

        let url = self.url(&format!("/api/sessions/{session_id}/follow-up"));
        let execution_process: ExecutionProcess =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(value) => value,
                Err(error_result) => return Ok(error_result),
            };

        let execution_id = execution_process.id.to_string();
        let execution = match Self::serialize_execution_process(&execution_process) {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };

        Self::success(&RunCodingAgentInSessionResponse {
            session_id: session_id.to_string(),
            execution_id,
            execution,
        })
    }

    #[tool(
        description = "Queue a follow-up message for a session. The queued message will run after the current execution finishes."
    )]
    async fn session_queue_message(
        &self,
        Parameters(SessionQueueMessageRequest {
            session_id,
            message,
            executor,
            variant,
            model_id,
        }): Parameters<SessionQueueMessageRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let message = message.trim();
        if message.is_empty() {
            return Self::err("message must not be empty", None);
        }
        let session = match self.fetch_session_scoped(session_id).await {
            Ok(session) => session,
            Err(error_result) => return Ok(error_result),
        };

        let executor_config =
            match Self::executor_config_payload_for_request(
                &session,
                Some(executor),
                variant,
                model_id,
            ) {
                Ok(config) => config,
                Err(error_result) => return Ok(error_result),
            };

        let url = self.url(&format!("/api/sessions/{session_id}/queue"));
        let status: Value = match self
            .send_json(self.client.post(&url).json(&serde_json::json!({
                "message": message,
                "executor_config": executor_config,
            })))
            .await
        {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };

        Self::success(&status)
    }

    #[tool(description = "Get the queued follow-up status for a session.")]
    async fn session_get_queue(
        &self,
        Parameters(SessionGetQueueRequest { session_id }): Parameters<SessionGetQueueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if let Err(error_result) = self.fetch_session_scoped(session_id).await {
            return Ok(error_result);
        }
        let url = self.url(&format!("/api/sessions/{session_id}/queue"));
        let status: Value = match self.send_json(self.client.get(&url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };
        Self::success(&status)
    }

    #[tool(description = "Cancel a queued follow-up for a session.")]
    async fn session_cancel_queue(
        &self,
        Parameters(SessionCancelQueueRequest { session_id }): Parameters<SessionCancelQueueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if let Err(error_result) = self.fetch_session_scoped(session_id).await {
            return Ok(error_result);
        }
        let url = self.url(&format!("/api/sessions/{session_id}/queue"));
        let status: Value = match self.send_json(self.client.delete(&url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };
        Self::success(&status)
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
                Err(error_result) => return Ok(error_result),
            };

        let session_url = self.url(&format!("/api/sessions/{}", execution_process.session_id));
        let session: Session = match self.send_json(self.client.get(&session_url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };
        if let Err(error_result) = self.scope_allows_workspace(session.workspace_id) {
            return Ok(error_result);
        }

        let is_finished = execution_process.status != ExecutionProcessStatus::Running;

        let execution_process_value = match Self::serialize_execution_process(&execution_process) {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };

        let final_message = if is_finished {
            self.final_message_for_execution(execution_id).await
        } else {
            None
        };

        Self::success(&GetExecutionResponse {
            execution_id: execution_process.id.to_string(),
            session_id: execution_process.session_id.to_string(),
            status: Self::execution_process_status_label(&execution_process.status).to_string(),
            is_finished,
            execution: execution_process_value,
            final_message,
        })
    }

    #[tool(description = "Stop a running execution process.")]
    async fn stop_execution(
        &self,
        Parameters(StopExecutionRequest { execution_id }): Parameters<StopExecutionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if let Err(error_result) = self.fetch_execution_scoped(execution_id).await {
            return Ok(error_result);
        }
        let url = self.url(&format!("/api/execution-processes/{execution_id}/stop"));
        if let Err(error_result) = self.send_empty_json(self.client.post(&url)).await {
            return Ok(error_result);
        }

        Self::success(&serde_json::json!({
            "success": true,
            "execution_id": execution_id.to_string(),
            "status": "killed"
        }))
    }

    #[tool(description = "Respond to a pending approval request from a coding agent.")]
    async fn respond_approval(
        &self,
        Parameters(RespondApprovalRequest {
            approval_id,
            execution_id,
            status,
            reason,
        }): Parameters<RespondApprovalRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let status = status.trim().to_ascii_lowercase();
        let approval_status = match status.as_str() {
            "approved" | "approve" => ApprovalOutcome::Approved,
            "denied" | "deny" => ApprovalOutcome::Denied {
                reason: reason.and_then(|reason| {
                    let trimmed = reason.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                }),
            },
            _ => {
                return Self::err(
                    format!("invalid approval status '{status}'"),
                    Some("use 'approved' or 'denied'".to_string()),
                );
            }
        };

        if let Err(error_result) = self.fetch_execution_scoped(execution_id).await {
            return Ok(error_result);
        }

        let approval_response = ApprovalResponse {
            execution_process_id: execution_id,
            status: approval_status,
        };

        let url = self.url(&format!("/api/approvals/{approval_id}/respond"));
        let outcome: Value = match self
            .send_json(self.client.post(&url).json(&approval_response))
            .await
        {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };

        Self::success(&outcome)
    }
}

impl McpServer {
    async fn fetch_session_scoped(&self, session_id: Uuid) -> Result<Session, CallToolResult> {
        let session_url = self.url(&format!("/api/sessions/{session_id}"));
        let session: Session = self.send_json(self.client.get(&session_url)).await?;
        self.scope_allows_workspace(session.workspace_id)?;
        Ok(session)
    }

    async fn fetch_execution_scoped(
        &self,
        execution_id: Uuid,
    ) -> Result<ExecutionProcess, CallToolResult> {
        let process_url = self.url(&format!("/api/execution-processes/{execution_id}"));
        let execution_process: ExecutionProcess = self.send_json(self.client.get(&process_url)).await?;
        let _session = self.fetch_session_scoped(execution_process.session_id).await?;
        Ok(execution_process)
    }

    fn executor_config_payload_for_request(
        session: &Session,
        executor: Option<String>,
        variant: Option<String>,
        model_id: Option<String>,
    ) -> Result<ExecutorConfigPayload, CallToolResult> {
        let executor = executor.or_else(|| session.executor.clone());
        Self::executor_config_payload_from_values(executor, variant, model_id)
    }

    fn executor_config_payload_from_values(
        executor: Option<String>,
        variant: Option<String>,
        model_id: Option<String>,
    ) -> Result<ExecutorConfigPayload, CallToolResult> {
        Ok(ExecutorConfigPayload {
            executor: Self::normalize_executor_name(executor.as_deref())?,
            variant: variant.and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }),
            model_id: model_id.and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }),
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
            executor: session.executor,
            created_at: session.created_at.to_rfc3339(),
            updated_at: session.updated_at.to_rfc3339(),
            is_orchestrator_session,
        }
    }

    fn serialize_execution_process(
        execution_process: &ExecutionProcess,
    ) -> Result<serde_json::Value, CallToolResult> {
        serde_json::to_value(execution_process).map_err(|error| {
            Self::err(
                "Failed to serialize execution process response".to_string(),
                Some(error.to_string()),
            )
            .unwrap()
        })
    }

    async fn final_message_for_execution(&self, execution_id: Uuid) -> Option<String> {
        let url = self.url(&format!(
            "/api/execution-processes/{execution_id}/final-message"
        ));
        self.send_json::<FinalMessageResponse>(self.client.get(&url))
            .await
            .ok()
            .and_then(|response| response.final_message)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Once;

    use rmcp::handler::server::tool::Parameters;
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{body_partial_json, method, path},
    };

    use super::*;

    fn install_rustls_provider() {
        static ONCE: Once = Once::new();
        ONCE.call_once(|| {
            let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        });
    }

    async fn setup() -> (MockServer, McpServer) {
        install_rustls_provider();
        let mock = MockServer::start().await;
        let server = McpServer::new_global(&mock.uri());
        (mock, server)
    }

    fn assert_success(result: Result<CallToolResult, ErrorData>) -> CallToolResult {
        let result = result.expect("tool should not return Err");
        assert!(
            !result.is_error.unwrap_or(false),
            "expected success, got error: {:?}",
            result.content
        );
        result
    }

    fn assert_error(result: Result<CallToolResult, ErrorData>) -> CallToolResult {
        let result = result.expect("tool should not return Err");
        assert!(
            result.is_error.unwrap_or(false),
            "expected error result, got success: {:?}",
            result.content
        );
        result
    }

    fn sample_session(
        session_id: Uuid,
        workspace_id: Uuid,
        executor: Option<&str>,
    ) -> serde_json::Value {
        serde_json::json!({
            "id": session_id,
            "workspace_id": workspace_id,
            "executor": executor,
            "created_at": "2026-03-09T00:00:00Z",
            "updated_at": "2026-03-09T00:00:00Z"
        })
    }

    fn sample_execution(execution_id: Uuid, session_id: Uuid, status: &str) -> serde_json::Value {
        serde_json::json!({
            "id": execution_id,
            "session_id": session_id,
            "run_reason": "codingagent",
            "executor_action": {
                "typ": {
                    "type": "CodingAgentFollowUpRequest",
                    "prompt": "hello",
                    "session_id": "agent-session-1",
                    "reset_to_message_id": null,
                    "executor_config": { "executor": "CODEX" },
                    "working_dir": "exomind"
                },
                "next_action": null
            },
            "status": status,
            "exit_code": if status == "completed" { serde_json::json!(0) } else { serde_json::Value::Null },
            "dropped": false,
            "started_at": "2026-03-09T00:00:00Z",
            "completed_at": if status == "completed" { serde_json::json!("2026-03-09T00:01:00Z") } else { serde_json::Value::Null },
            "created_at": "2026-03-09T00:00:00Z",
            "updated_at": "2026-03-09T00:00:00Z"
        })
    }

    fn scoped_orchestrator_server(mock: &MockServer, workspace_id: Uuid) -> McpServer {
        McpServer {
            client: reqwest::Client::new(),
            base_url: mock.uri(),
            tool_router: McpServer::orchestrator_mode_router(),
            context: Some(crate::task_server::McpContext {
                organization_id: None,
                project_id: None,
                issue_id: None,
                orchestrator_session_id: Some(Uuid::new_v4()),
                workspace_id,
                workspace_branch: "main".to_string(),
                workspace_repos: vec![],
            }),
            mode: crate::task_server::McpMode::Orchestrator,
        }
    }

    #[tokio::test]
    async fn get_session_returns_session_summary() {
        let (mock, server) = setup().await;
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        let result = server
            .get_session(Parameters(GetSessionRequest { session_id }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_queue_message_posts_trimmed_payload() {
        let (mock, server) = setup().await;
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        Mock::given(method("POST"))
            .and(path(format!("/api/sessions/{session_id}/queue")))
            .and(body_partial_json(serde_json::json!({
                "message": "ship it",
                "executor_config": {
                    "executor": "CODEX",
                    "variant": "PLAN",
                    "model_id": "gpt-5.4"
                }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": { "status": "queued" }
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_queue_message(Parameters(SessionQueueMessageRequest {
                session_id,
                message: "  ship it  ".to_string(),
                executor: "codex".to_string(),
                variant: Some(" PLAN ".to_string()),
                model_id: Some(" gpt-5.4 ".to_string()),
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_get_queue_returns_status() {
        let (mock, server) = setup().await;
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}/queue")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": { "status": "empty" }
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_get_queue(Parameters(SessionGetQueueRequest { session_id }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_cancel_queue_deletes_queue() {
        let (mock, server) = setup().await;
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        Mock::given(method("DELETE"))
            .and(path(format!("/api/sessions/{session_id}/queue")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": { "status": "empty" }
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_cancel_queue(Parameters(SessionCancelQueueRequest { session_id }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn stop_execution_posts_stop_request() {
        let (mock, server) = setup().await;
        let execution_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/execution-processes/{execution_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_execution(execution_id, session_id, "running")
            })))
            .mount(&mock)
            .await;

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        Mock::given(method("POST"))
            .and(path(format!(
                "/api/execution-processes/{execution_id}/stop"
            )))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": null
            })))
            .mount(&mock)
            .await;

        let result = server
            .stop_execution(Parameters(StopExecutionRequest { execution_id }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn respond_approval_denied_trims_reason() {
        let (mock, server) = setup().await;
        let execution_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/execution-processes/{execution_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_execution(execution_id, session_id, "running")
            })))
            .mount(&mock)
            .await;

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        Mock::given(method("POST"))
            .and(path("/api/approvals/approval-1/respond"))
            .and(body_partial_json(serde_json::json!({
                "execution_process_id": execution_id,
                "status": { "status": "denied", "reason": "Too risky" }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": { "status": "denied" }
            })))
            .mount(&mock)
            .await;

        let result = server
            .respond_approval(Parameters(RespondApprovalRequest {
                approval_id: "approval-1".to_string(),
                execution_id,
                status: " denied ".to_string(),
                reason: Some("  Too risky  ".to_string()),
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn respond_approval_rejects_invalid_status() {
        let (_mock, server) = setup().await;
        let execution_id = Uuid::new_v4();

        let result = server
            .respond_approval(Parameters(RespondApprovalRequest {
                approval_id: "approval-1".to_string(),
                execution_id,
                status: "maybe".to_string(),
                reason: None,
            }))
            .await;

        assert_error(result);
    }

    #[tokio::test]
    async fn run_session_prompt_posts_explicit_executor_overrides_and_retry_process_id() {
        let (mock, server) = setup().await;
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let retry_process_id = Uuid::new_v4();
        let execution_id = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        Mock::given(method("POST"))
            .and(path(format!("/api/sessions/{session_id}/follow-up")))
            .and(body_partial_json(serde_json::json!({
                "prompt": "inspect repo",
                "retry_process_id": retry_process_id,
                "executor_config": {
                    "executor": "CODEX",
                    "variant": "PLAN",
                    "model_id": "gpt-5.4"
                }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_execution(execution_id, session_id, "running")
            })))
            .mount(&mock)
            .await;

        let result = server
            .run_session_prompt(Parameters(RunCodingAgentInSessionRequest {
                session_id,
                prompt: " inspect repo ".to_string(),
                executor: Some("codex".to_string()),
                variant: Some(" PLAN ".to_string()),
                model_id: Some(" gpt-5.4 ".to_string()),
                retry_process_id: Some(retry_process_id),
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn get_execution_includes_final_message_when_finished() {
        let (mock, server) = setup().await;
        let execution_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/execution-processes/{execution_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_execution(execution_id, session_id, "completed")
            })))
            .mount(&mock)
            .await;

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        Mock::given(method("GET"))
            .and(path(format!(
                "/api/execution-processes/{execution_id}/final-message"
            )))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": { "final_message": "done" }
            })))
            .mount(&mock)
            .await;

        let result = server
            .get_execution(Parameters(GetExecutionRequest { execution_id }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn session_queue_message_rejects_session_outside_orchestrator_scope() {
        let (mock, _server) = setup().await;
        let scoped_workspace_id = Uuid::new_v4();
        let other_workspace_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let server = scoped_orchestrator_server(&mock, scoped_workspace_id);

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, other_workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        let result = server
            .session_queue_message(Parameters(SessionQueueMessageRequest {
                session_id,
                message: "ship it".to_string(),
                executor: "codex".to_string(),
                variant: None,
                model_id: None,
            }))
            .await;

        assert_error(result);
    }

    #[tokio::test]
    async fn stop_execution_rejects_execution_outside_orchestrator_scope() {
        let (mock, _server) = setup().await;
        let scoped_workspace_id = Uuid::new_v4();
        let other_workspace_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let execution_id = Uuid::new_v4();
        let server = scoped_orchestrator_server(&mock, scoped_workspace_id);

        Mock::given(method("GET"))
            .and(path(format!("/api/execution-processes/{execution_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_execution(execution_id, session_id, "running")
            })))
            .mount(&mock)
            .await;

        Mock::given(method("GET"))
            .and(path(format!("/api/sessions/{session_id}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": sample_session(session_id, other_workspace_id, Some("CODEX"))
            })))
            .mount(&mock)
            .await;

        let result = server
            .stop_execution(Parameters(StopExecutionRequest { execution_id }))
            .await;

        assert_error(result);
    }
}
