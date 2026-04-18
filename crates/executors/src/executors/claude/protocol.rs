use std::sync::Arc;

use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, ChildStdout},
    sync::{Mutex, oneshot},
};

use super::types::{
    CLIMessage, ControlRequestType, ControlResponseMessage, ControlResponseType,
    SDKControlRequestMessage,
};
use crate::executors::{
    ExecutorError, ExecutorExitResult, SessionCompletionReason,
    claude::{
        client::ClaudeAgentClient,
        types::{PermissionMode, SDKControlRequestType},
    },
};

/// Minimal struct to detect Result messages in the output stream.
/// We only need the fields required for SessionCompletionReason.
#[derive(serde::Deserialize)]
struct ResultMessage {
    #[serde(rename = "type")]
    message_type: String,
    #[serde(default)]
    subtype: Option<String>,
    #[serde(default, alias = "isError")]
    is_error: Option<bool>,
    #[serde(default)]
    duration_ms: Option<u64>,
    #[serde(default)]
    num_turns: Option<u32>,
}
use workspace_utils::approvals::Question;

/// Clone-able wrapper for exit signal sender.
/// The inner oneshot sender can only send once, so we use Option + take().
#[derive(Clone)]
pub struct ExitSignalSender {
    inner: Arc<Mutex<Option<oneshot::Sender<ExecutorExitResult>>>>,
}

impl ExitSignalSender {
    pub fn new(sender: oneshot::Sender<ExecutorExitResult>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Some(sender))),
        }
    }

    pub async fn send_exit_signal(&self, result: ExecutorExitResult) {
        if let Some(sender) = self.inner.lock().await.take() {
            let _ = sender.send(result);
        }
    }
}

/// Handles bidirectional control protocol communication.
/// Allows sending messages to a running Claude Code process via stdin.
#[derive(Clone, Debug)]
pub struct ProtocolPeer {
    stdin: Arc<Mutex<ChildStdin>>,
    wait_for_natural_exit: bool,
}

impl ProtocolPeer {
    pub fn spawn(
        stdin: ChildStdin,
        stdout: ChildStdout,
        client: Arc<ClaudeAgentClient>,
        exit_signal: ExitSignalSender,
        wait_for_natural_exit: bool,
    ) -> Self {
        let peer = Self {
            stdin: Arc::new(Mutex::new(stdin)),
            wait_for_natural_exit,
        };

        let reader_peer = peer.clone();
        tokio::spawn(async move {
            let completion_reason = match reader_peer
                .read_loop(stdout, client, reader_peer.wait_for_natural_exit)
                .await
            {
                Ok(reason) => reason,
                Err(e) => {
                    tracing::error!("Protocol reader loop error: {}", e);
                    SessionCompletionReason::Error {
                        message: e.to_string(),
                    }
                }
            };
            // Send exit signal with the detected completion reason
            // This triggers the exit monitor to kill the process group
            let exit_result = ExecutorExitResult::success(completion_reason);
            exit_signal.send_exit_signal(exit_result).await;
        });

        peer
    }

    async fn read_loop(
        &self,
        stdout: ChildStdout,
        client: Arc<ClaudeAgentClient>,
        wait_for_natural_exit: bool,
    ) -> Result<SessionCompletionReason, ExecutorError> {
        let mut reader = BufReader::new(stdout);
        let mut buffer = String::new();
        let mut completion_reason: Option<SessionCompletionReason> = None;

        loop {
            buffer.clear();
            match reader.read_line(&mut buffer).await {
                Ok(0) => break, // EOF
                Ok(_) => {
                    let line = buffer.trim();
                    if line.is_empty() {
                        continue;
                    }

                    // Check for Result message (session completion marker)
                    // This is a top-level {"type":"result",...} message, NOT a tool_result
                    if completion_reason.is_none()
                        && let Ok(msg) = serde_json::from_str::<ResultMessage>(line)
                        && msg.message_type == "result"
                    {
                        tracing::info!(
                            subtype = ?msg.subtype,
                            is_error = ?msg.is_error,
                            duration_ms = ?msg.duration_ms,
                            num_turns = ?msg.num_turns,
                            "Claude Code session completed via Result message"
                        );
                        completion_reason = Some(SessionCompletionReason::ResultMessage {
                            is_error: msg.is_error.unwrap_or(false),
                            subtype: msg.subtype,
                            duration_ms: msg.duration_ms,
                            num_turns: msg.num_turns,
                        });
                        if !wait_for_natural_exit {
                            // Default: break immediately to trigger exit signal.
                            // The Result message indicates session completion - Claude Code
                            // will wait for user input indefinitely after this point.
                            break;
                        }
                        // wait_for_natural_exit=true: keep draining stdout until the
                        // process exits naturally (EOF), matching reference behavior.
                    }

                    // Parse message using typed enum for control protocol
                    match serde_json::from_str::<CLIMessage>(line) {
                        Ok(CLIMessage::ControlRequest {
                            request_id,
                            request,
                        }) => {
                            self.handle_control_request(&client, request_id, request)
                                .await;
                        }
                        Ok(CLIMessage::ControlResponse { .. }) => {}
                        _ => {
                            client.on_non_control(line).await?;
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Error reading stdout: {}", e);
                    return Err(ExecutorError::Io(e));
                }
            }
        }

        // Return the completion reason, defaulting to EofWithoutResult if no Result message was seen
        match completion_reason {
            Some(reason) => Ok(reason),
            None => {
                tracing::warn!("Claude Code session ended with EOF (no Result message)");
                Ok(SessionCompletionReason::EofWithoutResult)
            }
        }
    }

    async fn handle_control_request(
        &self,
        client: &Arc<ClaudeAgentClient>,
        request_id: String,
        request: ControlRequestType,
    ) {
        match request {
            ControlRequestType::CanUseTool {
                tool_name,
                input,
                permission_suggestions,
                tool_use_id,
            } => {
                // Special case: AskUserQuestion arriving via CanUseTool needs PermissionResult format
                // Claude SDK expects { "behavior": "allow", "updatedInput": { "questions": [...], "answers": {...} } }
                // See: https://platform.claude.com/docs/en/agent-sdk/permissions
                if tool_name == "AskUserQuestion" {
                    // Extract questions from input and use the existing AskUserQuestion handler
                    let questions_result: Result<Vec<Question>, _> = input
                        .get("questions")
                        .map(|q| serde_json::from_value(q.clone()))
                        .unwrap_or(Ok(vec![]));

                    match questions_result {
                        Ok(questions) if !questions.is_empty() => {
                            // Get user answers via the question handler
                            match client.on_ask_user_question(questions, tool_use_id).await {
                                Ok(result) => {
                                    // Wrap response in PermissionResult format for CanUseTool
                                    let permission_response =
                                        if let Some(answers) = result.get("answers") {
                                            // Build updatedInput with original questions + user answers
                                            let mut updated_input = input.clone();
                                            updated_input["answers"] = answers.clone();
                                            serde_json::json!({
                                                "behavior": "allow",
                                                "updatedInput": updated_input
                                            })
                                        } else {
                                            // Error case - deny with message
                                            let error_msg = result
                                                .get("error")
                                                .and_then(|e| e.as_str())
                                                .unwrap_or("Unknown error");
                                            serde_json::json!({
                                                "behavior": "deny",
                                                "message": error_msg
                                            })
                                        };
                                    if let Err(e) = self
                                        .send_hook_response(request_id, permission_response)
                                        .await
                                    {
                                        tracing::warn!(
                                            "Failed to send question answer (process likely exited): {e}"
                                        );
                                    }
                                }
                                Err(e) => {
                                    tracing::error!("Error in on_ask_user_question: {e}");
                                    if let Err(e2) =
                                        self.send_error(request_id, e.to_string()).await
                                    {
                                        tracing::error!("Failed to send error response: {e2}");
                                    }
                                }
                            }
                            return;
                        }
                        _ => {
                            tracing::warn!(
                                "AskUserQuestion via CanUseTool missing or invalid questions"
                            );
                            // Fall through to normal CanUseTool handling which will deny
                        }
                    }
                }

                // Normal CanUseTool handling (non-AskUserQuestion or fallback)
                match client
                    .on_can_use_tool(tool_name, input, permission_suggestions, tool_use_id)
                    .await
                {
                    Ok(result) => {
                        if let Err(e) = self
                            .send_hook_response(request_id, serde_json::to_value(result).unwrap())
                            .await
                        {
                            tracing::error!("Failed to send permission result: {e}");
                        }
                    }
                    Err(e) => {
                        tracing::error!("Error in on_can_use_tool: {e}");
                        if let Err(e2) = self.send_error(request_id, e.to_string()).await {
                            tracing::error!("Failed to send error response: {e2}");
                        }
                    }
                }
            }
            ControlRequestType::HookCallback {
                callback_id,
                input,
                tool_use_id,
            } => {
                match client
                    .on_hook_callback(callback_id, input, tool_use_id)
                    .await
                {
                    Ok(hook_output) => {
                        if let Err(e) = self.send_hook_response(request_id, hook_output).await {
                            tracing::error!("Failed to send hook callback result: {e}");
                        }
                    }
                    Err(e) => {
                        tracing::error!("Error in on_hook_callback: {e}");
                        if let Err(e2) = self.send_error(request_id, e.to_string()).await {
                            tracing::error!("Failed to send error response: {e2}");
                        }
                    }
                }
            }
            ControlRequestType::AskUserQuestion {
                questions,
                tool_use_id,
            } => match client.on_ask_user_question(questions, tool_use_id).await {
                Ok(result) => {
                    if let Err(e) = self.send_hook_response(request_id, result).await {
                        tracing::error!("Failed to send question answer: {e}");
                    }
                }
                Err(e) => {
                    tracing::error!("Error in on_ask_user_question: {e}");
                    if let Err(e2) = self.send_error(request_id, e.to_string()).await {
                        tracing::error!("Failed to send error response: {e2}");
                    }
                }
            },
        }
    }

    pub async fn send_hook_response(
        &self,
        request_id: String,
        hook_output: serde_json::Value,
    ) -> Result<(), ExecutorError> {
        self.send_json(&ControlResponseMessage::new(ControlResponseType::Success {
            request_id,
            response: Some(hook_output),
        }))
        .await
    }

    /// Send error response to CLI
    async fn send_error(&self, request_id: String, error: String) -> Result<(), ExecutorError> {
        self.send_json(&ControlResponseMessage::new(ControlResponseType::Error {
            request_id,
            error: Some(error),
        }))
        .await
    }

    /// Send JSON message to stdin
    async fn send_json<T: serde::Serialize>(&self, message: &T) -> Result<(), ExecutorError> {
        let json = serde_json::to_string(message)?;
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(json.as_bytes()).await?;
        stdin.write_all(b"\n").await?;
        stdin.flush().await?;
        Ok(())
    }

    pub async fn send_user_message(&self, content: String) -> Result<(), ExecutorError> {
        let message = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": content
            }
        });
        self.send_json(&message).await
    }

    pub async fn initialize(&self, hooks: Option<serde_json::Value>) -> Result<(), ExecutorError> {
        self.send_json(&SDKControlRequestMessage::new(
            SDKControlRequestType::Initialize { hooks },
        ))
        .await
    }

    pub async fn set_permission_mode(&self, mode: PermissionMode) -> Result<(), ExecutorError> {
        self.send_json(&SDKControlRequestMessage::new(
            SDKControlRequestType::SetPermissionMode { mode },
        ))
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_exit_signal_sender_sends_once() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let sender = ExitSignalSender::new(tx);

        sender
            .send_exit_signal(ExecutorExitResult::success_default())
            .await;

        let result = rx.await;
        assert!(matches!(result, Ok(ExecutorExitResult::Success { .. })));
    }

    #[tokio::test]
    async fn test_exit_signal_sender_only_sends_first() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let sender = ExitSignalSender::new(tx);

        sender
            .send_exit_signal(ExecutorExitResult::success_default())
            .await;
        sender
            .send_exit_signal(ExecutorExitResult::failure_default())
            .await; // Should be no-op

        let result = rx.await;
        assert!(matches!(result, Ok(ExecutorExitResult::Success { .. })));
    }
}
