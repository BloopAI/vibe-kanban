mod share_bridge;

use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, LazyLock},
};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use fork_stream::StreamExt as _;
use futures::{StreamExt, future::ready, stream::BoxStream};
use regex::Regex;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use workspace_utils::{msg_store::MsgStore, path::make_path_relative};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        opencode::share_bridge::Bridge as ShareBridge,
    },
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryError, NormalizedEntryType,
        TodoItem, ToolStatus, utils::EntryIndexProvider,
    },
    stdout_dup,
};

// Typed structures for oc-share tool state
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct OcToolInput {
    #[serde(rename = "filePath", default)]
    file_path: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    include: Option<String>,
    #[serde(default)]
    pattern: Option<String>,
    #[serde(default)]
    command: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    format: Option<String>,
    #[serde(default)]
    timeout: Option<u64>,
    #[serde(rename = "oldString", default)]
    old_string: Option<String>,
    #[serde(rename = "newString", default)]
    new_string: Option<String>,
    #[serde(rename = "replaceAll", default)]
    replace_all: Option<bool>,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    todos: Option<Vec<TodoInfo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct OcToolMetadata {
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    exit: Option<i32>,
    #[serde(default)]
    diff: Option<String>,
    #[serde(default)]
    count: Option<u64>,
    #[serde(default)]
    truncated: Option<bool>,
    #[serde(default)]
    preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct OcToolState {
    #[serde(default)]
    input: Option<OcToolInput>,
    #[serde(default)]
    metadata: Option<OcToolMetadata>,
    #[serde(default)]
    output: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Opencode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Opencode {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("npx -y opencode-ai@1.0.68 run").params([
            "--print-logs",
            "--log-level",
            "ERROR",
        ]);

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        if let Some(agent) = &self.agent {
            builder = builder.extend_params(["--agent", agent]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Opencode {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Start a dedicated local share bridge bound to this opencode process
        let bridge = ShareBridge::start().await.map_err(ExecutorError::Io)?;
        let command_parts = self.build_command_builder().build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped()) // Keep stdout but we won't use it
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1")
            .env("OPENCODE_AUTO_SHARE", "1")
            .env("OPENCODE_API", bridge.base_url.clone());

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = match command.group_spawn() {
            Ok(c) => c,
            Err(e) => {
                // If opencode fails to start, shut down the bridge to free the port
                bridge.shutdown().await;
                return Err(ExecutorError::SpawnError(e));
            }
        };

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }
        // Transfer share events as lines for normalization through stdout
        let (mut dup_stream, appender) = stdout_dup::tee_stdout_with_appender(&mut child)?;
        let mut rx = bridge.subscribe();
        tokio::spawn(async move {
            while let Ok(crate::executors::opencode::share_bridge::ShareEvent::Sync(mut req)) =
                rx.recv().await
            {
                req.secret.clear();
                if let Ok(json) = serde_json::to_string(&req) {
                    appender.append_line(format!("{}{}", Opencode::SHARE_PREFIX, json));
                }
            }
        });

        // Monitor child's stdout end; when it closes, shut down the bridge to release the port
        let bridge_for_shutdown = bridge.clone();
        tokio::spawn(async move {
            use futures::StreamExt;
            while let Some(_chunk) = dup_stream.next().await {}
            tracing::debug!("Opencode process stdout closed");
            bridge_for_shutdown.shutdown().await;
        });
        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Start a dedicated local share bridge bound to this opencode process
        let bridge = ShareBridge::start().await.map_err(ExecutorError::Io)?;
        let command_parts = self
            .build_command_builder()
            .build_follow_up(&["--session".to_string(), session_id.to_string()])?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped()) // Keep stdout but we won't use it
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1")
            .env("OPENCODE_AUTO_SHARE", "1")
            .env("OPENCODE_API", bridge.base_url.clone());

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = match command.group_spawn() {
            Ok(c) => c,
            Err(e) => {
                bridge.shutdown().await;
                return Err(ExecutorError::SpawnError(e));
            }
        };

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }
        // Transfer share events as lines for normalization through stdout
        let (mut dup_stream, appender) = stdout_dup::tee_stdout_with_appender(&mut child)?;
        let mut rx = bridge.subscribe();
        tokio::spawn(async move {
            while let Ok(crate::executors::opencode::share_bridge::ShareEvent::Sync(mut req)) =
                rx.recv().await
            {
                req.secret.clear();
                if let Ok(json) = serde_json::to_string(&req) {
                    appender.append_line(format!("{}{}", Opencode::SHARE_PREFIX, json));
                }
            }
        });

        let bridge_for_shutdown = bridge.clone();
        tokio::spawn(async move {
            use futures::StreamExt;
            while let Some(_chunk) = dup_stream.next().await {}
            bridge_for_shutdown.shutdown().await;
        });
        Ok(child.into())
    }

    /// Normalize logs for OpenCode executor
    ///
    /// This implementation uses three separate threads:
    /// 1. Session ID thread: read by line, search for session ID format, store it.
    /// 2. Error log recognition thread: read by line, identify error log lines, store them as error messages.
    /// 3. Main normalizer thread: read stderr by line, filter out log lines, send lines (with '\n' appended) to plain text normalizer,
    ///    then define predicate for split and create appropriate normalized entry (either assistant or tool call).
    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        let entry_index_counter = EntryIndexProvider::start_from(&msg_store);

        let stderr_lines = msg_store
            .stderr_lines_stream()
            .filter_map(|res| ready(res.ok()))
            .map(|line| strip_ansi_escapes::strip_str(&line))
            .fork();

        // Log line: INFO  2025-08-05T10:17:26 +1ms service=session id=ses_786439b6dffe4bLqNBS4fGd7mJ
        // error line: !  some error message
        let log_lines = stderr_lines
            .clone()
            .filter(|line| {
                ready(OPENCODE_LOG_REGEX.is_match(line) || LogUtils::is_error_line(line))
            })
            .boxed();

        // Process log lines, which contain error messages. We now source session ID
        // from the oc-share stream instead of stderr.
        tokio::spawn(Self::process_opencode_log_lines(
            log_lines,
            msg_store.clone(),
            entry_index_counter.clone(),
            worktree_path.to_path_buf(),
        ));

        // Also parse share events from stdout
        let share_events = msg_store
            .stdout_lines_stream()
            .filter_map(|res| ready(res.ok()))
            .filter(|line| ready(line.starts_with(Opencode::SHARE_PREFIX)))
            .map(|line| line[Opencode::SHARE_PREFIX.len()..].to_string())
            .boxed();
        tokio::spawn(Self::process_share_events(
            share_events,
            worktree_path.to_path_buf(),
            entry_index_counter.clone(),
            msg_store.clone(),
        ));
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        #[cfg(unix)]
        {
            xdg::BaseDirectories::with_prefix("opencode").get_config_file("opencode.json")
        }
        #[cfg(not(unix))]
        {
            dirs::config_dir().map(|config| config.join("opencode").join("opencode.json"))
        }
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::config_dir()
            .map(|config| config.join("opencode").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}
impl Opencode {
    const SHARE_PREFIX: &'static str = "[oc-share] ";
    async fn process_opencode_log_lines(
        mut log_lines: BoxStream<'_, String>,
        msg_store: Arc<MsgStore>,
        entry_index_counter: EntryIndexProvider,
        _worktree_path: PathBuf,
    ) {
        while let Some(line) = log_lines.next().await {
            if line.starts_with("ERROR") || LogUtils::is_error_line(&line) {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage {
                        error_type: NormalizedEntryError::Other,
                    },
                    content: line.clone(),
                    metadata: None,
                };

                // Create a patch for this single entry
                let patch = crate::logs::utils::ConversationPatch::add_normalized_entry(
                    entry_index_counter.next(),
                    entry,
                );
                msg_store.push_patch(patch);
            }
        }
    }
}

impl Opencode {
    /// Parse share events and emit normalized patches
    async fn process_share_events(
        mut lines: BoxStream<'_, String>,
        worktree_path: PathBuf,
        entry_index_counter: EntryIndexProvider,
        msg_store: Arc<MsgStore>,
    ) {
        use std::collections::HashMap;

        use serde::Deserialize;

        use crate::logs::utils::ConversationPatch;

        #[derive(Debug, Clone, Deserialize)]
        #[allow(dead_code)]
        struct TimeObj {
            #[serde(default)]
            start: Option<i64>,
            #[serde(default)]
            end: Option<i64>,
        }

        // Tool input/state structures are defined at module level (OcToolInput/OcToolState)

        #[derive(Debug, Clone, Deserialize)]
        #[serde(tag = "type", rename_all = "lowercase")]
        #[allow(clippy::large_enum_variant)]
        #[allow(dead_code)]
        enum ShareContent {
            Text {
                id: String,
                #[serde(rename = "messageID")]
                message_id: String,
                #[serde(rename = "sessionID")]
                session_id: String,
                #[serde(default)]
                text: Option<String>,
                #[serde(default)]
                time: Option<TimeObj>,
            },
            Tool {
                id: String,
                #[serde(rename = "messageID")]
                message_id: String,
                #[serde(rename = "sessionID")]
                session_id: String,
                #[serde(rename = "callID", default)]
                call_id: Option<String>,
                tool: String,
                #[serde(default)]
                state: Box<Option<OcToolState>>,
            },
        }

        #[derive(Debug, Clone, Deserialize)]
        #[allow(dead_code)]
        struct ShareSyncEnvelope {
            #[serde(rename = "sessionID")]
            session_id: String,
            secret: String,
            key: String,
            content: serde_json::Value,
        }

        let mut index_by_part: HashMap<String, usize> = HashMap::new();
        // For text aggregation across parts under the same message (scoped by session)
        // Key format: "{sessionID}:{messageID}"
        let mut index_by_message: HashMap<String, usize> = HashMap::new();
        let mut message_parts_order: HashMap<String, Vec<String>> = HashMap::new();
        let mut message_part_texts: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut message_aggregated: HashMap<String, String> = HashMap::new();
        // Segment tracking per message to force splits after tool events
        // base_key = "{sessionID}:{messageID}", seg_key = "{base_key}#<n>"
        let mut message_segment: HashMap<String, usize> = HashMap::new();
        let mut message_pending_break: HashMap<String, bool> = HashMap::new();
        let mut message_roles: HashMap<String, String> = HashMap::new();
        let mut session_id_set = false;

        use std::collections::hash_map::Entry;
        let mut upsert_by_part = |entry: NormalizedEntry, part_id: String| {
            let (idx, is_new) = match index_by_part.entry(part_id) {
                Entry::Occupied(o) => (*o.get(), false),
                Entry::Vacant(v) => {
                    let i = entry_index_counter.next();
                    v.insert(i);
                    (i, true)
                }
            };
            if is_new {
                ConversationPatch::add_normalized_entry(idx, entry)
            } else {
                ConversationPatch::replace(idx, entry)
            }
        };

        while let Some(line) = lines.next().await {
            let Ok(env) = serde_json::from_str::<ShareSyncEnvelope>(&line) else {
                continue;
            };
            // Record session id once from stream
            if !session_id_set {
                msg_store.push_session_id(env.session_id.clone());
                session_id_set = true;
            }

            // Capture message role metadata from session/message events
            if env.key.starts_with("session/message/") {
                #[derive(Deserialize)]
                struct MessageMeta {
                    id: String,
                    #[serde(default)]
                    role: Option<String>,
                }
                if let Ok(meta) = serde_json::from_value::<MessageMeta>(env.content.clone())
                    && let Some(role) = meta.role
                {
                    message_roles.insert(meta.id.clone(), role.clone());

                    // If we have aggregated text already for this message, create or update the entry now
                    let base_key = format!("{}:{}", env.session_id, meta.id);
                    let seg = *message_segment.get(&base_key).unwrap_or(&0);
                    let seg_key = format!("{base_key}#{seg}");
                    if let Some(content) = message_aggregated.get(&seg_key).cloned() {
                        // Skip emitting user role messages entirely
                        if role == "user" {
                            // Do not emit user text messages
                        } else {
                            let entry_type = match role.as_str() {
                                "system" => NormalizedEntryType::SystemMessage,
                                _ => NormalizedEntryType::AssistantMessage,
                            };
                            use std::collections::hash_map::Entry as HmEntry;
                            match index_by_message.entry(seg_key) {
                                HmEntry::Occupied(o) => {
                                    let idx = *o.get();
                                    let entry = NormalizedEntry {
                                        timestamp: None,
                                        entry_type,
                                        content,
                                        metadata: None,
                                    };
                                    msg_store.push_patch(ConversationPatch::replace(idx, entry));
                                }
                                HmEntry::Vacant(v) => {
                                    let idx = entry_index_counter.next();
                                    v.insert(idx);
                                    let entry = NormalizedEntry {
                                        timestamp: None,
                                        entry_type,
                                        content,
                                        metadata: None,
                                    };
                                    msg_store.push_patch(ConversationPatch::add_normalized_entry(
                                        idx, entry,
                                    ));
                                }
                            }
                        }
                    }
                }
                continue;
            }

            if !env.key.starts_with("session/part/") {
                continue;
            }

            match serde_json::from_value::<ShareContent>(env.content.clone()) {
                Ok(ShareContent::Text {
                    id,
                    message_id,
                    text,
                    ..
                }) => {
                    let text = text.unwrap_or_default();
                    // Scope aggregation by sessionID and segment to avoid cross-session and enforce breaks
                    let base_key = format!("{}:{}", env.session_id, message_id);
                    if message_pending_break.remove(&base_key).unwrap_or(false) {
                        let e = message_segment.entry(base_key.clone()).or_insert(0);
                        *e += 1;
                    }
                    let seg = *message_segment.get(&base_key).unwrap_or(&0);
                    let msg_key = format!("{base_key}#{seg}");

                    // Track parts order for this message
                    let parts_order = message_parts_order.entry(msg_key.clone()).or_default();
                    if !parts_order.iter().any(|p| p == &id) {
                        parts_order.push(id.clone());
                    }

                    // Update latest text for this part under the message
                    let part_texts = message_part_texts.entry(msg_key.clone()).or_default();
                    part_texts.insert(id.clone(), text);

                    // Rebuild aggregated message text by concatenating parts in stable order
                    let aggregated = parts_order
                        .iter()
                        .filter_map(|pid| part_texts.get(pid))
                        .cloned()
                        .collect::<Vec<_>>()
                        .join("");
                    message_aggregated.insert(msg_key.clone(), aggregated.clone());

                    // Determine role; if unknown yet, wait until message metadata arrives.
                    match message_roles.get(&message_id).map(|s| s.as_str()) {
                        Some("user") => {
                            // Do not emit user text messages
                        }
                        Some(role) => {
                            // Upsert by message id to keep a single entry per message
                            let (idx, is_new) = match index_by_message.entry(msg_key) {
                                Entry::Occupied(o) => (*o.get(), false),
                                Entry::Vacant(v) => {
                                    let i = entry_index_counter.next();
                                    v.insert(i);
                                    (i, true)
                                }
                            };
                            let entry_type = match role {
                                "system" => NormalizedEntryType::SystemMessage,
                                _ => NormalizedEntryType::AssistantMessage,
                            };
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type,
                                content: aggregated,
                                metadata: None,
                            };
                            let patch = if is_new {
                                ConversationPatch::add_normalized_entry(idx, entry)
                            } else {
                                ConversationPatch::replace(idx, entry)
                            };
                            msg_store.push_patch(patch);
                        }
                        None => {
                            // Role unknown; accumulate but don't emit yet
                        }
                    }
                }
                Ok(ShareContent::Tool {
                    id,
                    tool,
                    state,
                    message_id,
                    ..
                }) => {
                    // If there is pending text in the current segment, mark to break before next text
                    let base_key = format!("{}:{}", env.session_id, message_id);
                    let seg = *message_segment.get(&base_key).unwrap_or(&0);
                    let seg_key = format!("{base_key}#{seg}");
                    if message_aggregated
                        .get(&seg_key)
                        .map(|s| !s.is_empty())
                        .unwrap_or(false)
                    {
                        message_pending_break.insert(base_key.clone(), true);
                    }
                    let state = (*state).unwrap_or_default();
                    let status = state.status.as_deref().unwrap_or("");

                    let exit_status = state
                        .metadata
                        .as_ref()
                        .and_then(|m| m.exit)
                        .map(|code| crate::logs::CommandExitStatus::ExitCode { code });

                    let (result, mut content_text) = match status {
                        "completed" => {
                            let output = state.output.as_deref().unwrap_or("");
                            let title = state.title.as_deref().unwrap_or("");
                            let header = if title.is_empty() {
                                format!("{tool} completed")
                            } else {
                                format!("{tool}: {title}")
                            };
                            (
                                Some(crate::logs::ToolResult {
                                    r#type: crate::logs::ToolResultValueType::Markdown,
                                    value: serde_json::Value::String(output.to_string()),
                                }),
                                format!("{header}\n"),
                            )
                        }
                        "error" => {
                            let err = state
                                .metadata
                                .as_ref()
                                .and_then(|m| m.description.as_deref())
                                .unwrap_or("");
                            (
                                Some(crate::logs::ToolResult {
                                    r#type: crate::logs::ToolResultValueType::Markdown,
                                    value: serde_json::Value::String(format!("Error: {err}")),
                                }),
                                format!("{tool} error: {err}\n"),
                            )
                        }
                        "running" => (None, format!("{tool} started\n")),
                        _ => (None, String::new()),
                    };

                    // Compute concise normalized summary for known tools using a typed mapping
                    let worktree = worktree_path.to_string_lossy();
                    #[derive(Deserialize)]
                    #[serde(tag = "tool", rename_all = "lowercase")]
                    #[allow(dead_code)]
                    enum TypedTool {
                        #[serde(rename = "read")]
                        Read {
                            #[serde(default)]
                            input: OcToolInput,
                        },
                        #[serde(rename = "list")]
                        List {
                            #[serde(default)]
                            input: OcToolInput,
                        },
                        #[serde(rename = "grep")]
                        Grep {
                            #[serde(default)]
                            input: OcToolInput,
                        },
                        #[serde(rename = "glob")]
                        Glob {
                            #[serde(default)]
                            input: OcToolInput,
                        },
                        #[serde(rename = "webfetch")]
                        Webfetch {
                            #[serde(default)]
                            input: OcToolInput,
                        },
                        #[serde(other)]
                        Other,
                    }
                    if let Ok(v) = serde_json::to_value(&state.input).and_then(|input| {
                        serde_json::from_value::<TypedTool>(serde_json::json!({
                            "tool": tool,
                            "input": input
                        }))
                    }) {
                        match v {
                            TypedTool::Read { input } => {
                                let p = input.file_path.as_deref().unwrap_or("");
                                content_text = format!("`{}`", make_path_relative(p, &worktree));
                            }
                            TypedTool::List { input } => {
                                let p = input.path.as_deref().unwrap_or(".");
                                content_text = format!(
                                    "List directory: `{}`",
                                    make_path_relative(p, &worktree)
                                );
                            }
                            TypedTool::Grep { input } => {
                                let pat = input.pattern.as_deref().unwrap_or("");
                                let p = input.path.as_deref().unwrap_or(".");
                                let rel = make_path_relative(p, &worktree);
                                if let Some(inc) = input.include.as_deref() {
                                    content_text = format!("`{pat}` in `{rel}` ({inc})");
                                } else {
                                    content_text = format!("`{pat}` in `{rel}`");
                                }
                            }
                            TypedTool::Glob { input } => {
                                let pat = input.pattern.as_deref().unwrap_or("");
                                let p = input.path.as_deref().unwrap_or(".");
                                let rel = make_path_relative(p, &worktree);
                                content_text = format!("glob `{pat}` in `{rel}`");
                            }
                            TypedTool::Webfetch { input } => {
                                let url = input.url.as_deref().unwrap_or("");
                                content_text = format!("fetch `{url}`");
                            }
                            TypedTool::Other => {}
                        }
                    }

                    // Prepare normalized arguments for potential Tool action (fallback only)
                    let args_json = if let Some(input) = state.input.as_ref() {
                        let mut map = serde_json::Map::new();
                        if let Some(p) = input.file_path.as_deref() {
                            map.insert(
                                "filePath".into(),
                                serde_json::Value::String(make_path_relative(
                                    p,
                                    &worktree_path.to_string_lossy(),
                                )),
                            );
                        }
                        if let Some(p) = input.path.as_deref() {
                            map.insert(
                                "path".into(),
                                serde_json::Value::String(make_path_relative(
                                    p,
                                    &worktree_path.to_string_lossy(),
                                )),
                            );
                        }
                        if let Some(v) = input.include.as_ref() {
                            map.insert("include".into(), serde_json::Value::String(v.clone()));
                        }
                        if let Some(v) = input.pattern.as_ref() {
                            map.insert("pattern".into(), serde_json::Value::String(v.clone()));
                        }
                        if let Some(v) = input.command.as_ref() {
                            map.insert("command".into(), serde_json::Value::String(v.clone()));
                        }
                        if let Some(v) = input.description.as_ref() {
                            map.insert("description".into(), serde_json::Value::String(v.clone()));
                        }
                        if let Some(v) = input.url.as_ref() {
                            map.insert("url".into(), serde_json::Value::String(v.clone()));
                        }
                        if let Some(v) = input.format.as_ref() {
                            map.insert("format".into(), serde_json::Value::String(v.clone()));
                        }
                        if let Some(v) = input.timeout.as_ref() {
                            map.insert("timeout".into(), serde_json::Value::from(*v));
                        }
                        serde_json::Value::Object(map)
                    } else {
                        serde_json::Value::Null
                    };

                    // Derive ActionType and attach command results if applicable
                    let action_type = Self::derive_action_type(&tool, &state, &worktree_path);
                    let resolved_action_type = match action_type {
                        Some(mut at) => match (&mut at, &result) {
                            (ActionType::CommandRun { result: r, .. }, Some(res)) => {
                                *r = Some(crate::logs::CommandRunResult {
                                    exit_status: exit_status.clone(),
                                    output: res.value.as_str().map(|s| s.to_owned()),
                                });
                                at
                            }
                            _ => at,
                        },
                        None => ActionType::Tool {
                            tool_name: tool.clone(),
                            arguments: Some(args_json.clone()),
                            result: result.clone(),
                        },
                    };

                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ToolUse {
                            tool_name: tool.clone(),
                            action_type: resolved_action_type,
                            status: ToolStatus::Success,
                        },
                        content: content_text,
                        metadata: None,
                    };

                    let patch = upsert_by_part(entry, id);
                    msg_store.push_patch(patch);
                }
                Err(_) => {}
            }
        }
    }

    /// Map tool name and state to a rich ActionType used by frontend renderers.
    fn derive_action_type(
        tool_name: &str,
        state: &OcToolState,
        worktree_path: &Path,
    ) -> Option<ActionType> {
        // Deserialize "tool" + typed input into a tagged enum to avoid stringly logic
        #[derive(Deserialize)]
        #[serde(tag = "tool", rename_all = "lowercase")]
        #[allow(dead_code)]
        enum ActionTool {
            Read {
                input: OcToolInput,
            },
            Write {
                input: OcToolInput,
            },
            Edit {
                input: OcToolInput,
            },
            Bash {
                input: OcToolInput,
            },
            Grep {
                input: OcToolInput,
            },
            Glob {
                input: OcToolInput,
            },
            Webfetch {
                input: OcToolInput,
            },
            Task {
                input: OcToolInput,
            },
            Todowrite {
                input: OcToolInput,
            },
            Todoread,
            List {
                input: OcToolInput,
            },
            #[serde(other)]
            Other,
        }

        let input_json = serde_json::to_value(state.input.clone().unwrap_or_default())
            .unwrap_or(serde_json::Value::Null);
        let v = serde_json::json!({ "tool": tool_name, "input": input_json });
        let parsed: ActionTool = serde_json::from_value(v).unwrap_or(ActionTool::Other);
        match parsed {
            ActionTool::Read { input } => {
                let path = input.file_path.as_deref().unwrap_or("");
                Some(ActionType::FileRead {
                    path: make_path_relative(path, &worktree_path.to_string_lossy()),
                })
            }
            ActionTool::Write { input } => {
                let path = input.file_path.as_deref().unwrap_or("");
                let content = input.content.unwrap_or_default();
                Some(ActionType::FileEdit {
                    path: make_path_relative(path, &worktree_path.to_string_lossy()),
                    changes: vec![FileChange::Write { content }],
                })
            }
            ActionTool::Edit { input } => {
                let path = input.file_path.as_deref().unwrap_or("");
                let diff = state
                    .metadata
                    .as_ref()
                    .and_then(|m| m.diff.as_deref())
                    .unwrap_or("");
                if diff.is_empty() {
                    return None;
                }
                Some(ActionType::FileEdit {
                    path: make_path_relative(path, &worktree_path.to_string_lossy()),
                    changes: vec![FileChange::Edit {
                        unified_diff: diff.to_string(),
                        has_line_numbers: false,
                    }],
                })
            }
            ActionTool::Bash { input } => {
                let command = input.command.unwrap_or_default();
                Some(ActionType::CommandRun {
                    command,
                    result: None,
                })
            }
            ActionTool::Grep { input } => {
                let query = input.pattern.unwrap_or_default();
                Some(ActionType::Search { query })
            }
            ActionTool::Glob { input } => {
                let query = input.pattern.unwrap_or_default();
                Some(ActionType::Search { query })
            }
            ActionTool::Webfetch { input } => {
                let url = input.url.unwrap_or_default();
                Some(ActionType::WebFetch { url })
            }
            ActionTool::Todowrite { input } => {
                let todos = input
                    .todos
                    .unwrap_or_default()
                    .into_iter()
                    .map(|t| TodoItem {
                        content: t.content,
                        status: t.status,
                        priority: t.priority,
                    })
                    .collect::<Vec<_>>();
                Some(ActionType::TodoManagement {
                    todos,
                    operation: "write".into(),
                })
            }
            ActionTool::Todoread => Some(ActionType::TodoManagement {
                todos: vec![],
                operation: "read".into(),
            }),
            ActionTool::List { .. } | ActionTool::Task { .. } | ActionTool::Other => None,
        }
    }
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/// TODO information structure
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct TodoInfo {
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

// =============================================================================
// Log interpretation UTILITIES
// =============================================================================

// Accurate regex for OpenCode log lines: LEVEL timestamp +ms ...
static OPENCODE_LOG_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(INFO|DEBUG|WARN|ERROR)\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s+\+\d+\s*ms.*")
        .unwrap()
});

/// Log utilities for OpenCode processing
pub struct LogUtils;

impl LogUtils {
    pub fn is_error_line(line: &str) -> bool {
        line.starts_with("!  ")
    }
}
