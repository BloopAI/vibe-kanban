use std::{collections::HashMap, path::PathBuf, sync::Arc};

use futures::StreamExt;
use json_patch::Patch;
use serde::{Deserialize, Serialize};
use serde_json::{from_value, json};
use tokio::task::JoinHandle;
use utils::{log_msg::LogMsg, msg_store::MsgStore};

use super::{
    LogNormalizer, NormalizedConversation, NormalizedEntry, NormalizedEntryType,
    patch::ConversationPatch,
};

#[derive(Clone)]
pub struct AmpLogNormalizer {}

impl AmpLogNormalizer {
    fn normalize_log_line(log_line: &str) -> Option<AmpJson> {
        let trimmed = log_line.trim();
        let amp_json: AmpJson = match serde_json::from_str(trimmed) {
            Ok(json_msg) => json_msg,
            Err(_) => return None,
        };

        Some(amp_json)
    }
}

impl LogNormalizer for AmpLogNormalizer {
    fn normalize_logs(&self, raw_logs_msg_store: Arc<MsgStore>, current_dir: &PathBuf) {
        let current_dir = current_dir.clone();
        tokio::spawn(async move {
            let mut s = raw_logs_msg_store.history_plus_stream().await;
            let mut buf = String::new();
            let mut patches: Vec<Patch> = vec![];
            let mut last_patch_entry_id = 0;
            // 1 amp message id = multiple patch entry ids
            let mut seen_amp_message_ids: HashMap<usize, Vec<usize>> = HashMap::new();
            while let Some(Ok(m)) = s.next().await {
                let chunk = match m {
                    LogMsg::Stdout(x) | LogMsg::Stderr(x) => x,
                    LogMsg::JsonPatch(_) => {
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
                    let patches: Vec<Patch> = match Self::normalize_log_line(&line) {
                        Some(amp_json) => match amp_json {
                            AmpJson::Messages {
                                messages,
                                tool_results,
                            } => {
                                let mut inner_patches: Vec<Patch> = vec![];

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
                                                    let new_id = last_patch_entry_id + 1;
                                                    last_patch_entry_id = new_id;
                                                    seen_amp_message_ids
                                                        .entry(amp_message_id)
                                                        .or_default()
                                                        .push(new_id);
                                                    ConversationPatch::add(new_id, entry)
                                                }
                                                Some(patch_ids) => {
                                                    match patch_ids.get(content_index) {
                                                        Some(patch_id) => {
                                                            ConversationPatch::replace(
                                                                *patch_id, entry,
                                                            )
                                                        }
                                                        None => {
                                                            let new_id = last_patch_entry_id + 1;
                                                            last_patch_entry_id = new_id;
                                                            patch_ids.push(new_id);
                                                            ConversationPatch::add(new_id, entry)
                                                        }
                                                    }
                                                }
                                            };

                                            inner_patches.push(patch);
                                        }
                                    }
                                }

                                inner_patches
                            }
                            _ => {
                                vec![]
                            }
                        },
                        None => {
                            todo!();
                            // let trimmed = line.trim();
                            // vec![NormalizedEntry {
                            //     timestamp: None,
                            //     entry_type: NormalizedEntryType::SystemMessage,
                            //     content: format!("Raw output: {}", trimmed),
                            //     metadata: None,
                            // }];
                        }
                    };

                    for patch in patches {
                        raw_logs_msg_store.push_patch(patch);
                    }
                }
                buf = buf.rsplit('\n').next().unwrap_or("").to_owned();
            }
            if !buf.is_empty() {
                print!("{buf}");
            }
        });

        // let mut entries = Vec::new();
        // let mut session_id = None;

        // for line in logs.lines() {
        //     let trimmed = line.trim();
        //     if trimmed.is_empty() {
        //         continue;
        //     }

        //     // Try to parse as AmpMessage
        //     let amp_message: AmpJson = match serde_json::from_str(trimmed) {
        //         Ok(msg) => msg,
        //         Err(_) => {
        //             // If line isn't valid JSON, add it as raw text
        //             entries.push(NormalizedEntry {
        //                 timestamp: None,
        //                 entry_type: NormalizedEntryType::SystemMessage,
        //                 content: format!("Raw output: {}", trimmed),
        //                 metadata: None,
        //             });
        //             continue;
        //         }
        //     };

        //     // Extract session ID if available
        //     if session_id.is_none() {
        //         if let Some(id) = amp_message.extract_session_id() {
        //             session_id = Some(id);
        //         }
        //     }

        //     // Process the message if it's a type we care about
        //     if amp_message.should_process() {
        //         let new_entries = amp_message.to_normalized_entries(worktree_path);
        //         entries.extend(new_entries);
        //     }
        // }

        // Ok(NormalizedConversation {
        //     entries,
        //     session_id,
        //     executor_type: "amp".to_string(),
        //     prompt: None,
        //     summary: None,
        // })
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
