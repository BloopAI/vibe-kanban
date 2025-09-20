mod session;
use self::session::{
    append_session_event_json,
    build_local_resume_prompt,
    fork_session_file,
    v_with_type,
};

use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use ts_rs::TS;
use utils::{msg_store::MsgStore, shell::get_shell_command};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{AppendPrompt, ExecutorError, StandardCodingAgentExecutor},
    logs::{
        ActionType,
        NormalizedEntry,
        NormalizedEntryType,
        stderr_processor::normalize_stderr_logs,
        utils::EntryIndexProvider,
        ToolResult,
        ToolResultValueType,
    },
};
use agent_client_protocol::Agent as _;
use tokio::sync::mpsc;
use std::collections::HashMap;

// Lightweight reusable harness that exposes Gemini's ACP flow to other executors (e.g., Qwen)
pub struct AcpAgentHarness;

impl AcpAgentHarness {
    pub fn new() -> Self {
        Self
    }

    pub async fn spawn_with_command(
        &self,
        current_dir: &Path,
        prompt: String,
        full_command: String,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(full_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command.group_spawn()?;

        // Reuse Gemini's ACP bootstrapper and stdout bridge
        Gemini::bootstrap_acp_connection(&mut child, current_dir.to_path_buf(), None, prompt).await?;

        Ok(child)
    }

    pub async fn spawn_follow_up_with_command(
        &self,
        current_dir: &Path,
        prompt: String,
        session_id: &str,
        full_command: String,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(full_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command.group_spawn()?;

        Gemini::bootstrap_acp_connection(
            &mut child,
            current_dir.to_path_buf(),
            Some(session_id.to_string()),
            prompt,
        )
        .await?;

        Ok(child)
    }

    pub fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        Gemini::normalize_logs_acp(msg_store, worktree_path.to_path_buf());
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Gemini {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    pub model: GeminiModel,
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

        // Always use ACP
        builder = builder.extend_params(["--experimental-acp"]);

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Gemini {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let harness = AcpAgentHarness::new();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let gemini_command = self.build_command_builder().build_initial();
        harness
            .spawn_with_command(current_dir, combined_prompt, gemini_command)
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        _session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let harness = AcpAgentHarness::new();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let gemini_command = self.build_command_builder().build_follow_up(&[]);
        harness
            .spawn_follow_up_with_command(current_dir, combined_prompt, _session_id, gemini_command)
            .await
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
    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        let harness = AcpAgentHarness::new();
        harness.normalize_logs(msg_store, worktree_path);
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".gemini").join("settings.json"))
    }
}

impl Gemini {
    // =========================
    // ACP (Agent Client Protocol) integration
    // =========================

    // removed legacy non-harness spawn helpers

    async fn bootstrap_acp_connection(
        child: &mut AsyncGroupChild,
        cwd: PathBuf,
        existing_session: Option<String>,
        prompt: String,
    ) -> Result<(), ExecutorError> {
        // Take child's stdio for ACP wiring and replace stdout so container can still stream
        let orig_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Child process has no stdout",
            ))
        })?;
        let orig_stdin = child.inner().stdin.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Child process has no stdin",
            ))
        })?;

        // Create replacement pipe and set as new child stdout (to be read by container)
        let (pipe_reader, pipe_writer) = os_pipe::pipe().map_err(|e| {
            ExecutorError::Io(std::io::Error::other(format!(
                "Failed to create pipe for ACP stdout tee: {e}"
            )))
        })?;
        child.inner().stdout = Some(Self::wrap_fd_as_child_stdout(pipe_reader)?);

        // Tokio writer for replacement child stdout and output appender
        let writer = Self::wrap_fd_as_tokio_writer(pipe_writer)?;
        let shared_writer = std::sync::Arc::new(tokio::sync::Mutex::new(writer));
        let (app_tx, mut app_rx) = mpsc::unbounded_channel::<String>();
        {
            let shared_writer = shared_writer.clone();
            tokio::spawn(async move {
                while let Some(line) = app_rx.recv().await {
                    let mut data = line.into_bytes();
                    data.push(b'\n');
                    let mut w = shared_writer.lock().await;
                    let _ = w.write_all(&data).await;
                }
            });
        }

        // Prepare a duplex for feeding bytes into the ACP client as its incoming stream
        let (mut to_acp_writer, acp_incoming_reader) = tokio::io::duplex(64 * 1024);

        // Forward original stdout bytes only to the ACP incoming pipe (do not leak JSON-RPC to UI)
        {
            tokio::spawn(async move {
                let mut stdout_stream = tokio_util::io::ReaderStream::new(orig_stdout);
                while let Some(res) = stdout_stream.next().await {
                    match res {
                        Ok(data) => {
                            // Feed JSON-RPC bytes to ACP incoming
                            let _ = to_acp_writer.write_all(&data).await;
                        }
                        Err(_err) => {
                            break;
                        }
                    }
                }
            });
        }

        // Appender (lines) to child's stdout is ready

        // Build and run ACP client in a LocalSet (non-Send futures)
        let outgoing = orig_stdin.compat_write();
        let incoming = acp_incoming_reader.compat();

        tokio::task::spawn_blocking(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("build current_thread runtime");
            rt.block_on(async move {
                let local = tokio::task::LocalSet::new();
                local
                    .run_until(async move {
                    // Client implementation that proxies FS operations into cwd and forwards notifications to stdout
                    let client = AcpClient::new(cwd.clone(), app_tx.clone());
                    let (conn, io_fut) = agent_client_protocol::ClientSideConnection::new(
                        client,
                        outgoing,
                        incoming,
                        |fut| {
                            tokio::task::spawn_local(fut);
                        },
                    );
                    // Drive I/O
                    tokio::task::spawn_local(async move {
                        let _ = io_fut.await;
                    });

                    // Initialize and authenticate (best-effort)
                    let _ = conn
                        .initialize(agent_client_protocol::InitializeRequest {
                            protocol_version: agent_client_protocol::V1,
                            client_capabilities: agent_client_protocol::ClientCapabilities {
                                fs: agent_client_protocol::FileSystemCapability {
                                    read_text_file: true,
                                    write_text_file: true,
                                    meta: None,
                                },
                                terminal: false,
                                meta: None,
                            },
                            meta: None,
                        })
                        .await;

                    // Try auth with personal OAuth if needed; ignore errors
                    let _ = conn
                        .authenticate(agent_client_protocol::AuthenticateRequest {
                            method_id: agent_client_protocol::AuthMethodId(
                                "oauth-personal".into(),
                            ),
                            meta: None,
                        })
                        .await;

                    // Resolve ACP session id and prompt to send
                    let mut acp_session_id: Option<String> = None;
                    let mut display_session_id: Option<String> = None;
                    let mut prompt_to_send = prompt.clone();

                    if let Some(existing) = existing_session.clone() {
                        // Always fork: create a new UI session id, copy transcript, start fresh ACP session, and send resume prompt
                        let new_ui_id = uuid::Uuid::new_v4().to_string();
                        let _ = fork_session_file("gemini_sessions", &existing, &new_ui_id);
                        match conn
                            .new_session(agent_client_protocol::NewSessionRequest {
                                mcp_servers: vec![],
                                cwd: cwd.clone(),
                                meta: None,
                            })
                            .await
                        {
                            Ok(resp) => {
                                acp_session_id = Some(resp.session_id.0.to_string());
                                display_session_id = Some(new_ui_id.clone());
                                if let Some(resume_prompt) = build_local_resume_prompt("gemini_sessions", &new_ui_id) {
                                    prompt_to_send = resume_prompt + "\n\nNow continue with:\n" + &prompt;
                                }
                            }
                            Err(_) => {
                                let _ = app_tx.send("[acp-error] failed to create session".to_string());
                                return;
                            }
                        }
                    } else {
                        // Initial turn: create new session
                        match conn
                            .new_session(agent_client_protocol::NewSessionRequest {
                                mcp_servers: vec![],
                                cwd: cwd.clone(),
                                meta: None,
                            })
                            .await
                        {
                            Ok(resp) => {
                                let sid = resp.session_id.0.to_string();
                                acp_session_id = Some(sid.clone());
                                display_session_id = Some(sid);
                            }
                            Err(_) => {
                                let _ = app_tx.send("[acp-error] failed to create session".to_string());
                                return;
                            }
                        }
                    }

                    let session_id_for_ui = display_session_id.expect("session id for ui");

                    // Emit session id for UI follow-ups
                    let _ = app_tx.send(format!("[acp-session] {}", session_id_for_ui));
                    // Emit user prompt marker for persistence (no UI entry)
                    let _ = app_tx.send(format!(
                        "[acp-user] {}",
                        serde_json::json!({"text": prompt}).to_string()
                    ));

                    // Send the prompt to ACP
                    if let Some(acp_sid) = acp_session_id {
                        let _ = conn
                            .prompt(agent_client_protocol::PromptRequest {
                                session_id: agent_client_protocol::SessionId(acp_sid.into()),
                                prompt: vec![agent_client_protocol::TextContent { annotations: None, text: prompt_to_send, meta: None }]
                                    .into_iter()
                                    .map(agent_client_protocol::ContentBlock::Text)
                                    .collect(),
                                meta: None,
                            })
                            .await;
                    }

                    // Done; signal end
                    let _ = app_tx.send("[acp-done]".to_string());
                    })
                    .await;
            });
        });

        Ok(())
    }

    fn normalize_logs_acp(msg_store: Arc<MsgStore>, _worktree_path: PathBuf) {
        // Universal stderr normalization
        let entry_index_counter = EntryIndexProvider::start_from(&msg_store);
        normalize_stderr_logs(msg_store.clone(), entry_index_counter.clone());

        // Parse stdout lines we append from ACP client
        tokio::spawn(async move {
            use crate::logs::utils::ConversationPatch;
            let mut stdout_lines = msg_store.stdout_lines_stream();

            // Each ACP event becomes its own UI entry; no index reuse
            let mut current_session_id: Option<String> = None;

            // Accumulators for clean JSONL persistence per turn
            #[derive(Debug, Clone, PartialEq, Eq, Hash)]
            enum EventKey {
                AssistantText,
                AssistantThought,
                Plan,
                Tool(String),
            }
            let mut seen_order: Vec<EventKey> = Vec::new();
            let mut last_assistant_text: Option<String> = None;
            let mut last_thought_text: Option<String> = None;
            let mut last_plan: Option<Vec<String>> = None;
            let mut tool_last_payload: HashMap<String, serde_json::Value> = HashMap::new();

            while let Some(Ok(line)) = stdout_lines.next().await {
                if let Some(sess) = line.strip_prefix("[acp-session] ") {
                    let sid = sess.trim().to_string();
                    msg_store.push_session_id(sid.clone());
                    current_session_id = Some(sid);
                    continue;
                }
                if let Some(err) = line.strip_prefix("[acp-error] ") {
                    let idx = entry_index_counter.next();
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ErrorMessage,
                        content: err.to_string(),
                        metadata: None,
                    };
                    msg_store.push_patch(ConversationPatch::add_normalized_entry(idx, entry));
                    continue;
                }
                if line.trim() == "[acp-done]" {
                    // Flush final entries in first-seen order
                    if let Some(sid) = current_session_id.clone() {
                        for key in &seen_order {
                            match key {
                                EventKey::AssistantThought => {
                                    if let Some(txt) = &last_thought_text {
                                        let _ = append_session_event_json(
                                            "gemini_sessions",
                                            &sid,
                                            &serde_json::json!({"type":"assistant_thought","text": txt}),
                                        );
                                    }
                                }
                                EventKey::Plan => {
                                    if let Some(steps) = &last_plan {
                                        let _ = append_session_event_json(
                                            "gemini_sessions",
                                            &sid,
                                            &serde_json::json!({"type":"plan","entries": steps}),
                                        );
                                    }
                                }
                                EventKey::AssistantText => {
                                    if let Some(txt) = &last_assistant_text {
                                        let _ = append_session_event_json(
                                            "gemini_sessions",
                                            &sid,
                                            &serde_json::json!({"type":"assistant_text","text": txt}),
                                        );
                                    }
                                }
                                EventKey::Tool(tid) => {
                                    if let Some(payload) = tool_last_payload.get(tid) {
                                        let _ = append_session_event_json("gemini_sessions", &sid, payload);
                                    }
                                }
                            }
                        }
                    }
                    // Reset for potential further turns
                    seen_order.clear();
                    last_assistant_text = None;
                    last_thought_text = None;
                    last_plan = None;
                    tool_last_payload.clear();
                    continue;
                }
                if let Some(user_json) = line.strip_prefix("[acp-user] ") {
                    // Persist user message but do not emit a UI entry to avoid duplication
                    if let Some(sid) = current_session_id.clone() {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(user_json) {
                            let _ = append_session_event_json("gemini_sessions", &sid, &v_with_type("user", v));
                        }
                    }
                    continue;
                }
                if let Some(json) = line.strip_prefix("[acp] ") {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(json) {
                        let typ = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match typ {
                            "agent_text" => {
                                if let Some(t) = v.get("text").and_then(|x| x.as_str()) {
                                    // UI: add a new AssistantMessage entry per event
                                    let idx = entry_index_counter.next();
                                    let entry = NormalizedEntry {
                                        timestamp: None,
                                        entry_type: NormalizedEntryType::AssistantMessage,
                                        content: t.to_string(),
                                        metadata: None,
                                    };
                                    msg_store.push_patch(ConversationPatch::add_normalized_entry(idx, entry));

                                    // Persistence accumulator: build final assistant text for JSONL flush
                                    if last_assistant_text.is_none() {
                                        seen_order.push(EventKey::AssistantText);
                                        last_assistant_text = Some(String::new());
                                    }
                                    if let Some(buf) = &mut last_assistant_text {
                                        buf.push_str(t);
                                    }
                                }
                            }
                            "agent_thought" => {
                                if let Some(t) = v.get("text").and_then(|x| x.as_str()) {
                                    // UI: add a new Thinking entry per event
                                    let idx = entry_index_counter.next();
                                    let entry = NormalizedEntry {
                                        timestamp: None,
                                        entry_type: NormalizedEntryType::Thinking,
                                        content: t.to_string(),
                                        metadata: None,
                                    };
                                    msg_store.push_patch(ConversationPatch::add_normalized_entry(idx, entry));

                                    // Persistence accumulator
                                    if last_thought_text.is_none() {
                                        seen_order.push(EventKey::AssistantThought);
                                        last_thought_text = Some(String::new());
                                    }
                                    if let Some(buf) = &mut last_thought_text {
                                        buf.push_str(t);
                                    }
                                }
                            }
                            "tool_call" | "tool_update" => {
                                if let Some(id) = v.get("id").and_then(|x| x.as_str()) {
                                    let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("");
                                    let raw_input = v.get("raw_input").cloned();
                                    let raw_output = v.get("raw_output").cloned();
                                    let (tool_name, action) = map_tool_from_json(title, raw_input.clone(), raw_output.clone());
                                    // UI: add a new ToolUse entry per event
                                    let idx = entry_index_counter.next();
                                    let entry = NormalizedEntry {
                                        timestamp: None,
                                        entry_type: NormalizedEntryType::ToolUse { tool_name, action_type: action },
                                        content: title.to_string(),
                                        metadata: None,
                                    };
                                    msg_store.push_patch(ConversationPatch::add_normalized_entry(idx, entry));
                                    // Accumulate final tool payload
                                    let mut payload = serde_json::Map::new();
                                    payload.insert("type".into(), serde_json::Value::String("tool_call".into()));
                                    payload.insert("id".into(), serde_json::Value::String(id.to_string()));
                                    payload.insert("title".into(), serde_json::Value::String(title.to_string()));
                                    if let Some(ri) = raw_input { payload.insert("raw_input".into(), ri); }
                                    if let Some(ro) = raw_output { payload.insert("raw_output".into(), ro); }
                                    if !seen_order.iter().any(|k| matches!(k, EventKey::Tool(tid) if tid == id)) {
                                        seen_order.push(EventKey::Tool(id.to_string()));
                                    }
                                    tool_last_payload.insert(id.to_string(), serde_json::Value::Object(payload));
                                }
                            }
                            "plan" => {
                                let idx = entry_index_counter.next();
                                let steps: Vec<String> = v
                                    .get("entries")
                                    .and_then(|e| e.as_array())
                                    .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                                    .unwrap_or_default();
                                let mut body = String::from("Plan:\n");
                                for (i, step) in steps.iter().enumerate() {
                                    body.push_str(&format!("{}. {}\n", i + 1, step));
                                }
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::SystemMessage,
                                    content: body,
                                    metadata: None,
                                };
                                msg_store.push_patch(ConversationPatch::add_normalized_entry(idx, entry));
                                if last_plan.is_none() { seen_order.push(EventKey::Plan); }
                                last_plan = Some(steps);
                            }
                            _ => {}
                        }
                    }
                }
            }
        });
    }

    // OS fd helpers duplicated from stdout_dup
    fn wrap_fd_as_child_stdout(
        pipe_reader: os_pipe::PipeReader,
    ) -> Result<tokio::process::ChildStdout, ExecutorError> {
        #[cfg(unix)]
        {
            use std::os::unix::io::{FromRawFd, IntoRawFd, OwnedFd};
            let raw_fd = pipe_reader.into_raw_fd();
            let owned_fd = unsafe { OwnedFd::from_raw_fd(raw_fd) };
            let std_stdout = std::process::ChildStdout::from(owned_fd);
            tokio::process::ChildStdout::from_std(std_stdout).map_err(ExecutorError::Io)
        }
        #[cfg(windows)]
        {
            use std::os::windows::io::{FromRawHandle, IntoRawHandle, OwnedHandle};
            let raw_handle = pipe_reader.into_raw_handle();
            let owned_handle = unsafe { OwnedHandle::from_raw_handle(raw_handle) };
            let std_stdout = std::process::ChildStdout::from(owned_handle);
            tokio::process::ChildStdout::from_std(std_stdout).map_err(ExecutorError::Io)
        }
    }

    fn wrap_fd_as_tokio_writer(
        pipe_writer: os_pipe::PipeWriter,
    ) -> Result<impl tokio::io::AsyncWrite, ExecutorError> {
        #[cfg(unix)]
        {
            use std::os::unix::io::{FromRawFd, IntoRawFd, OwnedFd};
            let raw_fd = pipe_writer.into_raw_fd();
            let owned_fd = unsafe { OwnedFd::from_raw_fd(raw_fd) };
            let std_file = std::fs::File::from(owned_fd);
            Ok(tokio::fs::File::from_std(std_file))
        }
        #[cfg(windows)]
        {
            use std::os::windows::io::{FromRawHandle, IntoRawHandle, OwnedHandle};
            let raw_handle = pipe_writer.into_raw_handle();
            let owned_handle = unsafe { OwnedHandle::from_raw_handle(raw_handle) };
            let std_file = std::fs::File::from(owned_handle);
            Ok(tokio::fs::File::from_std(std_file))
        }
    }

    // =========================
    // Existing Gemini helpers
    // =========================
    // removed legacy non-ACP helpers
}

// =========================
// ACP stdout client
// =========================

struct AcpClient {
    base_dir: PathBuf,
    app_tx: mpsc::UnboundedSender<String>,
}

impl AcpClient {
    fn new(base_dir: PathBuf, app_tx: mpsc::UnboundedSender<String>) -> Self {
        Self { base_dir, app_tx }
    }

    fn resolve_path(&self, path: &Path) -> Result<PathBuf, agent_client_protocol::Error> {
        let p = if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.base_dir.join(path)
        };
        let Ok(canon) = p.canonicalize() else {
            return Err(agent_client_protocol::Error::invalid_params());
        };
        let Ok(base) = self.base_dir.canonicalize() else {
            return Err(agent_client_protocol::Error::internal_error());
        };
        if !canon.starts_with(base) {
            return Err(agent_client_protocol::Error::invalid_params());
        }
        Ok(canon)
    }
}

#[async_trait(?Send)]
impl agent_client_protocol::Client for AcpClient {
    async fn request_permission(
        &self,
        _args: agent_client_protocol::RequestPermissionRequest,
    ) -> anyhow::Result<agent_client_protocol::RequestPermissionResponse, agent_client_protocol::Error>
    {
        let outcome = if let Some(opt) = _args.options.first() {
            agent_client_protocol::RequestPermissionOutcome::Selected {
                option_id: opt.id.clone(),
            }
        } else {
            agent_client_protocol::RequestPermissionOutcome::Cancelled
        };
        Ok(agent_client_protocol::RequestPermissionResponse { outcome, meta: None })
    }

    async fn write_text_file(
        &self,
        args: agent_client_protocol::WriteTextFileRequest,
    ) -> anyhow::Result<agent_client_protocol::WriteTextFileResponse, agent_client_protocol::Error> {
        let path = self.resolve_path(&args.path)?;
        if let Some(parent) = path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        tokio::fs::write(&path, args.content.as_str())
            .await
            .map_err(|_| agent_client_protocol::Error::internal_error())?;
        Ok(agent_client_protocol::WriteTextFileResponse { meta: None })
    }

    async fn read_text_file(
        &self,
        args: agent_client_protocol::ReadTextFileRequest,
    ) -> anyhow::Result<agent_client_protocol::ReadTextFileResponse, agent_client_protocol::Error> {
        let path = self.resolve_path(&args.path)?;
        let data = tokio::fs::read_to_string(&path)
            .await
            .map_err(|_| agent_client_protocol::Error::invalid_params())?;
        Ok(agent_client_protocol::ReadTextFileResponse { content: data, meta: None })
    }

    async fn create_terminal(
        &self,
        _args: agent_client_protocol::CreateTerminalRequest,
    ) -> Result<agent_client_protocol::CreateTerminalResponse, agent_client_protocol::Error> {
        Err(agent_client_protocol::Error::method_not_found())
    }

    async fn terminal_output(
        &self,
        _args: agent_client_protocol::TerminalOutputRequest,
    ) -> anyhow::Result<agent_client_protocol::TerminalOutputResponse, agent_client_protocol::Error> {
        Err(agent_client_protocol::Error::method_not_found())
    }

    async fn release_terminal(
        &self,
        _args: agent_client_protocol::ReleaseTerminalRequest,
    ) -> anyhow::Result<agent_client_protocol::ReleaseTerminalResponse, agent_client_protocol::Error> {
        Err(agent_client_protocol::Error::method_not_found())
    }

    async fn wait_for_terminal_exit(
        &self,
        _args: agent_client_protocol::WaitForTerminalExitRequest,
    ) -> anyhow::Result<agent_client_protocol::WaitForTerminalExitResponse, agent_client_protocol::Error> {
        Err(agent_client_protocol::Error::method_not_found())
    }

    async fn kill_terminal_command(
        &self,
        _args: agent_client_protocol::KillTerminalCommandRequest,
    ) -> anyhow::Result<agent_client_protocol::KillTerminalCommandResponse, agent_client_protocol::Error> {
        Err(agent_client_protocol::Error::method_not_found())
    }

    async fn session_notification(
        &self,
        args: agent_client_protocol::SessionNotification,
    ) -> anyhow::Result<(), agent_client_protocol::Error> {
        match args.update {
            agent_client_protocol::SessionUpdate::AgentMessageChunk { content } => {
                if let agent_client_protocol::ContentBlock::Text(t) = content {
                    let ev = serde_json::json!({"type":"agent_text","text": t.text});
                    let _ = self.app_tx.send(format!("[acp] {}", ev.to_string()));
                }
            }
            agent_client_protocol::SessionUpdate::AgentThoughtChunk { content } => {
                if let agent_client_protocol::ContentBlock::Text(t) = content {
                    let ev = serde_json::json!({"type":"agent_thought","text": t.text});
                    let _ = self.app_tx.send(format!("[acp] {}", ev.to_string()));
                }
            }
            agent_client_protocol::SessionUpdate::ToolCall(tc) => {
                let ev = serde_json::json!({
                    "type":"tool_call",
                    "id": tc.id.0.to_string(),
                    "title": tc.title,
                    "raw_input": tc.raw_input,
                    "raw_output": tc.raw_output,
                });
                let _ = self.app_tx.send(format!("[acp] {}", ev.to_string()));
            }
            agent_client_protocol::SessionUpdate::ToolCallUpdate(update) => {
                if let Ok(tc) = agent_client_protocol::ToolCall::try_from(update) {
                    let ev = serde_json::json!({
                        "type":"tool_update",
                        "id": tc.id.0.to_string(),
                        "title": tc.title,
                        "raw_input": tc.raw_input,
                        "raw_output": tc.raw_output,
                    });
                    let _ = self.app_tx.send(format!("[acp] {}", ev.to_string()));
                }
            }
            agent_client_protocol::SessionUpdate::Plan(plan) => {
                let entries: Vec<String> = plan.entries.iter().map(|e| e.content.clone()).collect();
                let ev = serde_json::json!({"type":"plan","entries": entries});
                let _ = self.app_tx.send(format!("[acp] {}", ev.to_string()));
            }
            _ => {}
        }
        Ok(())
    }

    async fn ext_method(
        &self,
        _args: agent_client_protocol::ExtRequest,
    ) -> Result<agent_client_protocol::ExtResponse, agent_client_protocol::Error> {
        Err(agent_client_protocol::Error::method_not_found())
    }

    async fn ext_notification(
        &self,
        _args: agent_client_protocol::ExtNotification,
    ) -> Result<(), agent_client_protocol::Error> {
        Ok(())
    }
}

fn map_tool_from_json(
    title: &str,
    raw_input: Option<serde_json::Value>,
    raw_output: Option<serde_json::Value>,
) -> (String, ActionType) {
    let tool_name = if title.is_empty() { "tool".to_string() } else { title.to_string() };
    let action = ActionType::Tool {
        tool_name: tool_name.clone(),
        arguments: raw_input,
        result: raw_output.map(|v| ToolResult { r#type: ToolResultValueType::Json, value: v }),
    };
    (tool_name, action)
}

// Removed unused helpers (plain-text processor, plan text, legacy tool mapping)
