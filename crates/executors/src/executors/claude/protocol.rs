//! Protocol handler for Claude Code control protocol
//!
//! Handles bidirectional communication via stdin/stdout with the CLI process.
//!
//! Reference: https://github.com/ZhangHanDong/claude-code-api-rs/blob/main/claude-code-sdk-rs/src/transport/subprocess.rs

use std::sync::Arc;

use async_trait::async_trait;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, ChildStdout},
    sync::Mutex,
};

use super::types::{
    ControlRequestMessage, ControlRequestType, ControlResponseMessage, ControlResponseType,
    PermissionResult, SDKControlRequestMessage,
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
    /// Spawn a new protocol peer that reads from stdout and handles control requests
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

    /// Main read loop for stdout
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
                    // Try parsing as control request
                    if let Ok(control_req) = serde_json::from_str::<ControlRequestMessage>(line) {
                        if control_req.message_type == "control_request" {
                            self.handle_control_request(&callbacks, control_req).await;
                        }
                    } else if let Ok(control_resp) =
                        serde_json::from_str::<ControlResponseMessage>(line)
                    {
                        // Control response - might be init response or other
                        tracing::debug!("Received control response: {:?}", control_resp.response);
                    } else {
                        // Check if it's a system init message (contains session_id)
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
                            if value.get("type").and_then(|t| t.as_str()) == Some("system")
                                && value.get("subtype").and_then(|s| s.as_str()) == Some("init")
                            {
                                if let Some(session_id) =
                                    value.get("session_id").and_then(|s| s.as_str())
                                {
                                    if let Err(e) =
                                        callbacks.on_session_init(session_id.to_string()).await
                                    {
                                        tracing::error!("Failed to register session: {}", e);
                                    }
                                }
                            }
                        }

                        // Forward all non-control messages to stdout
                        if let Err(e) = callbacks.on_non_control(line).await {
                            tracing::warn!("Error handling non-control message: {}", e);
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

    /// Handle incoming control request from CLI
    async fn handle_control_request(
        &self,
        callbacks: &Arc<dyn ProtocolCallbacks>,
        request: ControlRequestMessage,
    ) {
        let request_id = request.request_id.clone();

        match request.request {
            ControlRequestType::CanUseTool {
                tool_name,
                input,
                permission_suggestions,
            } => {
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
                        // Send hook output directly (not wrapped in PermissionResult)
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

    /// Send permission result back to CLI (for can_use_tool)
    pub async fn send_permission_result(
        &self,
        request_id: String,
        result: PermissionResult,
    ) -> Result<(), ExecutorError> {
        let response = ControlResponseType::Success {
            request_id,
            response: serde_json::to_value(result)?,
        };

        let message = ControlResponseMessage {
            message_type: "control_response".to_string(),
            response,
        };

        self.send_json(&message).await
    }

    /// Send hook callback response to CLI
    pub async fn send_hook_response(
        &self,
        request_id: String,
        hook_output: serde_json::Value,
    ) -> Result<(), ExecutorError> {
        let response = ControlResponseType::Success {
            request_id,
            response: hook_output,
        };

        let message = ControlResponseMessage {
            message_type: "control_response".to_string(),
            response,
        };

        self.send_json(&message).await
    }

    /// Send error response to CLI
    async fn send_error(&self, request_id: String, error: String) -> Result<(), ExecutorError> {
        let response = ControlResponseType::Error {
            request_id,
            error: error,
        };

        let message = ControlResponseMessage {
            message_type: "control_response".to_string(),
            response,
        };

        self.send_json(&message).await
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

    /// Initialize control protocol with the CLI
    /// Registers a hook callback for PreToolUse events to enable approval flow
    pub async fn initialize(&self) -> Result<(), ExecutorError> {
        use uuid::Uuid;
        let init_request = SDKControlRequestMessage {
            message_type: "control_request".to_string(),
            request_id: format!("init_{}", Uuid::new_v4()),
            request: SDKControlRequestType::Initialize {
                hooks: Some(serde_json::json!({
                    "PreToolUse": [
                        {
                            "matcher": ".*",
                            "hookCallbackIds": ["tool_approval"]
                        }
                    ]
                })),
            },
        };
        self.send_json(&init_request).await?;
        Ok(())
    }

    /// Send user message (initial prompt)
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

    /// Send a control request to change permission mode
    pub async fn set_permission_mode(&self, mode: PermissionMode) -> Result<(), ExecutorError> {
        use uuid::Uuid;
        let mode_request = SDKControlRequestMessage {
            message_type: "control_request".to_string(),
            request_id: format!("set_mode_{}", Uuid::new_v4()),
            request: SDKControlRequestType::SetPermissionMode { mode },
        };
        self.send_json(&mode_request).await
    }
}

/// Callbacks for control protocol events
#[async_trait]
pub trait ProtocolCallbacks: Send + Sync {
    /// Called when CLI requests tool permission
    // async fn on_can_use_tool(
    //     &self,
    //     peer: &ProtocolPeer,
    //     tool_name: String,
    //     input: serde_json::Value,
    //     suggestions: Option<Vec<PermissionUpdate>>,
    // ) -> Result<PermissionResult, ExecutorError>;

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
    async fn on_non_control(&self, line: &str) -> Result<(), ExecutorError>;
}
