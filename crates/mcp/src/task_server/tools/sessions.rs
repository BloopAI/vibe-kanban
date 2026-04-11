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
    status: String,
    is_finished: bool,
    execution: serde_json::Value,
    #[schemars(description = "Final assistant message/summary when execution has finished")]
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
            status: Self::execution_process_status_label(&execution_process.status).to_string(),
            is_finished,
            execution: execution_process_value,
            final_message: None,
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
