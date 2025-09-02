use std::{path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::{StreamExt, stream::BoxStream};
use serde::{Deserialize, Serialize};
use tokio::{
    fs::{self, OpenOptions},
    io::AsyncWriteExt,
    process::Command,
};
use ts_rs::TS;
use utils::{msg_store::MsgStore, shell::get_shell_command};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        NormalizedEntry, NormalizedEntryType, plain_text_processor::PlainTextLogProcessor,
        stderr_processor::normalize_stderr_logs, utils::EntryIndexProvider,
    },
    stdout_dup,
};

/// Model variant of Gemini to use
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
pub enum GeminiModel {
    Default, // no --model flag
    Flash,   // --model gemini-2.5-flash
}

impl GeminiModel {
    fn base_command(&self) -> &'static str {
        "npx -y @google/gemini-cli@latest"
    }

    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new(self.base_command());

        if let GeminiModel::Flash = self {
            builder = builder.extend_params(["--model", "gemini-2.5-flash"]);
        }

        builder
    }
}

/// An executor that uses Gemini to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct Gemini {
    pub model: GeminiModel,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub append_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yolo: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Gemini {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = self.model.build_command_builder();

        if self.yolo.unwrap_or(false) {
            builder = builder.extend_params(["--yolo"]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Gemini {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let gemini_command = self.build_command_builder().build_initial();

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(gemini_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command.group_spawn()?;

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        // Duplicate stdout for session logging
        let duplicate_stdout = stdout_dup::duplicate_stdout(&mut child)?;
        tokio::spawn(Self::record_session(
            duplicate_stdout,
            current_dir.clone(),
            prompt.to_string(),
            false,
        ));

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
        _session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Build comprehensive prompt with session context
        let followup_prompt = self.build_followup_prompt(current_dir, prompt).await?;

        let (shell_cmd, shell_arg) = get_shell_command();
        let gemini_command = self.build_command_builder().build_follow_up(&[]);

        let mut command = Command::new(shell_cmd);

        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(gemini_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command.group_spawn()?;

        // Write comprehensive prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(followup_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        // Duplicate stdout for session logging (resume existing session)
        let duplicate_stdout = stdout_dup::duplicate_stdout(&mut child)?;
        tokio::spawn(Self::record_session(
            duplicate_stdout,
            current_dir.clone(),
            prompt.to_string(),
            true,
        ));

        Ok(child)
    }

    /// Parses both stderr and stdout logs for Gemini executor using PlainTextLogProcessor.
    ///
    /// - Stderr: uses the standard stderr log processor, which formats stderr output as ErrorMessage entries.
    /// - Stdout: applies custom `format_chunk` to insert line breaks on period-to-capital transitions,
    ///   then create assitant messages from the output.
    ///
    /// Each entry is converted into an `AssistantMessage` or `ErrorMessage` and emitted as patches.
    ///
    /// # Example
    ///
    /// ```rust,ignore
    /// gemini.normalize_logs(msg_store.clone(), &worktree_path);
    /// ```
    ///
    /// Subsequent queries to `msg_store` will receive JSON patches representing parsed log entries.
    /// Sets up log normalization for the Gemini executor:
    /// - stderr via [`normalize_stderr_logs`]
    /// - stdout via [`PlainTextLogProcessor`] with Gemini-specific formatting and default heuristics
    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &PathBuf) {
        let entry_index_counter = EntryIndexProvider::start_from(&msg_store);
        normalize_stderr_logs(msg_store.clone(), entry_index_counter.clone());

        // Send session ID to msg_store to enable follow-ups
        msg_store.push_session_id(
            worktree_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
        );

        // Normalize Agent logs
        tokio::spawn(async move {
            let mut stdout = msg_store.stdout_chunked_stream();

            // Create a processor with Gemini-specific formatting
            let mut processor = Self::create_gemini_style_processor(entry_index_counter);

            while let Some(Ok(chunk)) = stdout.next().await {
                for patch in processor.process(chunk) {
                    msg_store.push_patch(patch);
                }
            }
        });
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".gemini").join("settings.json"))
    }
}

impl Gemini {
    /// Creates a PlainTextLogProcessor that applies Gemini's sentence-break heuristics.
    ///
    /// This processor formats chunks by inserting line breaks at period-to-capital transitions
    /// and filters out Gemini CLI noise messages.
    pub(crate) fn create_gemini_style_processor(
        index_provider: EntryIndexProvider,
    ) -> PlainTextLogProcessor {
        PlainTextLogProcessor::builder()
            .normalized_entry_producer(Box::new(|content: String| NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::AssistantMessage,
                content,
                metadata: None,
            }))
            .format_chunk(Box::new(|partial, chunk| {
                Self::format_stdout_chunk(&chunk, partial.unwrap_or(""))
            }))
            .transform_lines(Box::new(|lines: &mut Vec<String>| {
                lines.retain(|l| l != "Data collection is disabled.\n");
            }))
            .index_provider(index_provider)
            .build()
    }

    /// Make Gemini output more readable by inserting line breaks where periods are directly
    /// followed by capital letters (common Gemini CLI formatting issue).
    /// Handles both intra-chunk and cross-chunk period-to-capital transitions.
    fn format_stdout_chunk(content: &str, accumulated_message: &str) -> String {
        let mut result = String::with_capacity(content.len() + 100);
        let chars: Vec<char> = content.chars().collect();

        // Check for cross-chunk boundary: previous chunk ended with period, current starts with capital
        if !accumulated_message.is_empty() && !content.is_empty() {
            let ends_with_period = accumulated_message.ends_with('.');
            let starts_with_capital = chars
                .first()
                .map(|&c| c.is_uppercase() && c.is_alphabetic())
                .unwrap_or(false);

            if ends_with_period && starts_with_capital {
                result.push('\n');
            }
        }

        // Handle intra-chunk period-to-capital transitions
        for i in 0..chars.len() {
            result.push(chars[i]);

            // Check if current char is '.' and next char is uppercase letter (no space between)
            if chars[i] == '.' && i + 1 < chars.len() {
                let next_char = chars[i + 1];
                if next_char.is_uppercase() && next_char.is_alphabetic() {
                    result.push('\n');
                }
            }
        }

        result
    }

    async fn record_session(
        mut stdout_stream: BoxStream<'static, std::io::Result<String>>,
        current_dir: PathBuf,
        prompt: String,
        resume_session: bool,
    ) {
        let file_path = Self::get_session_file_path(&current_dir).await;

        // Ensure the directory exists
        if let Some(parent) = file_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }

        // If not resuming session, delete the file first
        if !resume_session {
            let _ = fs::remove_file(&file_path).await;
        }

        // Always append from here on
        let mut file = match OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
            .await
        {
            Ok(file) => file,
            Err(_) => {
                tracing::error!("Failed to open session file: {:?}", file_path);
                return;
            }
        };

        // Write user message as normalized entry
        let mut user_message_json = serde_json::to_string(&NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::UserMessage,
            content: prompt,
            metadata: None,
        })
        .unwrap_or_default();
        user_message_json.push('\n');
        let _ = file.write_all(user_message_json.as_bytes()).await;

        // Read stdout incrementally and append assistant message
        let mut stdout_content = String::new();

        // Read stdout until the process finishes
        while let Some(Ok(chunk)) = stdout_stream.next().await {
            stdout_content.push_str(&chunk);
        }

        let mut assistant_message_json = serde_json::to_string(&NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::AssistantMessage,
            content: stdout_content,
            metadata: None,
        })
        .unwrap_or_default();
        assistant_message_json.push('\n');
        let _ = file.write_all(assistant_message_json.as_bytes()).await;
    }

    /// Build comprehensive prompt with session context for follow-up execution
    async fn build_followup_prompt(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<String, ExecutorError> {
        let session_file_path = Self::get_session_file_path(current_dir).await;

        // Read existing session context
        let session_context = fs::read_to_string(&session_file_path).await.map_err(|e| {
            ExecutorError::FollowUpNotSupported(format!(
                "No existing Gemini session found for this worktree. Session file not found at {session_file_path:?}: {e}"
            ))
        })?;

        Ok(format!(
            r#"RESUME CONTEXT FOR CONTINUING TASK

=== EXECUTION HISTORY ===
The following is the conversation history from this session:
{session_context}

=== CURRENT REQUEST ===
{prompt}

=== INSTRUCTIONS ===
You are continuing work on the above task. The execution history shows the previous conversation in this session. Please continue from where the previous execution left off, taking into account all the context provided above.{}
"#,
            self.append_prompt.clone().unwrap_or_default(),
        ))
    }

    fn get_sessions_base_dir() -> PathBuf {
        // Determine base directory under user's home
        let home = dirs::home_dir().unwrap_or_else(std::env::temp_dir);
        if cfg!(debug_assertions) {
            home.join(".vibe-kanban")
                .join("dev")
                .join("gemini_sessions")
        } else {
            home.join(".vibe-kanban").join("gemini_sessions")
        }
    }

    fn get_legacy_sessions_base_dir() -> PathBuf {
        // Previous location was under the temp-based vibe-kanban dir
        utils::path::get_vibe_kanban_temp_dir().join("gemini_sessions")
    }

    async fn get_session_file_path(current_dir: &PathBuf) -> PathBuf {
        let file_name = current_dir.file_name().unwrap_or_default();
        let new_base = Self::get_sessions_base_dir();
        let new_path = new_base.join(file_name);

        // Ensure base directory exists
        if let Some(parent) = new_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }

        // If the new file doesn't exist yet, try to migrate from legacy location
        let new_exists = fs::metadata(&new_path).await.is_ok();
        if !new_exists {
            let legacy_path = Self::get_legacy_sessions_base_dir().join(file_name);
            if fs::metadata(&legacy_path).await.is_ok() {
                if let Err(e) = fs::rename(&legacy_path, &new_path).await {
                    tracing::warn!(
                        "Failed to migrate Gemini session from {:?} to {:?}: {}",
                        legacy_path,
                        new_path,
                        e
                    );
                } else {
                    tracing::info!(
                        "Migrated Gemini session file from legacy temp directory to persistent directory: {:?}",
                        new_path
                    );
                }
            }
        }

        new_path
    }
}
