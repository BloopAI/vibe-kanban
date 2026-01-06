use std::{
    collections::HashMap,
    net::TcpListener,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};

use agent_client_protocol as acp;
use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use derivative::Derivative;
use futures::TryStreamExt;
use reqwest::StatusCode;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{
    io::{AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader, BufWriter},
    process::{ChildStdout, Command},
};
use tokio_util::io::StreamReader;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorExitResult, SpawnedChild,
        StandardCodingAgentExecutor,
        acp::{AcpEvent, ApprovalResponse},
    },
    stdout_dup::create_stdout_pipe_writer,
};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Opencode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "agent")]
    pub mode: Option<String>,
    /// Auto-approve agent actions
    #[serde(default = "default_to_true")]
    pub auto_approve: bool,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Opencode {
    fn build_command_builder(&self) -> CommandBuilder {
        let builder = CommandBuilder::new("npx -y opencode-ai@1.1.3")
            .extend_params(["serve", "--hostname=127.0.0.1"]);
        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Opencode {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        spawn_opencode_sdk_session(
            current_dir,
            self.append_prompt.combine_prompt(prompt),
            None,
            self.model.clone(),
            self.mode.clone(),
            if self.auto_approve {
                None
            } else {
                self.approvals.clone()
            },
            self.auto_approve,
            self.build_command_builder(),
            &self.cmd,
            &setup_approvals_env(self.auto_approve, env),
        )
        .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        spawn_opencode_sdk_session(
            current_dir,
            self.append_prompt.combine_prompt(prompt),
            Some(session_id.to_string()),
            self.model.clone(),
            self.mode.clone(),
            if self.auto_approve {
                None
            } else {
                self.approvals.clone()
            },
            self.auto_approve,
            self.build_command_builder(),
            &self.cmd,
            &setup_approvals_env(self.auto_approve, env),
        )
        .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        crate::executors::acp::normalize_logs(msg_store, worktree_path);
    }

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

fn default_to_true() -> bool {
    true
}

fn setup_approvals_env(auto_approve: bool, env: &ExecutionEnv) -> ExecutionEnv {
    let mut env = env.clone();
    if !auto_approve && !env.contains_key("OPENCODE_PERMISSION") {
        env.insert("OPENCODE_PERMISSION", r#"{"edit": "ask", "bash": "ask", "webfetch": "ask", "doom_loop": "ask", "external_directory": "ask"}"#);
    }
    env
}

#[derive(Clone)]
struct LogWriter {
    writer: Arc<tokio::sync::Mutex<BufWriter<Box<dyn AsyncWrite + Send + Unpin>>>>,
}

impl LogWriter {
    fn new(writer: impl AsyncWrite + Send + Unpin + 'static) -> Self {
        Self {
            writer: Arc::new(tokio::sync::Mutex::new(BufWriter::new(Box::new(writer)))),
        }
    }

    async fn log_event(&self, event: &AcpEvent) -> Result<(), ExecutorError> {
        let raw = serde_json::to_string(event)?;
        self.log_raw(&raw).await
    }

    async fn log_raw(&self, raw: &str) -> Result<(), ExecutorError> {
        let mut guard = self.writer.lock().await;
        guard.write_all(raw.as_bytes()).await.map_err(ExecutorError::Io)?;
        guard.write_all(b"\n").await.map_err(ExecutorError::Io)?;
        guard.flush().await.map_err(ExecutorError::Io)?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeSession {
    id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionForkRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    message_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromptAsyncRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<OpencodeModelRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent: Option<String>,
    parts: Vec<TextPartInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeModelRef {
    provider_id: String,
    model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextPartInput {
    #[serde(rename = "type")]
    r#type: String,
    text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageUpdatedProps {
    info: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessagePartUpdatedProps {
    part: Value,
    #[serde(default)]
    delta: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionIdleProps {
    session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionStatusProps {
    session_id: String,
    status: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PermissionRequest {
    id: String,
    session_id: String,
    permission: String,
    patterns: Vec<String>,
    metadata: Value,
    always: Vec<String>,
    #[serde(default)]
    tool: Option<PermissionToolRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PermissionToolRef {
    message_id: String,
    call_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PermissionReplyRequest {
    reply: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextPart {
    id: String,
    session_id: String,
    text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReasoningPart {
    id: String,
    session_id: String,
    text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolPart {
    id: String,
    session_id: String,
    message_id: String,
    #[serde(rename = "type")]
    r#type: String,
    call_id: String,
    tool: String,
    state: ToolState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum ToolState {
    Pending { input: Value },
    Running {
        input: Value,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        metadata: Value,
    },
    Completed {
        input: Value,
        output: String,
        title: String,
        metadata: Value,
    },
    Error {
        input: Value,
        error: String,
        #[serde(default)]
        metadata: Value,
    },
}

fn allocate_unused_port() -> Result<u16, ExecutorError> {
    let listener =
        TcpListener::bind(("127.0.0.1", 0)).map_err(|err| ExecutorError::Io(err))?;
    let port = listener
        .local_addr()
        .map_err(ExecutorError::Io)?
        .port();
    drop(listener);
    Ok(port)
}

fn parse_model_ref(model: &str) -> Option<OpencodeModelRef> {
    let mut parts = model.splitn(2, '/');
    let provider = parts.next()?.trim();
    let model_id = parts.next()?.trim();
    if provider.is_empty() || model_id.is_empty() {
        return None;
    }
    Some(OpencodeModelRef {
        provider_id: provider.to_string(),
        model_id: model_id.to_string(),
    })
}

fn relative_to_worktree(path: &str, worktree_path: &Path) -> String {
    workspace_utils::path::make_path_relative(path, &worktree_path.to_string_lossy())
}

fn opencode_tool_kind(tool: &str) -> acp::ToolKind {
    match tool.to_ascii_lowercase().as_str() {
        "bash" => acp::ToolKind::Execute,
        "webfetch" => acp::ToolKind::Fetch,
        "edit" | "write" => acp::ToolKind::Edit,
        "grep" | "glob" | "websearch" | "codesearch" | "context7_resolve_library_id"
        | "context7_get_library_docs" => acp::ToolKind::Search,
        "list" | "read" => acp::ToolKind::Read,
        // patch is multi-file; treat as generic tool for richer display in the UI
        "patch" => acp::ToolKind::Other,
        _ => acp::ToolKind::Other,
    }
}

fn opencode_tool_locations(tool: &str, input: &Value) -> Vec<acp::ToolCallLocation> {
    let tool = tool.to_ascii_lowercase();
    let input = input.as_object();
    let Some(input) = input else {
        return Vec::new();
    };

    let path_value = match tool.as_str() {
        "read" | "edit" | "write" => input.get("filePath").and_then(|v| v.as_str()),
        "glob" | "grep" | "list" => input.get("path").and_then(|v| v.as_str()),
        "bash" => None,
        _ => None,
    };

    path_value
        .map(|p| vec![acp::ToolCallLocation::new(p)])
        .unwrap_or_default()
}

fn tool_state_input(state: &ToolState) -> Value {
    match state {
        ToolState::Pending { input }
        | ToolState::Running { input, .. }
        | ToolState::Completed { input, .. }
        | ToolState::Error { input, .. } => input.clone(),
    }
}

fn tool_state_title(state: &ToolState, fallback: &str) -> String {
    match state {
        ToolState::Running { title, .. } => title.clone().unwrap_or_else(|| fallback.to_string()),
        ToolState::Completed { title, .. } => title.clone(),
        ToolState::Pending { .. } | ToolState::Error { .. } => fallback.to_string(),
    }
}

fn tool_state_status(state: &ToolState) -> acp::ToolCallStatus {
    match state {
        ToolState::Pending { .. } => acp::ToolCallStatus::Pending,
        ToolState::Running { .. } => acp::ToolCallStatus::InProgress,
        ToolState::Completed { .. } => acp::ToolCallStatus::Completed,
        ToolState::Error { .. } => acp::ToolCallStatus::Failed,
    }
}

fn tool_state_output(state: &ToolState) -> Option<String> {
    match state {
        ToolState::Completed { output, .. } => Some(output.clone()),
        ToolState::Error { error, .. } => Some(error.clone()),
        ToolState::Pending { .. } | ToolState::Running { .. } => None,
    }
}

fn tool_state_metadata(state: &ToolState) -> Option<Value> {
    match state {
        ToolState::Running { metadata, .. }
        | ToolState::Completed { metadata, .. }
        | ToolState::Error { metadata, .. } => Some(metadata.clone()),
        ToolState::Pending { .. } => None,
    }
}

fn build_acp_tool_call(
    tool_part: &ToolPart,
    worktree_path: &Path,
) -> Result<acp::ToolCall, ExecutorError> {
    let input = tool_state_input(&tool_part.state);
    let kind = opencode_tool_kind(&tool_part.tool);
    let title = tool_state_title(&tool_part.state, &tool_part.tool);
    let status = tool_state_status(&tool_part.state);

    let mut tc = acp::ToolCall::new(acp::ToolCallId::new(tool_part.call_id.clone()), title)
        .kind(kind)
        .status(status)
        .locations(opencode_tool_locations(&tool_part.tool, &input));

    let mut content: Vec<acp::ToolCallContent> = Vec::new();
    let mut raw_input = input;

    // Prefer OpenCode's full diff metadata when available for file edits.
    if tool_part.tool.eq_ignore_ascii_case("edit")
        && let Some(Value::Object(meta)) = tool_state_metadata(&tool_part.state)
        && let Some(Value::String(diff)) = meta.get("diff")
        && let Some(file_path) = raw_input
            .as_object()
            .and_then(|o| o.get("filePath").and_then(|v| v.as_str()))
    {
        let rel = relative_to_worktree(file_path, worktree_path);
        raw_input = serde_json::json!({ "filePath": rel, "diff": diff });
    }

    // For writes, synthesize an ACP diff so the UI can render file changes.
    if tool_part.tool.eq_ignore_ascii_case("write")
        && let Some(file_path) = raw_input
            .as_object()
            .and_then(|o| o.get("filePath").and_then(|v| v.as_str()))
        && let Some(file_content) = raw_input
            .as_object()
            .and_then(|o| o.get("content").and_then(|v| v.as_str()))
    {
        let rel = relative_to_worktree(file_path, worktree_path);
        let diff = acp::Diff::new(rel, file_content.to_string());
        content.push(acp::ToolCallContent::Diff(diff));
    }

    // Normalize search tools so ACP log normalization can extract a query string.
    if tool_part.tool.eq_ignore_ascii_case("grep") || tool_part.tool.eq_ignore_ascii_case("glob") {
        if let Some(obj) = raw_input.as_object_mut()
            && let Some(pattern) = obj.get("pattern").and_then(|v| v.as_str())
        {
            obj.insert("query".to_string(), Value::String(pattern.to_string()));
        }
    }

    tc = tc.raw_input(raw_input);

    if let Some(output) = tool_state_output(&tool_part.state) {
        let output_text = output.clone();
        let parsed_output =
            serde_json::from_str::<Value>(&output).unwrap_or(Value::String(output));
        content.push(acp::ToolCallContent::from(acp::ContentBlock::Text(
            acp::TextContent::new(output_text),
        )));
        tc = tc.raw_output(parsed_output);
    }

    if !content.is_empty() {
        tc = tc.content(content);
    }

    Ok(tc)
}

fn parse_server_url_line(line: &str) -> Option<String> {
    if !line.starts_with("opencode server listening") {
        return None;
    }
    line.split_whitespace()
        .find(|token| token.starts_with("http://") || token.starts_with("https://"))
        .map(|s| s.to_string())
}

async fn read_server_url_and_drain(
    stdout: ChildStdout,
    url_tx: tokio::sync::oneshot::Sender<Result<String, String>>,
) {
    let mut reader = BufReader::new(stdout).lines();
    let mut url_tx = Some(url_tx);
    let mut captured = String::new();

    loop {
        match reader.next_line().await {
            Ok(Some(line)) => {
                captured.push_str(&line);
                captured.push('\n');
                if let Some(url) = parse_server_url_line(&line)
                    && let Some(tx) = url_tx.take()
                {
                    let _ = tx.send(Ok(url));
                }
            }
            Ok(None) => break,
            Err(err) => {
                captured.push_str(&format!("(stdout read error: {err})\n"));
                break;
            }
        }
    }

    if let Some(tx) = url_tx.take() {
        let msg = if captured.trim().is_empty() {
            "OpenCode server exited before reporting its URL".to_string()
        } else {
            format!("OpenCode server exited before reporting its URL:\n{captured}")
        };
        let _ = tx.send(Err(msg));
    }
}

async fn spawn_opencode_sdk_session(
    current_dir: &Path,
    prompt: String,
    fork_from_session_id: Option<String>,
    model: Option<String>,
    agent: Option<String>,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    auto_approve: bool,
    command_builder: CommandBuilder,
    cmd_overrides: &CmdOverrides,
    env: &ExecutionEnv,
) -> Result<SpawnedChild, ExecutorError> {
    let port = allocate_unused_port()?;
    let command_parts = command_builder.build_follow_up(&[format!("--port={port}")])?;
    let (program_path, args) = command_parts.into_resolved().await?;

    let mut command = Command::new(program_path);
    command
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(current_dir)
        .args(&args)
        .env("NODE_NO_WARNINGS", "1");

    env.clone()
        .with_profile(cmd_overrides)
        .apply_to_command(&mut command);

    let mut child = command.group_spawn()?;
    let server_stdout = child.inner().stdout.take().ok_or_else(|| {
        ExecutorError::Io(std::io::Error::other("OpenCode server missing stdout"))
    })?;

    let new_stdout = create_stdout_pipe_writer(&mut child)?;
    let log_writer = LogWriter::new(new_stdout);

    let (exit_tx, exit_rx) = tokio::sync::oneshot::channel::<ExecutorExitResult>();
    let (url_tx, url_rx) = tokio::sync::oneshot::channel::<Result<String, String>>();

    tokio::spawn(read_server_url_and_drain(server_stdout, url_tx));

    let worktree_path = current_dir.to_path_buf();
    let directory = current_dir.to_string_lossy().to_string();

    tokio::spawn(async move {
        let result = run_opencode_session(
            log_writer.clone(),
            url_rx,
            directory,
            worktree_path,
            prompt,
            fork_from_session_id,
            model,
            agent,
            approvals,
            auto_approve,
        )
        .await;

        match result {
            Ok(_) => {
                let _ = exit_tx.send(ExecutorExitResult::Success);
            }
            Err(err) => {
                let _ = log_writer
                    .log_event(&AcpEvent::Error(err.to_string()))
                    .await;
                let _ = exit_tx.send(ExecutorExitResult::Failure);
            }
        }
    });

    Ok(SpawnedChild {
        child,
        exit_signal: Some(exit_rx),
        interrupt_sender: None,
    })
}

#[allow(clippy::too_many_arguments)]
async fn run_opencode_session(
    log_writer: LogWriter,
    url_rx: tokio::sync::oneshot::Receiver<Result<String, String>>,
    directory: String,
    worktree_path: PathBuf,
    prompt: String,
    fork_from_session_id: Option<String>,
    model: Option<String>,
    agent: Option<String>,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    auto_approve: bool,
) -> Result<(), ExecutorError> {
    let base_url = match url_rx.await.map_err(|_| {
        ExecutorError::Io(std::io::Error::other(
            "OpenCode server URL channel closed unexpectedly",
        ))
    })? {
        Ok(url) => url,
        Err(msg) => return Err(ExecutorError::Io(std::io::Error::other(msg))),
    };

    let http = reqwest::Client::new();

    let session = if let Some(existing) = fork_from_session_id {
        let url = format!("{base_url}/session/{existing}/fork");
        let resp = http
            .post(url)
            .query(&[("directory", &directory)])
            .json(&SessionForkRequest { message_id: None })
            .send()
            .await
            .map_err(|e| ExecutorError::Io(std::io::Error::other(e.to_string())))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ExecutorError::Io(std::io::Error::other(format!(
                "OpenCode session fork failed ({status}): {body}"
            ))));
        }
        resp.json::<OpencodeSession>()
            .await
            .map_err(|e| ExecutorError::Io(std::io::Error::other(e.to_string())))?
    } else {
        let url = format!("{base_url}/session");
        let resp = http
            .post(url)
            .query(&[("directory", &directory)])
            .json(&serde_json::json!({}))
            .send()
            .await
            .map_err(|e| ExecutorError::Io(std::io::Error::other(e.to_string())))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ExecutorError::Io(std::io::Error::other(format!(
                "OpenCode session create failed ({status}): {body}"
            ))));
        }
        resp.json::<OpencodeSession>()
            .await
            .map_err(|e| ExecutorError::Io(std::io::Error::other(e.to_string())))?
    };

    let session_id = session.id.clone();
    log_writer
        .log_event(&AcpEvent::SessionStart(session_id.clone()))
        .await?;

    // Start event subscription (SSE).
    let event_url = format!("{base_url}/event");
    let resp = http
        .get(event_url)
        .query(&[("directory", &directory)])
        .send()
        .await
        .map_err(|e| ExecutorError::Io(std::io::Error::other(e.to_string())))?;
    if resp.status() != StatusCode::OK {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ExecutorError::Io(std::io::Error::other(format!(
            "OpenCode event subscribe failed ({status}): {body}"
        ))));
    }

    // Send the prompt asynchronously.
    let prompt_url = format!("{base_url}/session/{session_id}/prompt_async");
    let model_ref = model.as_deref().and_then(parse_model_ref);
    let prompt_req = PromptAsyncRequest {
        model: model_ref,
        agent,
        parts: vec![TextPartInput {
            r#type: "text".to_string(),
            text: prompt,
        }],
    };

    let prompt_resp = http
        .post(prompt_url)
        .query(&[("directory", &directory)])
        .json(&prompt_req)
        .send()
        .await
        .map_err(|e| ExecutorError::Io(std::io::Error::other(e.to_string())))?;
    if prompt_resp.status() != StatusCode::NO_CONTENT {
        let status = prompt_resp.status();
        let body = prompt_resp.text().await.unwrap_or_default();
        return Err(ExecutorError::Io(std::io::Error::other(format!(
            "OpenCode prompt failed ({status}): {body}"
        ))));
    }

    // Track message roles so we only stream assistant output.
    let mut message_roles: HashMap<String, String> = HashMap::new();
    // Track how much we've streamed per part id when delta isn't provided.
    let mut part_text_len: HashMap<String, usize> = HashMap::new();
    // Track latest tool part snapshot by call ID for richer approval input.
    let mut tools_by_call_id: HashMap<String, ToolPart> = HashMap::new();
    // Buffer parts received before we know message role.
    let mut pending_parts_by_message_id: HashMap<String, Vec<MessagePartUpdatedProps>> =
        HashMap::new();

    let mut started = false;

    let byte_stream = resp.bytes_stream().map_err(|e| {
        std::io::Error::other(format!("OpenCode SSE stream error: {e}"))
    });
    let reader = StreamReader::new(byte_stream);
    let mut lines = BufReader::new(reader).lines();

    let mut data_lines: Vec<String> = Vec::new();
    while let Some(line) = lines.next_line().await.map_err(ExecutorError::Io)? {
        if line.is_empty() {
            if data_lines.is_empty() {
                continue;
            }
            let data = data_lines.join("\n");
            data_lines.clear();

            let Ok(event) = serde_json::from_str::<Value>(&data) else {
                continue;
            };

            let Some(event_type) = event.get("type").and_then(|t| t.as_str()) else {
                continue;
            };

            match event_type {
                "message.updated" => {
                    let props: MessageUpdatedProps =
                        serde_json::from_value(event.get("properties").cloned().unwrap_or(Value::Null))?;
                    let msg_id = props
                        .info
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let role = props
                        .info
                        .get("role")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let msg_session = props
                        .info
                        .get("sessionID")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    if msg_session == session_id && !msg_id.is_empty() {
                        message_roles.insert(msg_id.clone(), role.clone());
                        if role == "assistant"
                            && let Some(parts) = pending_parts_by_message_id.remove(&msg_id)
                        {
                            for part in parts {
                                handle_part_update(
                                    &log_writer,
                                    &session_id,
                                    &worktree_path,
                                    &mut part_text_len,
                                    &mut tools_by_call_id,
                                    part,
                                )
                                .await?;
                                started = true;
                            }
                        }
                    }
                }
                "message.part.updated" => {
                    let props: MessagePartUpdatedProps =
                        serde_json::from_value(event.get("properties").cloned().unwrap_or(Value::Null))?;
                    let message_id = props
                        .part
                        .get("messageID")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let part_session = props
                        .part
                        .get("sessionID")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    if part_session != session_id {
                        continue;
                    }

                    if let Some(role) = message_roles.get(&message_id) {
                        if role == "assistant" {
                            handle_part_update(
                                &log_writer,
                                &session_id,
                                &worktree_path,
                                &mut part_text_len,
                                &mut tools_by_call_id,
                                props,
                            )
                            .await?;
                            started = true;
                        }
                    } else {
                        pending_parts_by_message_id
                            .entry(message_id)
                            .or_default()
                            .push(props);
                    }
                }
                "permission.asked" => {
                    let request: PermissionRequest =
                        serde_json::from_value(event.get("properties").cloned().unwrap_or(Value::Null))?;
                    if request.session_id != session_id {
                        continue;
                    }
                    started = true;

                    let call_id = request
                        .tool
                        .as_ref()
                        .map(|t| t.call_id.clone())
                        .unwrap_or_else(|| request.id.clone());

                    let tool_snapshot = tools_by_call_id
                        .get(&call_id)
                        .map(|t| serde_json::to_value(t).unwrap_or(Value::Null))
                        .unwrap_or(Value::Null);

                    let approval_status = if auto_approve {
                        workspace_utils::approvals::ApprovalStatus::Approved
                    } else if let Some(ref service) = approvals {
                        service
                            .request_tool_approval(
                                &request.permission,
                                serde_json::json!({
                                    "permission_request": request,
                                    "tool": tool_snapshot,
                                }),
                                &call_id,
                            )
                            .await?
                    } else {
                        // If no approval service is configured, fall back to allow-once to avoid stalling.
                        workspace_utils::approvals::ApprovalStatus::Approved
                    };

                    log_writer
                        .log_event(&AcpEvent::ApprovalResponse(ApprovalResponse {
                            tool_call_id: call_id.clone(),
                            status: approval_status.clone(),
                        }))
                        .await?;

                    let (reply, message) = match &approval_status {
                        workspace_utils::approvals::ApprovalStatus::Approved => (
                            if auto_approve { "always" } else { "once" }.to_string(),
                            None,
                        ),
                        workspace_utils::approvals::ApprovalStatus::Denied { reason } => {
                            ("reject".to_string(), reason.clone())
                        }
                        workspace_utils::approvals::ApprovalStatus::TimedOut => {
                            ("reject".to_string(), None)
                        }
                        workspace_utils::approvals::ApprovalStatus::Pending => {
                            ("reject".to_string(), None)
                        }
                    };

                    let reply_url = format!("{base_url}/permission/{}/reply", request.id);
                    let reply_resp = http
                        .post(reply_url)
                        .query(&[("directory", &directory)])
                        .json(&PermissionReplyRequest { reply, message })
                        .send()
                        .await
                        .map_err(|e| ExecutorError::Io(std::io::Error::other(e.to_string())))?;
                    if !reply_resp.status().is_success() {
                        let status = reply_resp.status();
                        let body = reply_resp.text().await.unwrap_or_default();
                        return Err(ExecutorError::Io(std::io::Error::other(format!(
                            "OpenCode permission reply failed ({status}): {body}"
                        ))));
                    }
                }
                "session.status" => {
                    let props: SessionStatusProps =
                        serde_json::from_value(event.get("properties").cloned().unwrap_or(Value::Null))?;
                    if props.session_id != session_id {
                        continue;
                    }
                    if props
                        .status
                        .get("type")
                        .and_then(|v| v.as_str())
                        .is_some_and(|t| t == "busy")
                    {
                        started = true;
                    }
                }
                "session.idle" => {
                    let props: SessionIdleProps =
                        serde_json::from_value(event.get("properties").cloned().unwrap_or(Value::Null))?;
                    if props.session_id == session_id && started {
                        log_writer
                            .log_event(&AcpEvent::Done("idle".to_string()))
                            .await?;
                        break;
                    }
                }
                "session.error" => {
                    let props = event.get("properties").cloned().unwrap_or(Value::Null);
                    let session = props
                        .get("sessionID")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    if session == session_id {
                        let err_msg = props
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("OpenCode session error");
                        log_writer.log_event(&AcpEvent::Error(err_msg.to_string())).await?;
                        return Err(ExecutorError::Io(std::io::Error::other(err_msg)));
                    }
                }
                _ => {}
            }

            continue;
        }

        if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.trim_start().to_string());
        }
    }

    Ok(())
}

async fn handle_part_update(
    log_writer: &LogWriter,
    session_id: &str,
    worktree_path: &Path,
    part_text_len: &mut HashMap<String, usize>,
    tools_by_call_id: &mut HashMap<String, ToolPart>,
    props: MessagePartUpdatedProps,
) -> Result<(), ExecutorError> {
    let part_type = props
        .part
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    match part_type {
        "text" => {
            let part: TextPart = serde_json::from_value(props.part)?;
            if part.session_id != session_id {
                return Ok(());
            }
            let delta = coerce_delta(&part.id, &part.text, props.delta, part_text_len);
            if delta.is_empty() {
                return Ok(());
            }
            log_writer
                .log_event(&AcpEvent::Message(acp::ContentBlock::Text(
                    acp::TextContent::new(delta),
                )))
                .await?;
        }
        "reasoning" => {
            let part: ReasoningPart = serde_json::from_value(props.part)?;
            if part.session_id != session_id {
                return Ok(());
            }
            let delta = coerce_delta(&part.id, &part.text, props.delta, part_text_len);
            if delta.is_empty() {
                return Ok(());
            }
            log_writer
                .log_event(&AcpEvent::Thought(acp::ContentBlock::Text(
                    acp::TextContent::new(delta),
                )))
                .await?;
        }
        "tool" => {
            let part: ToolPart = serde_json::from_value(props.part)?;
            if part.session_id != session_id {
                return Ok(());
            }
            tools_by_call_id.insert(part.call_id.clone(), part.clone());
            let tool_call = build_acp_tool_call(&part, worktree_path)?;
            log_writer.log_event(&AcpEvent::ToolCall(tool_call)).await?;
        }
        _ => {}
    }

    Ok(())
}

fn coerce_delta(
    part_id: &str,
    full_text: &str,
    delta: Option<String>,
    part_text_len: &mut HashMap<String, usize>,
) -> String {
    if let Some(delta) = delta {
        let new_len = part_text_len.get(part_id).copied().unwrap_or(0) + delta.len();
        part_text_len.insert(part_id.to_string(), new_len);
        return delta;
    }

    let already = part_text_len.get(part_id).copied().unwrap_or(0);
    if already >= full_text.len() {
        return String::new();
    }
    let Some(slice) = full_text.get(already..) else {
        part_text_len.insert(part_id.to_string(), full_text.len());
        return full_text.to_string();
    };
    part_text_len.insert(part_id.to_string(), full_text.len());
    slice.to_string()
}
