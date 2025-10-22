use std::sync::Arc;

use async_trait::async_trait;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, ChildStdout},
    sync::Mutex,
};

use super::types::{
    CLIMessage, ControlRequestMessage, ControlRequestType, ControlResponseMessage,
    ControlResponseType, SDKControlRequestMessage,
};
use crate::executors::{
    ExecutorError,
    claude::types::{PermissionMode, SDKControlRequestType},
};

/// Handles bidirectional control protocol communication
#[derive(Clone)]
pub struct ProtocolPeer {
    stdin: Arc<Mutex<ChildStdin>>,
}

impl ProtocolPeer {
    pub fn spawn(
        stdin: ChildStdin,
        stdout: ChildStdout,
        callbacks: Arc<dyn ProtocolCallbacks>,
    ) -> Self {
        let peer = Self {
            stdin: Arc::new(Mutex::new(stdin)),
        };

        let reader_peer = peer.clone();
        tokio::spawn(async move {
            if let Err(e) = reader_peer.read_loop(stdout, callbacks).await {
                tracing::error!("Protocol reader loop error: {}", e);
            }
        });

        peer
    }

    async fn read_loop(
        &self,
        stdout: ChildStdout,
        callbacks: Arc<dyn ProtocolCallbacks>,
    ) -> Result<(), ExecutorError> {
        let mut reader = BufReader::new(stdout);
        let mut buffer = String::new();

        loop {
            buffer.clear();
            match reader.read_line(&mut buffer).await {
                Ok(0) => break, // EOF
                Ok(_) => {
                    let line = buffer.trim();
                    if line.is_empty() {
                        continue;
                    }
                    // Parse message using typed enum
                    match serde_json::from_str::<CLIMessage>(line) {
                        Ok(CLIMessage::ControlRequest {
                            request_id,
                            request,
                        }) => {
                            // Construct ControlRequestMessage for handle_control_request
                            let msg = ControlRequestMessage {
                                message_type: "control_request".to_string(),
                                request_id,
                                request,
                            };
                            self.handle_control_request(&callbacks, msg).await;
                        }
                        Ok(CLIMessage::ControlResponse { response }) => {
                            tracing::debug!("Received control response: {:?}", response);
                        }
                        Ok(CLIMessage::System {
                            subtype: Some(ref s),
                            session_id: Some(ref sid),
                        }) if s == "init" => {
                            if let Err(e) = callbacks.on_session_init(sid.clone()).await {
                                tracing::error!("Failed to register session: {}", e);
                            }
                        }
                        Ok(CLIMessage::System { .. }) | Ok(CLIMessage::Other(_)) | Err(_) => {
                            let has_finished =
                                callbacks.on_non_control(line).await.unwrap_or_else(|e| {
                                    tracing::warn!("Error handling non-control message: {}", e);
                                    false
                                });
                            if has_finished {
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Error reading stdout: {}", e);
                    break;
                }
            }
        }
        Ok(())
    }

    async fn handle_control_request(
        &self,
        callbacks: &Arc<dyn ProtocolCallbacks>,
        request: ControlRequestMessage,
    ) {
        let request_id = request.request_id.clone();

        match request.request {
            ControlRequestType::CanUseTool { tool_name, .. } => {
                tracing::warn!(
                    "on_can_use_tool callback is not implemented. Tool: {}",
                    tool_name
                );
            }
            ControlRequestType::HookCallback {
                callback_id,
                input,
                tool_use_id,
            } => {
                match callbacks
                    .on_hook_callback(self, callback_id, input, tool_use_id)
                    .await
                {
                    Ok(hook_output) => {
                        if let Err(e) = self.send_hook_response(request_id, hook_output).await {
                            tracing::error!("Failed to send hook callback result: {}", e);
                        }
                    }
                    Err(e) => {
                        tracing::error!("Error in on_hook_callback: {}", e);
                        if let Err(e2) = self.send_error(request_id, e.to_string()).await {
                            tracing::error!("Failed to send error response: {}", e2);
                        }
                    }
                }
            }
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
        tracing::debug!("Sending to CLI stdin: {}", json);
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

/// Callbacks for control protocol events
#[async_trait]
pub trait ProtocolCallbacks: Send + Sync {
    /// Called when CLI sends hook callback (for PreToolUse hooks)
    /// Returns hook output JSON (not PermissionResult)
    async fn on_hook_callback(
        &self,
        peer: &ProtocolPeer,
        callback_id: String,
        input: serde_json::Value,
        tool_use_id: Option<String>,
    ) -> Result<serde_json::Value, ExecutorError>;

    /// Called when session is initialized (from system init message)
    async fn on_session_init(&self, session_id: String) -> Result<(), ExecutorError>;

    /// Called for non-control messages (regular Claude output)
    /// Returns true if the task is complete and the read loop should exit
    async fn on_non_control(&self, line: &str) -> Result<bool, ExecutorError>;
}
