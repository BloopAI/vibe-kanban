use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{AppendPrompt, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    logs::{
        NormalizedEntry, NormalizedEntryType, plain_text_processor::PlainTextLogProcessor,
        utils::EntryIndexProvider,
    },
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Warp {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

/// Returns the default Warp CLI command based on the platform
fn default_warp_base_command() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        "warp-cli" // Linux standalone default
    }
    #[cfg(target_os = "macos")]
    {
        "warp" // macOS default (both standalone and bundled)
    }
    #[cfg(target_os = "windows")]
    {
        "warp" // Windows bundled default
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        "warp-cli" // Fallback for other platforms
    }
}

impl Warp {
    fn build_command_builder(&self) -> CommandBuilder {
        let builder =
            CommandBuilder::new(default_warp_base_command()).extend_params(["agent", "run"]);
        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Warp {
    async fn spawn(&self, current_dir: &Path, prompt: &str) -> Result<SpawnedChild, ExecutorError> {
        use command_group::AsyncCommandGroup;
        use tokio::process::Command;
        use workspace_utils::shell::get_shell_command;

        let (shell_cmd, shell_arg) = get_shell_command();
        let command_builder = self.build_command_builder();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        // Build command: warp-cli agent run --prompt "task" (or warp/warp-terminal depending on platform)
        let base_command = command_builder
            .extend_params(["--prompt", &combined_prompt])
            .build_initial();

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&base_command);

        // Ensure WARP_API_KEY is available in environment
        // The executor will inherit it from the parent process environment

        let child = command.group_spawn()?;
        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        _current_dir: &Path,
        _prompt: &str,
        _session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Warp session support is unknown - return error for now
        Err(ExecutorError::FollowUpNotSupported(
            "Warp session resumption is not yet supported. Please verify if Warp CLI supports --resume or similar functionality.".to_string()
        ))
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, _worktree_path: &Path) {
        // Use plain text processor since Warp's output format is unknown
        // This can be updated once we know if Warp outputs JSON or uses ACP
        use futures::StreamExt;

        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        tokio::spawn(async move {
            let mut stdout = msg_store.history_plus_stream();

            // Create a processor for plain text stdout
            let mut processor = PlainTextLogProcessor::builder()
                .normalized_entry_producer(|content: String| NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::AssistantMessage,
                    content: strip_ansi_escapes::strip_str(&content),
                    metadata: None,
                })
                .index_provider(entry_index_provider)
                .build();

            while let Some(Ok(msg)) = stdout.next().await {
                let chunk = match msg {
                    workspace_utils::log_msg::LogMsg::Stdout(x) => x,
                    workspace_utils::log_msg::LogMsg::Finished => break,
                    _ => continue,
                };

                for patch in processor.process(chunk) {
                    msg_store.push_patch(patch);
                }
            }
        });
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        // Guessing config path - needs verification
        // Common patterns: ~/.warp/config.json or ~/.config/warp/config.json
        dirs::home_dir().map(|home| home.join(".warp").join("config.json"))
    }
}
