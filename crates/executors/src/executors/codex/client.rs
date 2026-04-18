use std::{
    borrow::Cow,
    collections::VecDeque,
    io,
    sync::{Arc, OnceLock},
};

use async_trait::async_trait;
use codex_app_server_protocol::{
    ClientInfo, ClientNotification, ClientRequest, CollaborationModeListParams,
    CollaborationModeListResponse, CommandExecutionApprovalDecision,
    CommandExecutionRequestApprovalResponse, FileChangeApprovalDecision,
    FileChangeRequestApprovalResponse, GetAuthStatusParams, GetAuthStatusResponse,
    InitializeParams, InitializeResponse, JSONRPCError, JSONRPCNotification, JSONRPCRequest,
    JSONRPCResponse, ModelListParams, ModelListResponse, RequestId, ServerNotification,
    ServerRequest, ThreadForkParams, ThreadForkResponse, ThreadStartParams, ThreadStartResponse,
    ToolRequestUserInputAnswer, ToolRequestUserInputQuestion, ToolRequestUserInputResponse,
    TurnInterruptParams, TurnInterruptResponse, TurnStartParams, TurnStartResponse, UserInput,
};
use codex_protocol::{ThreadId, config_types::CollaborationMode, protocol::ReviewDecision};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{self, Value};
use tokio::{
    io::{AsyncWrite, AsyncWriteExt, BufWriter},
    sync::Mutex,
};
use workspace_utils::approvals::{ApprovalStatus, Question, QuestionOption};

use super::jsonrpc::{JsonRpcCallbacks, JsonRpcPeer};
use crate::{
    approvals::{ExecutorApprovalError, ExecutorApprovalService},
    executors::{ExecutorError, codex::normalize_logs::Approval},
};

pub struct AppServerClient {
    rpc: OnceLock<JsonRpcPeer>,
    log_writer: LogWriter,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    conversation_id: Mutex<Option<ThreadId>>,
    current_turn_id: Mutex<Option<String>>,
    pending_feedback: Mutex<VecDeque<String>>,
    auto_approve: bool,
}

impl AppServerClient {
    pub fn new(
        log_writer: LogWriter,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
        auto_approve: bool,
    ) -> Arc<Self> {
        Arc::new(Self {
            rpc: OnceLock::new(),
            log_writer,
            approvals,
            auto_approve,
            conversation_id: Mutex::new(None),
            current_turn_id: Mutex::new(None),
            pending_feedback: Mutex::new(VecDeque::new()),
        })
    }

    pub fn connect(&self, peer: JsonRpcPeer) {
        let _ = self.rpc.set(peer);
    }

    fn rpc(&self) -> &JsonRpcPeer {
        self.rpc.get().expect("Codex RPC peer not attached")
    }

    pub fn log_writer(&self) -> &LogWriter {
        &self.log_writer
    }

    pub async fn initialize(&self) -> Result<(), ExecutorError> {
        let request = ClientRequest::Initialize {
            request_id: self.next_request_id(),
            params: InitializeParams {
                client_info: ClientInfo {
                    name: "vibe-codex-executor".to_string(),
                    title: None,
                    version: env!("CARGO_PKG_VERSION").to_string(),
                },
                capabilities: None,
            },
        };

        self.send_request::<InitializeResponse>(request, "initialize")
            .await?;
        self.send_message(&ClientNotification::Initialized).await
    }

    pub async fn start_thread(
        &self,
        params: ThreadStartParams,
    ) -> Result<ThreadStartResponse, ExecutorError> {
        let request = ClientRequest::ThreadStart {
            request_id: self.next_request_id(),
            params,
        };
        self.send_request(request, "thread/start").await
    }

    pub async fn fork_thread(
        &self,
        thread_id: ThreadId,
        params: ThreadStartParams,
    ) -> Result<ThreadForkResponse, ExecutorError> {
        let request = ClientRequest::ThreadFork {
            request_id: self.next_request_id(),
            params: ThreadForkParams {
                thread_id: thread_id.to_string(),
                path: None,
                model: params.model,
                model_provider: params.model_provider,
                cwd: params.cwd,
                approval_policy: params.approval_policy,
                sandbox: params.sandbox,
                config: params.config,
                base_instructions: params.base_instructions,
                developer_instructions: params.developer_instructions,
            },
        };
        self.send_request(request, "thread/fork").await
    }

    pub async fn start_turn(
        &self,
        thread_id: ThreadId,
        message: String,
        collaboration_mode: Option<CollaborationMode>,
    ) -> Result<TurnStartResponse, ExecutorError> {
        let request = ClientRequest::TurnStart {
            request_id: self.next_request_id(),
            params: TurnStartParams {
                thread_id: thread_id.to_string(),
                input: vec![UserInput::Text {
                    text: message,
                    text_elements: vec![],
                }],
                cwd: None,
                approval_policy: None,
                sandbox_policy: None,
                model: None,
                effort: None,
                summary: None,
                personality: None,
                output_schema: None,
                collaboration_mode,
            },
        };
        let response: TurnStartResponse = self.send_request(request, "turn/start").await?;
        self.set_current_turn_id(Some(response.turn.id.clone()))
            .await;
        Ok(response)
    }

    pub async fn send_user_message(&self, message: String) -> Result<(), ExecutorError> {
        let thread_id = (*self.conversation_id.lock().await).ok_or_else(|| {
            ExecutorError::Io(io::Error::other(
                "Codex conversation/thread id unavailable for user message injection",
            ))
        })?;
        self.start_turn(thread_id, message, None).await.map(|_| ())
    }

    pub async fn interrupt_current_turn(&self) -> Result<bool, ExecutorError> {
        let thread_id = (*self.conversation_id.lock().await).ok_or_else(|| {
            ExecutorError::Io(io::Error::other(
                "Codex conversation/thread id unavailable for interrupt",
            ))
        })?;
        let turn_id = self.current_turn_id.lock().await.clone().ok_or_else(|| {
            ExecutorError::Io(io::Error::other("Codex turn id unavailable for interrupt"))
        })?;

        let request = ClientRequest::TurnInterrupt {
            request_id: self.next_request_id(),
            params: TurnInterruptParams {
                thread_id: thread_id.to_string(),
                turn_id,
            },
        };
        self.send_request::<TurnInterruptResponse>(request, "turn/interrupt")
            .await?;
        Ok(true)
    }

    pub async fn get_auth_status(&self) -> Result<GetAuthStatusResponse, ExecutorError> {
        let request = ClientRequest::GetAuthStatus {
            request_id: self.next_request_id(),
            params: GetAuthStatusParams {
                include_token: Some(true),
                refresh_token: Some(false),
            },
        };
        self.send_request(request, "getAuthStatus").await
    }

    pub async fn list_models(&self) -> Result<ModelListResponse, ExecutorError> {
        let request = ClientRequest::ModelList {
            request_id: self.next_request_id(),
            params: ModelListParams {
                cursor: None,
                limit: Some(100),
            },
        };
        self.send_request(request, "model/list").await
    }

    pub async fn list_collaboration_modes(
        &self,
    ) -> Result<CollaborationModeListResponse, ExecutorError> {
        let request = ClientRequest::CollaborationModeList {
            request_id: self.next_request_id(),
            params: CollaborationModeListParams {},
        };
        self.send_request(request, "collaborationMode/list").await
    }
    async fn handle_server_request(
        &self,
        peer: &JsonRpcPeer,
        request: ServerRequest,
    ) -> Result<(), ExecutorError> {
        match request {
            ServerRequest::CommandExecutionRequestApproval { request_id, params } => {
                let input = serde_json::to_value(&params)
                    .map_err(|err| ExecutorError::Io(io::Error::other(err.to_string())))?;
                let status = match self
                    .request_tool_approval("bash", input, &params.item_id)
                    .await
                {
                    Ok(status) => status,
                    Err(err) => {
                        tracing::error!("failed to request command approval: {err}");
                        ApprovalStatus::Denied {
                            reason: Some("approval service error".to_string()),
                        }
                    }
                };
                self.log_writer
                    .log_raw(
                        &Approval::approval_response(
                            params.item_id.clone(),
                            "codex.exec_command".to_string(),
                            status.clone(),
                        )
                        .raw(),
                    )
                    .await?;

                let (decision, feedback) = self.review_decision(&status).await?;
                let response = CommandExecutionRequestApprovalResponse {
                    decision: map_command_decision(decision),
                };
                send_server_response(peer, request_id, response).await?;
                if let Some(message) = feedback {
                    tracing::debug!("queueing exec denial feedback: {message}");
                    self.enqueue_feedback(message).await;
                }
                Ok(())
            }
            ServerRequest::FileChangeRequestApproval { request_id, params } => {
                let input = serde_json::to_value(&params)
                    .map_err(|err| ExecutorError::Io(io::Error::other(err.to_string())))?;
                let status = match self
                    .request_tool_approval("edit", input, &params.item_id)
                    .await
                {
                    Ok(status) => status,
                    Err(err) => {
                        tracing::error!("failed to request file change approval: {err}");
                        ApprovalStatus::Denied {
                            reason: Some("approval service error".to_string()),
                        }
                    }
                };
                self.log_writer
                    .log_raw(
                        &Approval::approval_response(
                            params.item_id.clone(),
                            "codex.apply_patch".to_string(),
                            status.clone(),
                        )
                        .raw(),
                    )
                    .await?;
                let (decision, feedback) = self.review_decision(&status).await?;
                let response = FileChangeRequestApprovalResponse {
                    decision: map_file_change_decision(decision),
                };
                send_server_response(peer, request_id, response).await?;
                if let Some(message) = feedback {
                    tracing::debug!("queueing file change denial feedback: {message}");
                    self.enqueue_feedback(message).await;
                }
                Ok(())
            }
            ServerRequest::ToolRequestUserInput { request_id, params } => {
                let questions = questions_from_user_input_request(&params.questions);
                let status = match self
                    .request_question_approval(&questions, &params.item_id)
                    .await
                {
                    Ok(status) => status,
                    Err(err) => {
                        tracing::error!("failed to request user input: {err}");
                        (ApprovalStatus::TimedOut, None)
                    }
                };
                self.log_writer
                    .log_raw(
                        &Approval::approval_response(
                            params.item_id.clone(),
                            "AskUserQuestion".to_string(),
                            status.0.clone(),
                        )
                        .raw(),
                    )
                    .await?;

                let (_decision, feedback) = self.review_decision(&status.0).await?;
                let response = ToolRequestUserInputResponse {
                    answers: user_input_answers_from_response(&params.questions, status.1),
                };
                send_server_response(peer, request_id, response).await?;
                if let Some(message) = feedback {
                    tracing::debug!("queueing user-input denial feedback: {message}");
                    self.enqueue_feedback(message).await;
                }
                Ok(())
            }
            ServerRequest::DynamicToolCall { request_id, params } => {
                tracing::warn!(
                    tool = %params.tool,
                    call_id = %params.call_id,
                    "dynamic tool call requested but not implemented"
                );
                send_server_response(
                    peer,
                    request_id,
                    codex_app_server_protocol::DynamicToolCallResponse {
                        output: format!(
                            "Dynamic tool `{}` is not yet supported by Vibe Kanban.",
                            params.tool
                        ),
                        success: false,
                    },
                )
                .await
            }
            ServerRequest::ChatgptAuthTokensRefresh { .. }
            | ServerRequest::ApplyPatchApproval { .. }
            | ServerRequest::ExecCommandApproval { .. } => {
                tracing::error!("received unsupported server request: {:?}", request);
                Err(
                    ExecutorApprovalError::RequestFailed("unsupported server request".to_string())
                        .into(),
                )
            }
        }
    }

    async fn request_tool_approval(
        &self,
        tool_name: &str,
        tool_input: Value,
        tool_call_id: &str,
    ) -> Result<ApprovalStatus, ExecutorError> {
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        if self.auto_approve {
            return Ok(ApprovalStatus::Approved);
        }
        Ok(self
            .approvals
            .as_ref()
            .ok_or(ExecutorApprovalError::ServiceUnavailable)?
            .request_tool_approval(tool_name, tool_input, tool_call_id)
            .await?)
    }

    async fn request_question_approval(
        &self,
        questions: &[Question],
        tool_call_id: &str,
    ) -> Result<
        (
            ApprovalStatus,
            Option<std::collections::HashMap<String, String>>,
        ),
        ExecutorError,
    > {
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        let Some(approvals) = self.approvals.as_ref() else {
            tracing::warn!("Codex requested user input but no approval service is available");
            return Ok((ApprovalStatus::TimedOut, None));
        };

        Ok(approvals
            .request_question_approval(questions, tool_call_id)
            .await?)
    }

    pub async fn register_session(&self, conversation_id: &ThreadId) -> Result<(), ExecutorError> {
        {
            let mut guard = self.conversation_id.lock().await;
            guard.replace(*conversation_id);
        }
        self.flush_pending_feedback().await;
        Ok(())
    }

    async fn send_message<M>(&self, message: &M) -> Result<(), ExecutorError>
    where
        M: Serialize + Sync,
    {
        self.rpc().send(message).await
    }

    async fn send_request<R>(&self, request: ClientRequest, label: &str) -> Result<R, ExecutorError>
    where
        R: DeserializeOwned + std::fmt::Debug,
    {
        let request_id = request_id(&request);
        self.rpc().request(request_id, &request, label).await
    }

    fn next_request_id(&self) -> RequestId {
        self.rpc().next_request_id()
    }

    async fn review_decision(
        &self,
        status: &ApprovalStatus,
    ) -> Result<(ReviewDecision, Option<String>), ExecutorError> {
        if self.auto_approve {
            return Ok((ReviewDecision::ApprovedForSession, None));
        }

        let outcome = match status {
            ApprovalStatus::Approved => (ReviewDecision::Approved, None),
            ApprovalStatus::Denied { reason } => {
                let feedback = reason
                    .as_ref()
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string());
                if feedback.is_some() {
                    (ReviewDecision::Abort, feedback)
                } else {
                    (ReviewDecision::Denied, None)
                }
            }
            ApprovalStatus::TimedOut => (ReviewDecision::Denied, None),
            ApprovalStatus::Pending => (ReviewDecision::Denied, None),
        };
        Ok(outcome)
    }

    async fn enqueue_feedback(&self, message: String) {
        if message.trim().is_empty() {
            return;
        }
        let mut guard = self.pending_feedback.lock().await;
        guard.push_back(message);
    }

    async fn flush_pending_feedback(&self) {
        let messages: Vec<String> = {
            let mut guard = self.pending_feedback.lock().await;
            guard.drain(..).collect()
        };

        if messages.is_empty() {
            return;
        }

        let Some(conversation_id) = *self.conversation_id.lock().await else {
            tracing::warn!(
                "pending Codex feedback but conversation id unavailable; dropping {} messages",
                messages.len()
            );
            return;
        };

        for message in messages {
            let trimmed = message.trim();
            if trimmed.is_empty() {
                continue;
            }
            self.spawn_feedback_message(conversation_id, trimmed.to_string());
        }
    }

    fn spawn_feedback_message(&self, conversation_id: ThreadId, feedback: String) {
        let peer = self.rpc().clone();
        let request = ClientRequest::TurnStart {
            request_id: peer.next_request_id(),
            params: TurnStartParams {
                thread_id: conversation_id.to_string(),
                input: vec![UserInput::Text {
                    text: format!("User feedback: {feedback}"),
                    text_elements: vec![],
                }],
                cwd: None,
                approval_policy: None,
                sandbox_policy: None,
                model: None,
                effort: None,
                summary: None,
                personality: None,
                output_schema: None,
                collaboration_mode: None,
            },
        };
        tokio::spawn(async move {
            if let Err(err) = peer
                .request::<TurnStartResponse, _>(request_id(&request), &request, "turn/start")
                .await
            {
                tracing::error!("failed to send feedback follow-up message: {err}");
            }
        });
    }

    async fn set_current_turn_id(&self, turn_id: Option<String>) {
        let mut guard = self.current_turn_id.lock().await;
        *guard = turn_id;
    }
}

#[async_trait]
impl JsonRpcCallbacks for AppServerClient {
    async fn on_request(
        &self,
        peer: &JsonRpcPeer,
        raw: &str,
        request: JSONRPCRequest,
    ) -> Result<(), ExecutorError> {
        self.log_writer.log_raw(raw).await?;
        match ServerRequest::try_from(request.clone()) {
            Ok(server_request) => self.handle_server_request(peer, server_request).await,
            Err(err) => {
                tracing::debug!("Unhandled server request `{}`: {err}", request.method);
                let response = JSONRPCResponse {
                    id: request.id,
                    result: Value::Null,
                };
                peer.send(&response).await
            }
        }
    }

    async fn on_response(
        &self,
        _peer: &JsonRpcPeer,
        raw: &str,
        _response: &JSONRPCResponse,
    ) -> Result<(), ExecutorError> {
        self.log_writer.log_raw(raw).await
    }

    async fn on_error(
        &self,
        _peer: &JsonRpcPeer,
        raw: &str,
        _error: &JSONRPCError,
    ) -> Result<(), ExecutorError> {
        self.log_writer.log_raw(raw).await
    }

    async fn on_notification(
        &self,
        _peer: &JsonRpcPeer,
        raw: &str,
        notification: JSONRPCNotification,
    ) -> Result<bool, ExecutorError> {
        let raw =
            if let Ok(mut server_notification) = serde_json::from_str::<ServerNotification>(raw) {
                if let ServerNotification::SessionConfigured(session_configured) =
                    &mut server_notification
                {
                    // history can be large, which might get truncated during transmission, corrupting the JSON line and losing valuable session and model information.
                    session_configured.initial_messages = None;
                    Cow::Owned(serde_json::to_string(&server_notification)?)
                } else {
                    Cow::Borrowed(raw)
                }
            } else {
                Cow::Borrowed(raw)
            };
        self.log_writer.log_raw(&raw).await?;

        let method = notification.method.as_str();
        if method == "turn/completed" {
            self.set_current_turn_id(None).await;
            tracing::debug!(
                event = "ExecutorFinished",
                method = method,
                "codex: received finish signal"
            );
            return Ok(true);
        }

        if method == "turn/started" || method == "turn/completed" {
            self.flush_pending_feedback().await;
        } else if method == "thread/started"
            || method.starts_with("item/")
            || method.starts_with("turn/")
        {
            tracing::trace!(
                event = "CodexEvent",
                method = method,
                "codex: received protocol event"
            );
            return Ok(false);
        } else if method == "thread/compacted" {
            tracing::debug!("codex turn aborted; flushing feedback queue");
            self.flush_pending_feedback().await;
            return Ok(false);
        }

        Ok(false)
    }

    async fn on_non_json(&self, raw: &str) -> Result<(), ExecutorError> {
        self.log_writer.log_raw(raw).await?;
        Ok(())
    }
}

async fn send_server_response<T>(
    peer: &JsonRpcPeer,
    request_id: RequestId,
    response: T,
) -> Result<(), ExecutorError>
where
    T: Serialize,
{
    let payload = JSONRPCResponse {
        id: request_id,
        result: serde_json::to_value(response)
            .map_err(|err| ExecutorError::Io(io::Error::other(err.to_string())))?,
    };

    peer.send(&payload).await
}

fn request_id(request: &ClientRequest) -> RequestId {
    match request {
        ClientRequest::Initialize { request_id, .. }
        | ClientRequest::ThreadStart { request_id, .. }
        | ClientRequest::ThreadFork { request_id, .. }
        | ClientRequest::TurnStart { request_id, .. }
        | ClientRequest::TurnInterrupt { request_id, .. }
        | ClientRequest::ModelList { request_id, .. }
        | ClientRequest::CollaborationModeList { request_id, .. }
        | ClientRequest::GetAuthStatus { request_id, .. } => request_id.clone(),
        _ => unreachable!("request_id called for unsupported request variant"),
    }
}

fn map_command_decision(decision: ReviewDecision) -> CommandExecutionApprovalDecision {
    match decision {
        ReviewDecision::Approved => CommandExecutionApprovalDecision::Accept,
        ReviewDecision::ApprovedExecpolicyAmendment {
            proposed_execpolicy_amendment,
        } => CommandExecutionApprovalDecision::AcceptWithExecpolicyAmendment {
            execpolicy_amendment: proposed_execpolicy_amendment.into(),
        },
        ReviewDecision::ApprovedForSession => CommandExecutionApprovalDecision::AcceptForSession,
        ReviewDecision::Denied => CommandExecutionApprovalDecision::Decline,
        ReviewDecision::Abort => CommandExecutionApprovalDecision::Cancel,
    }
}

fn questions_from_user_input_request(questions: &[ToolRequestUserInputQuestion]) -> Vec<Question> {
    questions
        .iter()
        .map(|question| Question {
            question: question.question.clone(),
            header: question.header.clone(),
            multi_select: false,
            options: question
                .options
                .clone()
                .unwrap_or_default()
                .into_iter()
                .map(|option| QuestionOption {
                    label: option.label,
                    description: option.description,
                })
                .collect(),
        })
        .collect()
}

fn user_input_answers_from_response(
    questions: &[ToolRequestUserInputQuestion],
    answers: Option<std::collections::HashMap<String, String>>,
) -> std::collections::HashMap<String, ToolRequestUserInputAnswer> {
    let mut mapped = std::collections::HashMap::new();
    let Some(answers) = answers else {
        return mapped;
    };

    for question in questions {
        let answer = answers
            .get(&question.question)
            .or_else(|| answers.get(&question.header))
            .map(|value| value.trim())
            .filter(|value| !value.is_empty());

        if let Some(answer) = answer {
            mapped.insert(
                question.id.clone(),
                ToolRequestUserInputAnswer {
                    answers: vec![answer.to_string()],
                },
            );
        }
    }

    mapped
}

fn map_file_change_decision(decision: ReviewDecision) -> FileChangeApprovalDecision {
    match decision {
        ReviewDecision::Approved => FileChangeApprovalDecision::Accept,
        ReviewDecision::ApprovedExecpolicyAmendment { .. } => {
            FileChangeApprovalDecision::AcceptForSession
        }
        ReviewDecision::ApprovedForSession => FileChangeApprovalDecision::AcceptForSession,
        ReviewDecision::Denied => FileChangeApprovalDecision::Decline,
        ReviewDecision::Abort => FileChangeApprovalDecision::Cancel,
    }
}

#[derive(Clone)]
pub struct LogWriter {
    writer: Arc<Mutex<BufWriter<Box<dyn AsyncWrite + Send + Unpin>>>>,
}

impl LogWriter {
    pub fn new(writer: impl AsyncWrite + Send + Unpin + 'static) -> Self {
        Self {
            writer: Arc::new(Mutex::new(BufWriter::new(Box::new(writer)))),
        }
    }

    pub async fn log_raw(&self, raw: &str) -> Result<(), ExecutorError> {
        let mut guard = self.writer.lock().await;
        guard
            .write_all(raw.as_bytes())
            .await
            .map_err(ExecutorError::Io)?;
        guard.write_all(b"\n").await.map_err(ExecutorError::Io)?;
        guard.flush().await.map_err(ExecutorError::Io)?;
        Ok(())
    }
}
