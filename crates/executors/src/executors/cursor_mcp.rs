//! `CURSOR_MCP` coding agent: integrate Cursor IDE's Composer Agent via the
//! [PChat][pchat]-style MCP bridge instead of spawning a CLI agent in-process.
//!
//! [pchat]: https://github.com/.../pchat (the original VS Code extension)
//!
//! ## How this differs from every other coding agent
//!
//! All other variants of [`CodingAgent`] spawn a real CLI/agent process and
//! consume its stdout. Cursor MCP is the **opposite** direction:
//!
//! 1. The user runs Cursor IDE separately (with vibe-kanban open in a
//!    different window).
//! 2. The user adds an entry to `~/.cursor/mcp.json` that points at
//!    `vibe-kanban-mcp --mode cursor-bridge --session-id <UUID>` (the UI
//!    has a one-click "Copy MCP config" button — see
//!    `server::routes::cursor_mcp::launch_config`).
//! 3. Cursor's Composer Agent connects to that bridge and calls
//!    `wait_for_user_input` at the end of every turn.
//! 4. The bridge long-polls the vibe-kanban backend; the call blocks until
//!    the user types a reply in vibe-kanban.
//!
//! Because the executor framework requires a real `SpawnedChild` per
//! execution, this implementation spawns a tiny no-op placeholder process
//! (`vibe-kanban-mcp --mode session-placeholder --session-id <UUID>`) which
//! lives until the session is stopped or the workspace is torn down. It is
//! NOT the bridge — it just keeps the framework happy and gives the user a
//! visible "process" for the session.

use std::{path::Path, process::Stdio};

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::command_ext::GroupSpawnNoWindowExt;

use crate::{
    command::CmdOverrides,
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    profile::ExecutorConfig,
};

/// Configuration for the Cursor MCP "PChat-like" persistent chat agent.
///
/// All optional fields are reserved for future extensions (e.g. enforcing a
/// specific Cursor model in the auto-generated mcp.json snippet).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct CursorMcp {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Default for CursorMcp {
    fn default() -> Self {
        Self {
            append_prompt: AppendPrompt::default(),
            cmd: CmdOverrides::default(),
        }
    }
}

/// Resolve the absolute path to the `vibe-kanban-mcp` binary. Shared with
/// the launch-config endpoint so the path the user sees in the copy-mcp
/// snippet matches what the placeholder process actually spawns.
fn resolve_mcp_binary_path() -> std::path::PathBuf {
    workspace_utils::mcp_binary::resolve_mcp_binary().path
}

#[async_trait]
impl StandardCodingAgentExecutor for CursorMcp {
    fn apply_overrides(&mut self, _executor_config: &ExecutorConfig) {
        // No model/permission overrides apply: the actual AI lives inside
        // Cursor IDE and is configured there, not in vibe-kanban.
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // The vibe-kanban session UUID is not directly available in this
        // signature; the placeholder mode falls back to the parent's
        // `VK_SESSION_ID` env var when present, otherwise generates a random
        // UUID solely for log-line readability. The actual user-visible
        // routing key is the vibe-kanban session UUID, which the bridge
        // resolves from its own `--session-id` flag.
        let session_id = env
            .vars
            .get("VK_SESSION_ID")
            .cloned()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let _ = prompt; // The first follow-up may carry a kickoff prompt;
        // for v1 we simply ignore it because Cursor's
        // Agent will produce its own messages once
        // `wait_for_user_input` is called.

        let binary = resolve_mcp_binary_path();
        let mut command = Command::new(&binary);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg("--mode")
            .arg("session-placeholder")
            .arg("--session-id")
            .arg(&session_id);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let child = command.group_spawn_no_window().map_err(|err| {
            ExecutorError::SpawnError(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "Failed to spawn vibe-kanban-mcp session placeholder ({}): {}. \
                     Ensure the `vibe-kanban-mcp` binary is on PATH or set `VK_MCP_BINARY`.",
                    binary.display(),
                    err
                ),
            ))
        })?;

        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        _session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // For Cursor MCP, follow-ups never spawn a fresh agent. The
        // sessions/follow_up handler routes user replies into the
        // [`services::services::cursor_mcp::CursorMcpService`] rendezvous
        // before reaching here. Reaching this method indicates the session
        // has lost its placeholder process; spin up a new one so the
        // execution_process row stays alive.
        self.spawn(current_dir, prompt, env).await
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        // `~/.cursor/mcp.json` is where the bridge entry must live so
        // Cursor IDE can launch it. The "Copy MCP config" button in the UI
        // points at this path, but vibe-kanban does NOT auto-edit it (see
        // the `manual_only` install policy in v1).
        dirs::home_dir().map(|home| home.join(".cursor").join("mcp.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Always available: the agent has no CLI dependency to detect.
        // Cursor IDE itself is required at runtime, but we can't reliably
        // detect its installation from here.
        AvailabilityInfo::InstallationFound
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::CursorMcp,
            variant: None,
            model_id: None,
            agent_id: None,
            reasoning_id: None,
            permission_policy: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_binary_falls_back_to_plain_name() {
        // Ensure VK_MCP_BINARY isn't set so we exercise the fallback path.
        // This test is intentionally light-touch (it does not check the
        // binary actually exists at the resolved path).
        // SAFETY: Test runs single-threaded by default for the executors
        // crate; no concurrent reader is expected on this env var.
        unsafe { std::env::remove_var("VK_MCP_BINARY") };
        let path = resolve_mcp_binary_path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        assert!(
            file_name == "vibe-kanban-mcp"
                || file_name == "vibe-kanban-mcp.exe"
                || file_name == "server"
                || file_name == "server.exe",
            "unexpected fallback binary: {file_name:?}"
        );
    }
}
