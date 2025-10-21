//! Claude Agent SDK client implementation
//!
//! This client handles control protocol callbacks and manages tool approvals.
//! MVP: Auto-approves all tools and switches to bypassPermissions mode.

use std::sync::{Arc, OnceLock};
use async_trait::async_trait;

use super::protocol::{ProtocolPeer, ProtocolCallbacks};
use super::types::{PermissionResult, PermissionUpdate};
use crate::executors::{ExecutorError, codex::client::LogWriter};

/// Claude Agent client with control protocol support
pub struct ClaudeAgentClient {
    protocol: OnceLock<ProtocolPeer>,
    log_writer: LogWriter,
    auto_approve: bool, // true for MVP, false when using approval service
}

impl ClaudeAgentClient {
    /// Create a new client with auto-approve mode
    pub fn new(log_writer: LogWriter) -> Arc<Self> {
        Arc::new(Self {
            protocol: OnceLock::new(),
            log_writer,
            auto_approve: true, // Hardcoded for MVP
        })
    }

    /// Connect the protocol peer
    pub fn connect(&self, peer: ProtocolPeer) {
        let _ = self.protocol.set(peer);
    }

    /// Get the protocol peer (panics if not connected)
    #[allow(dead_code)]
    fn protocol(&self) -> &ProtocolPeer {
        self.protocol.get().expect("Protocol peer not attached")
    }
}

#[async_trait]
impl ProtocolCallbacks for ClaudeAgentClient {
    async fn on_can_use_tool(
        &self,
        _peer: &ProtocolPeer,
        tool_name: String,
        input: serde_json::Value,
        _suggestions: Option<Vec<PermissionUpdate>>,
    ) -> Result<PermissionResult, ExecutorError> {
        // MVP: Auto-approve everything
        if self.auto_approve {
            // Log what we're approving
            let input_str = serde_json::to_string(&input)
                .unwrap_or_else(|_| "<invalid json>".to_string());

            self.log_writer
                .log_raw(&format!(
                    "[AUTO-APPROVE] Tool: {} Input: {}",
                    tool_name,
                    input_str
                ))
                .await?;

            // Return allow with mode change to bypassPermissions
            Ok(PermissionResult::Allow {
                updated_input: input,
                updated_permissions: Some(vec![PermissionUpdate {
                    update_type: "setMode".to_string(),
                    mode: Some("bypassPermissions".to_string()),
                    destination: Some("session".to_string()),
                }]),
            })
        } else {
            // TODO: Phase 2 - integrate with approval service
            // For now, just deny if auto_approve is false
            Ok(PermissionResult::Deny {
                message: "Approval service not yet implemented".to_string(),
                interrupt: Some(false),
            })
        }
    }

    async fn on_hook_callback(
        &self,
        _peer: &ProtocolPeer,
        _callback_id: String,
        input: serde_json::Value,
    ) -> Result<serde_json::Value, ExecutorError> {
        // Hook callback is how the CLI asks for approval via hooks
        // Extract tool_name from the hook input
        let tool_name = input.get("tool_name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        // MVP: Auto-approve
        if self.auto_approve {
            self.log_writer
                .log_raw(&format!(
                    "[AUTO-APPROVE via hook] Tool: {}",
                    tool_name
                ))
                .await?;

            // Return hook output format with hookSpecificOutput and updatedPermissions
            Ok(serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": "Auto-approved by SDK"
                },
                "updatedPermissions": [
                    {
                        "type": "setMode",
                        "mode": "bypassPermissions",
                        "destination": "session"
                    }
                ]
            }))
        } else {
            // TODO: Phase 2 - integrate with approval service
            Ok(serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "Approval service not yet implemented"
                }
            }))
        }
    }

    async fn on_non_control(&self, line: &str) -> Result<(), ExecutorError> {
        // Forward all non-control messages to stdout
        self.log_writer.log_raw(line).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_auto_approve() {
        // Create a simple log writer that writes to a vec
        let (tx, rx) = tokio::sync::mpsc::channel(100);
        let writer = LogWriter::new(tokio_test_writer(tx));

        let client = ClaudeAgentClient::new(writer);

        let result = client.on_can_use_tool(
            &ProtocolPeer::spawn(
                tokio::process::Command::new("true")
                    .stdin(std::process::Stdio::piped())
                    .spawn()
                    .unwrap()
                    .stdin
                    .take()
                    .unwrap(),
                tokio::process::Command::new("true")
                    .stdout(std::process::Stdio::piped())
                    .spawn()
                    .unwrap()
                    .stdout
                    .take()
                    .unwrap(),
                client.clone(),
            ),
            "Write".to_string(),
            serde_json::json!({"file_path": "test.txt", "content": "hello"}),
            None,
        ).await.unwrap();

        // Should get an allow result
        match result {
            PermissionResult::Allow { updated_permissions, .. } => {
                assert!(updated_permissions.is_some());
                let updates = updated_permissions.unwrap();
                assert_eq!(updates.len(), 1);
                assert_eq!(updates[0].update_type, "setMode");
                assert_eq!(updates[0].mode, Some("bypassPermissions".to_string()));
            }
            _ => panic!("Expected Allow result"),
        }

        // Should have logged the approval
        drop(client);
        let log = rx.recv().await.unwrap();
        assert!(log.contains("AUTO-APPROVE"));
        assert!(log.contains("Write"));
    }

    // Helper to create a writer that sends to a channel
    fn tokio_test_writer(tx: tokio::sync::mpsc::Sender<String>) -> impl tokio::io::AsyncWrite + Send + Unpin + 'static {
        struct TestWriter(tokio::sync::mpsc::Sender<String>);
        impl tokio::io::AsyncWrite for TestWriter {
            fn poll_write(
                mut self: std::pin::Pin<&mut Self>,
                _cx: &mut std::task::Context<'_>,
                buf: &[u8],
            ) -> std::task::Poll<Result<usize, std::io::Error>> {
                let s = String::from_utf8_lossy(buf).to_string();
                let _ = self.0.try_send(s);
                std::task::Poll::Ready(Ok(buf.len()))
            }

            fn poll_flush(
                self: std::pin::Pin<&mut Self>,
                _cx: &mut std::task::Context<'_>,
            ) -> std::task::Poll<Result<(), std::io::Error>> {
                std::task::Poll::Ready(Ok(()))
            }

            fn poll_shutdown(
                self: std::pin::Pin<&mut Self>,
                _cx: &mut std::task::Context<'_>,
            ) -> std::task::Poll<Result<(), std::io::Error>> {
                std::task::Poll::Ready(Ok(()))
            }
        }
        TestWriter(tx)
    }
}
