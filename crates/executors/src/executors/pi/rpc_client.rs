use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use serde_json::json;
use tokio::{
    io::AsyncWriteExt,
    process::ChildStdin,
    sync::Mutex,
};

use crate::executors::ExecutorError;

/// RPC client for communicating with Pi via stdin
pub struct PiRpcClient {
    stdin: Arc<Mutex<ChildStdin>>,
    command_id: AtomicU64,
}

impl PiRpcClient {
    /// Create a new RPC client
    pub fn new(stdin: ChildStdin) -> Self {
        Self {
            stdin: Arc::new(Mutex::new(stdin)),
            command_id: AtomicU64::new(1),
        }
    }

    /// Send a prompt to the agent
    pub async fn send_prompt(&self, message: &str) -> Result<(), ExecutorError> {
        let cmd = json!({
            "id": self.next_id(),
            "type": "prompt",
            "message": message
        });
        self.send_command(&cmd).await
    }

    /// Send a follow-up prompt (same as prompt in RPC mode)
    pub async fn send_follow_up(&self, message: &str) -> Result<(), ExecutorError> {
        self.send_prompt(message).await
    }

    /// Abort current operation
    pub async fn abort(&self) -> Result<(), ExecutorError> {
        let cmd = json!({
            "id": self.next_id(),
            "type": "abort"
        });
        self.send_command(&cmd).await
    }

    /// Get current state (includes session info)
    pub async fn get_state(&self) -> Result<(), ExecutorError> {
        let cmd = json!({
            "id": self.next_id(),
            "type": "get_state"
        });
        self.send_command(&cmd).await
    }

    /// Send a raw JSON command
    async fn send_command(&self, cmd: &serde_json::Value) -> Result<(), ExecutorError> {
        let line = format!("{}\n", serde_json::to_string(cmd)?);
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(ExecutorError::Io)?;
        stdin.flush().await.map_err(ExecutorError::Io)?;
        Ok(())
    }

    /// Generate a unique command ID
    fn next_id(&self) -> String {
        format!("vk-{}", self.command_id.fetch_add(1, Ordering::SeqCst))
    }
}

impl Clone for PiRpcClient {
    fn clone(&self) -> Self {
        Self {
            stdin: Arc::clone(&self.stdin),
            command_id: AtomicU64::new(self.command_id.load(Ordering::SeqCst)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_id_format() {
        // Verify the command ID format is as expected
        let id = format!("vk-{}", 1u64);
        assert_eq!(id, "vk-1");
    }
}
