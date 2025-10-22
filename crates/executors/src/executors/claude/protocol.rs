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
    ControlRequestMessage, ControlRequestType, ControlResponse, ControlResponseMessage,
    PermissionResult, PermissionUpdate,
};
use crate::executors::{ExecutorError, claude::types::PermissionMode};

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
                        tracing::debug!("Received control request: {:?}", control_req.request);
                        if control_req.message_type == "control_request" {
                            self.handle_control_request(&callbacks, control_req).await;
                        }
                    } else if let Ok(control_resp) =
                        serde_json::from_str::<ControlResponseMessage>(line)
                    {
                        // Control response - might be init response or other
                        tracing::debug!("Received control response: {:?}", control_resp.response);
                    } else {
                        // Not a control message - regular Claude output
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
                match callbacks
                    .on_can_use_tool(self, tool_name, input, permission_suggestions)
                    .await
                {
                    Ok(result) => {
                        if let Err(e) = self.send_permission_result(request_id, result).await {
                            tracing::error!("Failed to send permission result: {}", e);
                        }
                    }
                    Err(e) => {
                        tracing::error!("Error in on_can_use_tool: {}", e);
                        if let Err(e2) = self.send_error(request_id, e.to_string()).await {
                            tracing::error!("Failed to send error response: {}", e2);
                        }
                    }
                }
            }
            ControlRequestType::HookCallback { callback_id, input } => {
                tracing::warn!("Received unexpected HookCallback request - hooks not implemented");
                // match callbacks.on_hook_callback(self, callback_id, input).await {
                //     Ok(hook_output) => {
                //         // Send hook output directly (not wrapped in PermissionResult)
                //         if let Err(e) = self.send_hook_response(request_id, hook_output).await {
                //             tracing::error!("Failed to send hook callback result: {}", e);
                //         }
                //     }
                //     Err(e) => {
                //         tracing::error!("Error in on_hook_callback: {}", e);
                //         if let Err(e2) = self.send_error(request_id, e.to_string()).await {
                //             tracing::error!("Failed to send error response: {}", e2);
                //         }
                //     }
                // }
            }
        }
    }

    /// Send permission result back to CLI (for can_use_tool)
    pub async fn send_permission_result(
        &self,
        request_id: String,
        result: PermissionResult,
    ) -> Result<(), ExecutorError> {
        let response = ControlResponse {
            request_id,
            subtype: "success".to_string(),
            response: Some(serde_json::to_value(result)?),
            error: None,
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
        let response = ControlResponse {
            request_id,
            subtype: "success".to_string(),
            response: Some(hook_output),
            error: None,
        };

        let message = ControlResponseMessage {
            message_type: "control_response".to_string(),
            response,
        };

        self.send_json(&message).await
    }

    /// Send error response to CLI
    async fn send_error(&self, request_id: String, error: String) -> Result<(), ExecutorError> {
        let response = ControlResponse {
            request_id,
            subtype: "error".to_string(),
            response: None,
            error: Some(error),
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
        let init_request = serde_json::json!({
            "type": "control_request",
            // "request_id": "init_001",
            "request": {
                "subtype": "initialize",
                "hooks": {
                    // "PreToolUse": [
                    //     {
                    //         "matcher": ".*",
                    //         "hookCallbackIds": ["tool_approval"]
                    //     }
                    // ]
                }
            }
        });
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

        let mode_request = serde_json::json!({
            "type": "control_request",
            "request_id": format!("set_mode_{}", Uuid::new_v4()),
            "request": {
                "subtype": "set_permission_mode",
                "mode": mode.as_str()
            }
        });
        self.send_json(&mode_request).await
    }
}

/// Callbacks for control protocol events
#[async_trait]
pub trait ProtocolCallbacks: Send + Sync {
    /// Called when CLI requests tool permission
    async fn on_can_use_tool(
        &self,
        peer: &ProtocolPeer,
        tool_name: String,
        input: serde_json::Value,
        suggestions: Option<Vec<PermissionUpdate>>,
    ) -> Result<PermissionResult, ExecutorError>;

    // /// Called when CLI sends hook callback (for PreToolUse hooks)
    // /// Returns hook output JSON (not PermissionResult)
    // async fn on_hook_callback(
    //     &self,
    //     peer: &ProtocolPeer,
    //     callback_id: String,
    //     input: serde_json::Value,
    // ) -> Result<serde_json::Value, ExecutorError>;

    /// Called for non-control messages (regular Claude output)
    async fn on_non_control(&self, line: &str) -> Result<(), ExecutorError>;
}
