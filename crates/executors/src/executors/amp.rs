// use std::{
//     path::{Path, PathBuf},
//     process::Stdio,
// };

// use async_trait::async_trait;
// use command_group::{AsyncCommandGroup, AsyncGroupChild};
// use serde::{Deserialize, Serialize};
// use tokio::{io::AsyncWriteExt, process::Command};

// use crate::utils::shell::get_shell_command;
use std::{collections::HashMap, path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use json_patch::Patch;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{log_msg::LogMsg, msg_store::MsgStore, shell::get_shell_command};

use crate::{
    command::{AgentProfiles, CommandBuilder},
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        NormalizedEntry, NormalizedEntryType,
        stderr_processor::normalize_stderr_logs,
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
};

/// An executor that uses Amp to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct Amp {
    command_builder: CommandBuilder,
}

impl Default for Amp {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Amp {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let amp_command = self.command_builder.build_initial();

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped()) // <-- open a pipe
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(amp_command);

        let mut child = command.group_spawn()?;

        // feed the prompt in, then close the pipe so `amp` sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await.unwrap();
            stdin.shutdown().await.unwrap(); // or `drop(stdin);`
        }

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let amp_command = self.command_builder.build_follow_up(&[
            "threads".to_string(),
            "continue".to_string(),
            session_id.to_string(),
        ]);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&amp_command);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so amp sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    fn normalize_logs(&self, raw_logs_msg_store: Arc<MsgStore>, current_dir: &PathBuf) {
        let entry_index_provider = EntryIndexProvider::new();

        // Process stderr logs using the standard stderr processor
        normalize_stderr_logs(raw_logs_msg_store.clone(), entry_index_provider.clone());

        // Process stdout logs (Amp's JSON output)
        let current_dir = current_dir.clone();
        tokio::spawn(async move {
            let mut s = raw_logs_msg_store.history_plus_stream().await;
            let mut buf = String::new();
            // 1 amp message id = multiple patch entry ids
            let mut seen_amp_message_ids: HashMap<usize, Vec<usize>> = HashMap::new();
            while let Some(Ok(m)) = s.next().await {
                let chunk = match m {
                    LogMsg::Stdout(x) => x,
                    LogMsg::JsonPatch(_) | LogMsg::SessionId(_) | LogMsg::Stderr(_) => {
                        continue;
                    }
                    LogMsg::Finished => break,
                };
                buf.push_str(&chunk);

                // Print complete lines; keep the trailing partial (if any)
                for line in buf
                    .split_inclusive('\n')
                    .filter(|l| l.ends_with('\n'))
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
                {
                    let trimmed = line.trim();
                    match serde_json::from_str(trimmed) {
                        Ok(amp_json) => {
                            match amp_json {
                                AmpJson::Messages {
                                    messages,
                                    tool_results: _,
                                } => {
                                    for (amp_message_id, message) in messages {
                                        let role = &message.role;

                                        for (content_index, content_item) in
                                            message.content.iter().enumerate()
                                        {
                                            let mut has_patch_ids =
                                                seen_amp_message_ids.get_mut(&amp_message_id);

                                            if let Some(entry) = content_item.to_normalized_entry(
                                                role,
                                                &message,
                                                &current_dir.to_string_lossy(),
                                            ) {
                                                let patch: Patch = match &mut has_patch_ids {
                                                    None => {
                                                        let new_id = entry_index_provider.next();
                                                        seen_amp_message_ids
                                                            .entry(amp_message_id)
                                                            .or_default()
                                                            .push(new_id);
                                                        ConversationPatch::add_normalized_entry(
                                                            new_id, entry,
                                                        )
                                                    }
                                                    Some(patch_ids) => {
                                                        match patch_ids.get(content_index) {
                                                            Some(patch_id) => {
                                                                ConversationPatch::replace(
                                                                    *patch_id, entry,
                                                                )
                                                            }
                                                            None => {
                                                                let new_id =
                                                                    entry_index_provider.next();
                                                                patch_ids.push(new_id);
                                                                ConversationPatch::add_normalized_entry(new_id, entry)
                                                            }
                                                        }
                                                    }
                                                };

                                                raw_logs_msg_store.push_patch(patch);
                                            }
                                        }
                                    }
                                }
                                AmpJson::Initial { thread_id } => {
                                    if let Some(thread_id) = thread_id {
                                        raw_logs_msg_store.push_session_id(thread_id);
                                    }
                                }
                                _ => {}
                            }
                        }
                        Err(_) => {
                            let trimmed = line.trim();
                            if !trimmed.is_empty() {
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::SystemMessage,
                                    content: format!("Raw output: {}", trimmed),
                                    metadata: None,
                                };

                                let new_id = entry_index_provider.next();
                                let patch = ConversationPatch::add_normalized_entry(new_id, entry);
                                raw_logs_msg_store.push_patch(patch);
                            }
                        }
                    };
                }
                buf = buf.rsplit('\n').next().unwrap_or("").to_owned();
            }
            if !buf.is_empty() {
                print!("{buf}");
            }
        });
    }
}

impl Amp {
    pub fn new() -> Self {
        let profile = AgentProfiles::get_cached()
            .get_profile("amp")
            .expect("Default amp profile should exist");

        Self::with_command_builder(profile.command.clone())
    }

    pub fn with_command_builder(command_builder: CommandBuilder) -> Self {
        Self { command_builder }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum AmpJson {
    #[serde(rename = "messages")]
    Messages {
        messages: Vec<(usize, AmpMessage)>,
        #[serde(rename = "toolResults")]
        tool_results: Vec<serde_json::Value>,
    },
    #[serde(rename = "initial")]
    Initial {
        #[serde(rename = "threadID")]
        thread_id: Option<String>,
    },
    #[serde(rename = "token-usage")]
    TokenUsage(serde_json::Value),
    #[serde(rename = "state")]
    State { state: String },
    #[serde(rename = "shutdown")]
    Shutdown,
    #[serde(rename = "tool-status")]
    ToolStatus(serde_json::Value),
}

impl AmpJson {
    pub fn should_process(&self) -> bool {
        matches!(self, AmpJson::Messages { .. })
    }

    pub fn extract_session_id(&self) -> Option<String> {
        match self {
            AmpJson::Initial { thread_id } => thread_id.clone(),
            _ => None,
        }
    }

    pub fn has_streaming_content(&self) -> bool {
        match self {
            AmpJson::Messages { messages, .. } => messages.iter().any(|(_index, message)| {
                if let Some(state) = &message.state {
                    if let Some(state_type) = state.get("type").and_then(|t| t.as_str()) {
                        state_type == "streaming"
                    } else {
                        false
                    }
                } else {
                    false
                }
            }),
            _ => false,
        }
    }

    // pub fn to_normalized_entries(&self, current_dir: &PathBuf) -> Vec<NormalizedEntry> {
    //     match self {
    //         AmpJson::Messages { messages, .. } => {
    //             if self.has_streaming_content() {
    //                 return vec![];
    //             }

    //             let mut entries = Vec::new();
    //             for (_index, message) in messages {
    //                 let role = &message.role;
    //                 for content_item in &message.content {
    //                     if let Some(entry) = content_item.to_normalized_entry(
    //                         role,
    //                         message,
    //                         &current_dir.to_string_lossy(),
    //                     ) {
    //                         entries.push(entry);
    //                     }
    //                 }
    //             }
    //             entries
    //         }
    //         _ => vec![],
    //     }
    // }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AmpMessage {
    pub role: String,
    pub content: Vec<AmpContentItem>,
    pub state: Option<serde_json::Value>,
    pub meta: Option<AmpMeta>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AmpMeta {
    #[serde(rename = "sentAt")]
    pub sent_at: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum AmpContentItem {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "thinking")]
    Thinking { thinking: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        #[serde(rename = "toolUseID")]
        tool_use_id: String,
        run: serde_json::Value,
    },
}

impl AmpContentItem {
    pub fn to_normalized_entry(
        &self,
        role: &str,
        message: &AmpMessage,
        worktree_path: &str,
    ) -> Option<NormalizedEntry> {
        use serde_json::Value;

        let timestamp = message.meta.as_ref().map(|meta| meta.sent_at.to_string());

        match self {
            AmpContentItem::Text { text } => {
                let entry_type = match role {
                    "user" => NormalizedEntryType::UserMessage,
                    "assistant" => NormalizedEntryType::AssistantMessage,
                    _ => return None,
                };
                Some(NormalizedEntry {
                    timestamp,
                    entry_type,
                    content: text.clone(),
                    metadata: Some(serde_json::to_value(self).unwrap_or(Value::Null)),
                })
            }
            AmpContentItem::Thinking { thinking } => Some(NormalizedEntry {
                timestamp,
                entry_type: NormalizedEntryType::Thinking,
                content: thinking.clone(),
                metadata: Some(serde_json::to_value(self).unwrap_or(Value::Null)),
            }),
            AmpContentItem::ToolUse { name, input, .. } => {
                // TODO: needs refactoring as Executor was removed as param
                // let action_type = executor.extract_action_type(name, input, worktree_path);
                // let content =
                //     executor.generate_concise_content(name, input, &action_type, worktree_path);

                // Some(NormalizedEntry {
                //     timestamp,
                //     entry_type: NormalizedEntryType::ToolUse {
                //         tool_name: name.clone(),
                //         action_type,
                //     },
                //     content,
                //     metadata: Some(serde_json::to_value(self).unwrap_or(Value::Null)),
                // })
                None
            }
            AmpContentItem::ToolResult { .. } => None,
        }
    }
}
