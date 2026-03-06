use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessStatus},
    requests::UpdateWorkspace,
    session::Session,
    workspace::Workspace,
};
use rmcp::{
    ErrorData,
    handler::server::tool::Parameters,
    model::{CallToolResult, Content},
    schemars, tool, tool_router,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use uuid::Uuid;

use super::{ApiResponseEnvelope, WorkspaceServer};

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
    #[schemars(description = "True if this is the session currently attached to this MCP server")]
    is_attached_session: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateSessionRequest {
    #[schemars(description = "Optional executor to pin this session to")]
    executor: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateSessionPayload {
    workspace_id: Uuid,
    executor: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct CreateSessionResponse {
    session: SessionSummary,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ListSessionsResponse {
    #[schemars(description = "Workspace ID this MCP instance is scoped to")]
    workspace_id: String,
    #[schemars(description = "Session ID currently attached to this MCP server, if available")]
    attached_session_id: Option<String>,
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

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetExecutionStatusRequest {
    #[schemars(description = "Execution process ID to inspect")]
    execution_process_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RenameWorkspaceRequest {
    #[schemars(description = "New display name for the configured workspace")]
    name: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct OutputMarkdownRequest {
    #[schemars(description = "Markdown content to output directly to the user")]
    markdown: String,
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
    execution_process_id: String,
    execution_process: serde_json::Value,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct GetExecutionStatusResponse {
    execution_process_id: String,
    session_id: String,
    status: String,
    is_finished: bool,
    execution_process: serde_json::Value,
    #[schemars(description = "Final assistant message/summary when execution has finished")]
    final_message: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct RenameWorkspaceResponse {
    success: bool,
    workspace_id: String,
    name: Option<String>,
}

#[tool_router(router = workspace_tools_router, vis = "pub")]
impl WorkspaceServer {
    #[tool(description = "Create a new session in the configured workspace.")]
    async fn create_session(
        &self,
        Parameters(CreateSessionRequest { executor }): Parameters<CreateSessionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let payload = CreateSessionPayload {
            workspace_id: self.workspace_id,
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

    #[tool(description = "List all sessions for the configured workspace.")]
    async fn list_sessions(&self) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/sessions?workspace_id={}", self.workspace_id));
        let sessions: Vec<Session> = match self.send_json(self.client.get(&url)).await {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };

        let sessions = sessions
            .into_iter()
            .map(|session| self.session_summary(session))
            .collect::<Vec<_>>();

        Self::success(&ListSessionsResponse {
            workspace_id: self.workspace_id.to_string(),
            attached_session_id: self.attached_session_id.map(|id| id.to_string()),
            total_count: sessions.len(),
            sessions,
        })
    }

    #[tool(description = "Rename the configured workspace.")]
    async fn rename_workspace(
        &self,
        Parameters(RenameWorkspaceRequest { name }): Parameters<RenameWorkspaceRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let name = name.trim();
        if name.is_empty() {
            return Self::err("name must not be empty", None);
        }

        let url = self.url(&format!("/api/task-attempts/{}", self.workspace_id));
        let payload = UpdateWorkspace {
            archived: None,
            pinned: None,
            name: Some(name.to_string()),
        };

        let updated_workspace: Workspace =
            match self.send_json(self.client.put(&url).json(&payload)).await {
                Ok(value) => value,
                Err(error_result) => return Ok(error_result),
            };

        Self::success(&RenameWorkspaceResponse {
            success: true,
            workspace_id: updated_workspace.id.to_string(),
            name: updated_workspace.name,
        })
    }

    #[tool(
        description = "Output markdown content directly to the user. Use this tool when you want the user to see formatted markdown text."
    )]
    async fn output_markdown_to_user(
        &self,
        Parameters(OutputMarkdownRequest { markdown }): Parameters<OutputMarkdownRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if markdown.trim().is_empty() {
            return Self::err("markdown must not be empty", None);
        }

        Ok(CallToolResult::success(vec![Content::text(markdown)]))
    }

    #[tool(
        description = "Run a coding agent turn in an existing session and return immediately with the execution process. The session must belong to the configured workspace."
    )]
    async fn run_coding_agent_in_session(
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
            Err(error_result) => return Ok(error_result),
        };

        if session.workspace_id != self.workspace_id {
            return Self::err(
                "Session does not belong to the configured workspace_id",
                Some(format!(
                    "session workspace_id={}, configured workspace_id={}",
                    session.workspace_id, self.workspace_id
                )),
            );
        }
        if self.attached_session_id == Some(session_id) {
            return Self::err(
                "Cannot run coding agent in the attached session",
                Some(
                    "Create or re-use a different session and run the coding agent there."
                        .to_string(),
                ),
            );
        }

        let payload = FollowUpPayload {
            prompt: prompt.to_string(),
            executor_config: Self::executor_config_payload_for_session(&session),
            retry_process_id: None,
            force_when_dirty: None,
            perform_git_reset: None,
        };

        let url = self.url(&format!("/api/sessions/{session_id}/follow-up"));
        let execution_process: ExecutionProcess =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(value) => value,
                Err(error_result) => return Ok(error_result),
            };

        let execution_process_id = execution_process.id.to_string();
        let execution_process = match Self::serialize_execution_process(&execution_process) {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };

        Self::success(&RunCodingAgentInSessionResponse {
            session_id: session_id.to_string(),
            execution_process_id,
            execution_process,
        })
    }

    #[tool(
        description = "Get status for an execution process in the configured workspace. Returns final_message when available."
    )]
    async fn get_execution_status(
        &self,
        Parameters(GetExecutionStatusRequest {
            execution_process_id,
        }): Parameters<GetExecutionStatusRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let process_url = self.url(&format!("/api/execution-processes/{execution_process_id}"));
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

        if session.workspace_id != self.workspace_id {
            return Self::err(
                "Execution process does not belong to the configured workspace_id",
                Some(format!(
                    "execution process session workspace_id={}, configured workspace_id={}",
                    session.workspace_id, self.workspace_id
                )),
            );
        }

        let is_finished = execution_process.status != ExecutionProcessStatus::Running;
        let final_message = if is_finished {
            let final_message_url = self.url(&format!(
                "/api/execution-processes/{}/final-message",
                execution_process.id
            ));
            let fetched_message: Option<String> =
                match self.send_json(self.client.get(&final_message_url)).await {
                    Ok(value) => value,
                    Err(error_result) => return Ok(error_result),
                };
            fetched_message.filter(|message| !message.trim().is_empty())
        } else {
            None
        };

        let execution_process_value = match Self::serialize_execution_process(&execution_process) {
            Ok(value) => value,
            Err(error_result) => return Ok(error_result),
        };

        Self::success(&GetExecutionStatusResponse {
            execution_process_id: execution_process.id.to_string(),
            session_id: execution_process.session_id.to_string(),
            status: Self::execution_process_status_label(&execution_process.status).to_string(),
            is_finished,
            execution_process: execution_process_value,
            final_message,
        })
    }
}

impl WorkspaceServer {
    fn executor_config_payload_for_session(session: &Session) -> ExecutorConfigPayload {
        ExecutorConfigPayload {
            executor: Self::normalized_executor_name(session.executor.as_deref()),
            variant: None,
            model_id: None,
            agent_id: None,
            reasoning_id: None,
            permission_policy: None,
        }
    }

    fn normalized_executor_name(executor: Option<&str>) -> String {
        let normalized = executor
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("CODEX")
            .replace('-', "_")
            .to_ascii_uppercase();

        match normalized.as_str() {
            "CLAUDE_CODE" | "AMP" | "GEMINI" | "CODEX" | "OPENCODE" | "CURSOR_AGENT"
            | "QWEN_CODE" | "COPILOT" | "DROID" => normalized,
            _ => "CODEX".to_string(),
        }
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

    fn err<S: Into<String>>(
        message: S,
        details: Option<String>,
    ) -> Result<CallToolResult, ErrorData> {
        let mut value = serde_json::json!({"success": false, "error": message.into()});
        if let Some(details) = details {
            value["details"] = serde_json::json!(details);
        }
        Self::err_value(value)
    }

    async fn send_json<T: DeserializeOwned>(
        &self,
        request_builder: reqwest::RequestBuilder,
    ) -> Result<T, CallToolResult> {
        let response = request_builder.send().await.map_err(|error| {
            Self::err("Failed to connect to VK API", Some(error.to_string())).unwrap()
        })?;

        if !response.status().is_success() {
            let status = response.status();
            return Err(
                Self::err(format!("VK API returned error status: {status}"), None).unwrap(),
            );
        }

        let api_response = response
            .json::<ApiResponseEnvelope<T>>()
            .await
            .map_err(|error| {
                Self::err("Failed to parse VK API response", Some(error.to_string())).unwrap()
            })?;

        if !api_response.success {
            let message = api_response
                .message
                .unwrap_or_else(|| "Unknown error".to_string());
            return Err(Self::err("VK API returned error", Some(message)).unwrap());
        }

        api_response
            .data
            .ok_or_else(|| Self::err("VK API response missing data field", None).unwrap())
    }

    fn session_summary(&self, session: Session) -> SessionSummary {
        let is_attached_session = self.attached_session_id == Some(session.id);
        SessionSummary {
            id: session.id.to_string(),
            workspace_id: session.workspace_id.to_string(),
            executor: session.executor,
            created_at: session.created_at.to_rfc3339(),
            updated_at: session.updated_at.to_rfc3339(),
            is_attached_session,
        }
    }

    fn serialize_execution_process(
        execution_process: &ExecutionProcess,
    ) -> Result<serde_json::Value, CallToolResult> {
        serde_json::to_value(execution_process).map_err(|error| {
            Self::err(
                "Failed to serialize execution process response",
                Some(error.to_string()),
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
