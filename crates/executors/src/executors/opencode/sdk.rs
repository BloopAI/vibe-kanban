use std::{
    collections::{HashMap, HashSet},
    future::Future,
    io,
    path::Path,
    sync::Arc,
    time::Duration,
};

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use eventsource_stream::Eventsource;
use futures::{FutureExt, StreamExt};
use rand::{Rng, distributions::Alphanumeric};
use reqwest::header::{AUTHORIZATION, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{
    io::{AsyncWrite, AsyncWriteExt, BufWriter},
    sync::{Mutex as AsyncMutex, mpsc, oneshot},
};
use tokio_util::sync::CancellationToken;
use workspace_utils::approvals::ApprovalStatus;

use super::{slash_commands, types::OpencodeExecutorEvent};
use crate::{
    approvals::{ExecutorApprovalError, ExecutorApprovalService},
    executors::{
        ExecutorError,
        opencode::{OpencodeServer, models::maybe_emit_token_usage},
    },
};

#[derive(Clone)]
pub struct LogWriter {
    writer: Arc<AsyncMutex<BufWriter<Box<dyn AsyncWrite + Send + Unpin>>>>,
}

impl LogWriter {
    pub fn new(writer: impl AsyncWrite + Send + Unpin + 'static) -> Self {
        Self {
            writer: Arc::new(AsyncMutex::new(BufWriter::new(Box::new(writer)))),
        }
    }

    pub async fn log_event(&self, event: &OpencodeExecutorEvent) -> Result<(), ExecutorError> {
        let raw =
            serde_json::to_string(event).map_err(|err| ExecutorError::Io(io::Error::other(err)))?;
        self.log_raw(&raw).await
    }

    pub async fn log_error(&self, message: String) -> Result<(), ExecutorError> {
        self.log_event(&OpencodeExecutorEvent::Error { message })
            .await
    }

    pub async fn log_slash_command_result(&self, message: String) -> Result<(), ExecutorError> {
        self.log_event(&OpencodeExecutorEvent::SlashCommandResult { message })
            .await
    }

    async fn log_raw(&self, raw: &str) -> Result<(), ExecutorError> {
        let mut guard = self.writer.lock().await;
        guard
            .write_all(raw.as_bytes())
            .await
            .map_err(ExecutorError::Io)?;
        guard.write_all(b"\n").await.map_err(ExecutorError::Io)?;
        guard.flush().await.map_err(ExecutorError::Io)?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct RunConfig {
    pub base_url: String,
    pub directory: String,
    pub prompt: String,
    pub resume_session_id: Option<String>,
    pub model: Option<String>,
    pub model_variant: Option<String>,
    pub agent: Option<String>,
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
    pub auto_approve: bool,
    pub server_password: String,
    /// Cache key for model context windows. Should be derived from configuration
    /// that affects available models (e.g., env vars, base command).
    pub models_cache_key: String,
}

/// Generate a cryptographically secure random password for OpenCode server auth.
pub fn generate_server_password() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

#[derive(Debug, Deserialize)]
struct HealthResponse {
    healthy: bool,
    version: String,
}

#[derive(Debug, Deserialize)]
struct SessionResponse {
    id: String,
}

/// Information about a discovered command.
#[derive(Debug, Deserialize, Clone)]
pub struct CommandInfo {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// Information about an agent.
#[derive(Debug, Deserialize, Clone)]
pub struct AgentInfo {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// Configuration response from the server.
#[derive(Debug, Deserialize)]
pub struct ConfigResponse {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub plugin: Vec<String>,
}

/// Provider configuration response.
#[derive(Debug, Deserialize)]
pub struct ConfigProvidersResponse {
    pub providers: Vec<ProviderInfo>,
    pub default: HashMap<String, String>,
}

/// Information about a provider.
#[derive(Debug, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub name: String,
    #[serde(default)]
    pub models: HashMap<String, Value>,
}

/// Provider list response.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ProviderListResponse {
    pub all: Vec<ProviderInfo>,
    pub default: HashMap<String, String>,
    pub connected: Vec<String>,
}

/// LSP server status.
#[derive(Debug, Deserialize, Clone)]
pub struct LspStatus {
    pub name: String,
    pub root: String,
    pub status: String,
}

/// Formatter status.
#[derive(Debug, Deserialize, Clone)]
pub struct FormatterStatus {
    pub name: String,
    pub extensions: Vec<String>,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
struct PromptRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<ModelSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    variant: Option<String>,
    parts: Vec<TextPartInput>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelSpec {
    #[serde(rename = "providerID")]
    pub provider_id: String,
    #[serde(rename = "modelID")]
    pub model_id: String,
}

#[derive(Debug, Serialize)]
struct TextPartInput {
    r#type: &'static str,
    text: String,
}

#[derive(Debug, Clone)]
pub enum ControlEvent {
    Idle,
    AuthRequired { message: String },
    SessionError { message: String },
    Disconnected,
}

pub async fn run_session(
    config: RunConfig,
    log_writer: LogWriter,
    interrupt_rx: oneshot::Receiver<()>,
) -> Result<(), ExecutorError> {
    let cancel = CancellationToken::new();

    let client = reqwest::Client::builder()
        .default_headers(build_default_headers(
            &config.directory,
            &config.server_password,
        ))
        .build()
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    let mut interrupted = false;
    let interrupt_rx = interrupt_rx.fuse();
    let session_fut = run_session_inner(config, log_writer, client, cancel.clone()).fuse();

    tokio::pin!(interrupt_rx);
    tokio::pin!(session_fut);

    loop {
        tokio::select! {
            biased;
            _ = &mut interrupt_rx => {
                interrupted = true;
                cancel.cancel();
            }
            res = &mut session_fut => {
                if interrupted {
                    return Ok(());
                }
                return res;
            }
        }
    }
}

pub(super) async fn discover_commands(
    server: &OpencodeServer,
    directory: &Path,
) -> Result<Vec<CommandInfo>, ExecutorError> {
    let directory = directory.to_string_lossy();
    let client = reqwest::Client::builder()
        .default_headers(build_default_headers(&directory, &server.server_password))
        .build()
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    wait_for_health(&client, &server.base_url).await?;
    list_commands(&client, &server.base_url, &directory).await
}

pub async fn run_slash_command(
    config: RunConfig,
    log_writer: LogWriter,
    command: slash_commands::OpencodeSlashCommand,
    interrupt_rx: oneshot::Receiver<()>,
) -> Result<(), ExecutorError> {
    let cancel = CancellationToken::new();

    let client = reqwest::Client::builder()
        .default_headers(build_default_headers(
            &config.directory,
            &config.server_password,
        ))
        .build()
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    let mut interrupted = false;
    let interrupt_rx = interrupt_rx.fuse();
    let command_fut =
        slash_commands::execute(config, command, log_writer, client, cancel.clone()).fuse();

    tokio::pin!(interrupt_rx);
    tokio::pin!(command_fut);

    loop {
        tokio::select! {
            biased;
            _ = &mut interrupt_rx => {
                interrupted = true;
                cancel.cancel();
            }
            res = &mut command_fut => {
                if interrupted {
                    return Ok(());
                }
                return res;
            }
        }
    }
}

async fn run_session_inner(
    config: RunConfig,
    log_writer: LogWriter,
    client: reqwest::Client,
    cancel: CancellationToken,
) -> Result<(), ExecutorError> {
    tokio::select! {
        _ = cancel.cancelled() => return Ok(()),
        res = wait_for_health(&client, &config.base_url) => res?,
    }

    let session_id = match config.resume_session_id.as_deref() {
        Some(existing) => {
            tokio::select! {
                _ = cancel.cancelled() => return Ok(()),
                res = fork_session(&client, &config.base_url, &config.directory, existing) => res?,
            }
        }
        None => tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            res = create_session(&client, &config.base_url, &config.directory) => res?,
        },
    };

    log_writer
        .log_event(&OpencodeExecutorEvent::SessionStart {
            session_id: session_id.clone(),
        })
        .await?;

    let model = config.model.as_deref().and_then(parse_model);

    let (control_tx, mut control_rx) = mpsc::unbounded_channel::<ControlEvent>();

    let event_resp = tokio::select! {
        _ = cancel.cancelled() => return Ok(()),
        res = connect_event_stream(&client, &config.base_url, &config.directory, None) => res?,
    };
    let event_handle = tokio::spawn(spawn_event_listener(
        EventListenerConfig {
            client: client.clone(),
            base_url: config.base_url.clone(),
            directory: config.directory.clone(),
            session_id: session_id.clone(),
            log_writer: log_writer.clone(),
            approvals: config.approvals.clone(),
            auto_approve: config.auto_approve,
            control_tx,
            models_cache_key: config.models_cache_key.clone(),
        },
        event_resp,
    ));

    let prompt_fut = Box::pin(prompt(
        &client,
        &config.base_url,
        &config.directory,
        &session_id,
        &config.prompt,
        model.clone(),
        config.model_variant.clone(),
        config.agent.clone(),
    ));
    let prompt_result = run_request_with_control(prompt_fut, &mut control_rx, cancel.clone()).await;

    if cancel.is_cancelled() {
        send_abort(&client, &config.base_url, &config.directory, &session_id).await;
        event_handle.abort();
        return Ok(());
    }

    event_handle.abort();

    prompt_result?;
    log_writer.log_event(&OpencodeExecutorEvent::Done).await?;

    Ok(())
}

fn build_default_headers(directory: &str, password: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(directory) {
        headers.insert("x-opencode-directory", value);
    }
    let credentials = BASE64.encode(format!("opencode:{password}"));
    if let Ok(value) = HeaderValue::from_str(&format!("Basic {credentials}")) {
        headers.insert(AUTHORIZATION, value);
    }
    headers
}

fn append_session_error(session_error: &mut Option<String>, message: String) {
    match session_error {
        Some(existing) => {
            existing.push('\n');
            existing.push_str(&message);
        }
        None => *session_error = Some(message),
    }
}

pub async fn run_request_with_control<F>(
    mut request_fut: F,
    control_rx: &mut mpsc::UnboundedReceiver<ControlEvent>,
    cancel: CancellationToken,
) -> Result<(), ExecutorError>
where
    F: Future<Output = Result<(), ExecutorError>> + Unpin,
{
    let mut idle_seen = false;
    let mut session_error: Option<String> = None;

    let request_result = loop {
        tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            res = &mut request_fut => break res,
            event = control_rx.recv() => match event {
                Some(ControlEvent::AuthRequired { message }) => return Err(ExecutorError::AuthRequired(message)),
                Some(ControlEvent::SessionError { message }) => append_session_error(&mut session_error, message),
                Some(ControlEvent::Disconnected) if !cancel.is_cancelled() => {
                    return Err(ExecutorError::Io(io::Error::other("OpenCode event stream disconnected while request was running")));
                }
                Some(ControlEvent::Disconnected) => return Ok(()),
                Some(ControlEvent::Idle) => idle_seen = true,
                None => {}
            }
        }
    };

    if let Err(err) = request_result {
        if cancel.is_cancelled() {
            return Ok(());
        }
        return Err(err);
    }

    if !idle_seen {
        // The OpenCode server streams events independently; wait for `session.idle` so we capture
        // tail updates reliably (e.g. final tool completion events).
        loop {
            tokio::select! {
                _ = cancel.cancelled() => return Ok(()),
                event = control_rx.recv() => match event {
                    Some(ControlEvent::Idle) | None => break,
                    Some(ControlEvent::AuthRequired { message }) => return Err(ExecutorError::AuthRequired(message)),
                    Some(ControlEvent::SessionError { message }) => append_session_error(&mut session_error, message),
                    Some(ControlEvent::Disconnected) if !cancel.is_cancelled() => {
                        return Err(ExecutorError::Io(io::Error::other(
                            "OpenCode event stream disconnected while waiting for session to go idle",
                        )));
                    }
                    Some(ControlEvent::Disconnected) => return Ok(()),
                }
            }
        }
    }

    if let Some(message) = session_error {
        if cancel.is_cancelled() {
            return Ok(());
        }
        return Err(ExecutorError::Io(io::Error::other(message)));
    }

    Ok(())
}

pub async fn wait_for_health(
    client: &reqwest::Client,
    base_url: &str,
) -> Result<(), ExecutorError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
    let mut last_err: Option<String> = None;

    loop {
        if tokio::time::Instant::now() > deadline {
            return Err(ExecutorError::Io(io::Error::other(format!(
                "Timed out waiting for OpenCode server health: {}",
                last_err.unwrap_or_else(|| "unknown error".to_string())
            ))));
        }

        let resp = client.get(format!("{base_url}/global/health")).send().await;
        match resp {
            Ok(resp) => {
                if !resp.status().is_success() {
                    last_err = Some(format!("HTTP {}", resp.status()));
                } else if let Ok(body) = resp.json::<HealthResponse>().await {
                    if body.healthy {
                        return Ok(());
                    }
                    last_err = Some(format!("unhealthy server (version {})", body.version));
                } else {
                    last_err = Some("failed to parse health response".to_string());
                }
            }
            Err(err) => {
                last_err = Some(err.to_string());
            }
        }

        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

pub async fn create_session(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Result<String, ExecutorError> {
    let resp = client
        .post(format!("{base_url}/session"))
        .query(&[("directory", directory)])
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(ExecutorError::Io(io::Error::other(format!(
            "OpenCode session.create failed: HTTP {}",
            resp.status()
        ))));
    }

    let session = resp
        .json::<SessionResponse>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;
    Ok(session.id)
}

pub async fn fork_session(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
    session_id: &str,
) -> Result<String, ExecutorError> {
    let resp = client
        .post(format!("{base_url}/session/{session_id}/fork"))
        .query(&[("directory", directory)])
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(ExecutorError::Io(io::Error::other(format!(
            "OpenCode session.fork failed: HTTP {}",
            resp.status()
        ))));
    }

    let session = resp
        .json::<SessionResponse>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;
    Ok(session.id)
}

#[allow(clippy::too_many_arguments)]
async fn prompt(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
    session_id: &str,
    prompt: &str,
    model: Option<ModelSpec>,
    model_variant: Option<String>,
    agent: Option<String>,
) -> Result<(), ExecutorError> {
    let req = PromptRequest {
        model,
        agent,
        variant: model_variant,
        parts: vec![TextPartInput {
            r#type: "text",
            text: prompt.to_string(),
        }],
    };

    let resp = client
        .post(format!("{base_url}/session/{session_id}/message"))
        .query(&[("directory", directory)])
        .json(&req)
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    // The OpenCode server uses streaming responses and may set the HTTP status early; validate
    // success using the response body shape as well.
    if !status.is_success() {
        return Err(ExecutorError::Io(io::Error::other(format!(
            "OpenCode session.prompt failed: HTTP {status} {body}"
        ))));
    }

    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err(ExecutorError::Io(io::Error::other(
            "OpenCode session.prompt returned empty response body",
        )));
    }

    let parsed: Value =
        serde_json::from_str(trimmed).map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    // Success response: { info, parts }
    if parsed.get("info").is_some() && parsed.get("parts").is_some() {
        return Ok(());
    }

    // Error response: { name, data }
    if let Some(name) = parsed.get("name").and_then(Value::as_str) {
        let message = parsed
            .pointer("/data/message")
            .and_then(Value::as_str)
            .unwrap_or(trimmed);
        return Err(ExecutorError::Io(io::Error::other(format!(
            "OpenCode session.prompt failed: {name}: {message}"
        ))));
    }

    Err(ExecutorError::Io(io::Error::other(format!(
        "OpenCode session.prompt returned unexpected response: {trimmed}"
    ))))
}

#[derive(Debug, Serialize)]
struct SessionCommandRequest {
    command: String,
    arguments: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    variant: Option<String>,
}

#[allow(clippy::too_many_arguments)]
pub async fn session_command(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
    session_id: &str,
    command: String,
    arguments: String,
    agent: Option<String>,
    model: Option<String>,
    model_variant: Option<String>,
) -> Result<(), ExecutorError> {
    let req = SessionCommandRequest {
        command,
        arguments,
        agent,
        model,
        variant: model_variant,
    };

    let resp = client
        .post(format!("{base_url}/session/{session_id}/command"))
        .query(&[("directory", directory)])
        .json(&req)
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !status.is_success() {
        return Err(ExecutorError::Io(io::Error::other(format!(
            "OpenCode session.command failed: HTTP {status} {body}"
        ))));
    }

    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err(ExecutorError::Io(io::Error::other(
            "OpenCode session.command returned empty response body",
        )));
    }

    let parsed: Value =
        serde_json::from_str(trimmed).map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if parsed.get("info").is_some() && parsed.get("parts").is_some() {
        return Ok(());
    }

    if let Some(name) = parsed.get("name").and_then(Value::as_str) {
        let message = parsed
            .pointer("/data/message")
            .and_then(Value::as_str)
            .unwrap_or(trimmed);
        return Err(ExecutorError::Io(io::Error::other(format!(
            "OpenCode session.command failed: {name}: {message}"
        ))));
    }

    Err(ExecutorError::Io(io::Error::other(format!(
        "OpenCode session.command returned unexpected response: {trimmed}"
    ))))
}

#[derive(Debug, Serialize)]
struct SummarizeRequest {
    #[serde(rename = "providerID")]
    provider_id: String,
    #[serde(rename = "modelID")]
    model_id: String,
    auto: bool,
}

pub async fn session_summarize(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
    session_id: &str,
    model: ModelSpec,
) -> Result<(), ExecutorError> {
    let req = SummarizeRequest {
        provider_id: model.provider_id,
        model_id: model.model_id,
        auto: false,
    };

    let resp = client
        .post(format!("{base_url}/session/{session_id}/summarize"))
        .query(&[("directory", directory)])
        .json(&req)
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(build_response_error(resp, "session.summarize").await);
    }

    let _ = resp
        .json::<bool>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;
    Ok(())
}

pub async fn list_commands(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Result<Vec<CommandInfo>, ExecutorError> {
    let resp = client
        .get(format!("{base_url}/command"))
        .query(&[("directory", directory)])
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(build_response_error(resp, "command.list").await);
    }

    resp.json::<Vec<CommandInfo>>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))
}

pub async fn list_agents(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Result<Vec<AgentInfo>, ExecutorError> {
    let resp = client
        .get(format!("{base_url}/agent"))
        .query(&[("directory", directory)])
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(build_response_error(resp, "agent.list").await);
    }

    resp.json::<Vec<AgentInfo>>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))
}

pub async fn config_get(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Result<ConfigResponse, ExecutorError> {
    let resp = client
        .get(format!("{base_url}/config"))
        .query(&[("directory", directory)])
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(build_response_error(resp, "config.get").await);
    }

    resp.json::<ConfigResponse>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))
}

pub async fn list_config_providers(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Result<ConfigProvidersResponse, ExecutorError> {
    let resp = client
        .get(format!("{base_url}/config/providers"))
        .query(&[("directory", directory)])
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(build_response_error(resp, "config.providers").await);
    }

    resp.json::<ConfigProvidersResponse>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))
}

pub async fn list_providers(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Result<ProviderListResponse, ExecutorError> {
    let resp = client
        .get(format!("{base_url}/provider"))
        .query(&[("directory", directory)])
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(build_response_error(resp, "provider.list").await);
    }

    resp.json::<ProviderListResponse>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))
}

pub async fn mcp_status(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Result<HashMap<String, Value>, ExecutorError> {
    let resp = client
        .get(format!("{base_url}/mcp"))
        .query(&[("directory", directory)])
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(build_response_error(resp, "mcp.status").await);
    }

    resp.json::<HashMap<String, Value>>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))
}

pub async fn lsp_status(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Result<Vec<LspStatus>, ExecutorError> {
    let resp = client
        .get(format!("{base_url}/lsp"))
        .query(&[("directory", directory)])
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(build_response_error(resp, "lsp.status").await);
    }

    resp.json::<Vec<LspStatus>>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))
}

pub async fn formatter_status(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Result<Vec<FormatterStatus>, ExecutorError> {
    let resp = client
        .get(format!("{base_url}/formatter"))
        .query(&[("directory", directory)])
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        return Err(build_response_error(resp, "formatter.status").await);
    }

    resp.json::<Vec<FormatterStatus>>()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))
}

async fn build_response_error(resp: reqwest::Response, context: &str) -> ExecutorError {
    let status = resp.status();
    let body = resp
        .text()
        .await
        .unwrap_or_else(|_| "<failed to read response body>".to_string());
    ExecutorError::Io(io::Error::other(format!(
        "OpenCode {context} failed: HTTP {status} {body}"
    )))
}

pub async fn send_abort(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
    session_id: &str,
) {
    let request = client
        .post(format!("{base_url}/session/{session_id}/abort"))
        .query(&[("directory", directory)]);

    let _ = tokio::time::timeout(Duration::from_millis(800), async move {
        let resp = request.send().await;
        if let Ok(resp) = resp {
            // Drain body
            let _ = resp.bytes().await;
        }
    })
    .await;
}

fn parse_model(model: &str) -> Option<ModelSpec> {
    let (provider_id, model_id) = match model.split_once('/') {
        Some((provider, rest)) => (provider.to_string(), rest.to_string()),
        None => (model.to_string(), String::new()),
    };

    Some(ModelSpec {
        provider_id,
        model_id,
    })
}

fn parse_model_strict(model: &str) -> Option<ModelSpec> {
    let (provider_id, model_id) = model.split_once('/')?;
    let model_id = model_id.trim();
    if model_id.is_empty() {
        return None;
    }
    Some(ModelSpec {
        provider_id: provider_id.to_string(),
        model_id: model_id.to_string(),
    })
}

pub async fn resolve_compaction_model(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
    configured_model: Option<&str>,
) -> Result<ModelSpec, ExecutorError> {
    if let Some(model) = configured_model.and_then(parse_model_strict) {
        return Ok(model);
    }

    let config = config_get(client, base_url, directory).await?;
    if let Some(model) = config.model.as_deref().and_then(parse_model_strict) {
        return Ok(model);
    }

    let providers = list_config_providers(client, base_url, directory).await?;
    let mut provider_ids: Vec<_> = providers.default.keys().cloned().collect();
    provider_ids.sort();

    if let Some(provider_id) = provider_ids.first()
        && let Some(model_id) = providers.default.get(provider_id)
    {
        return Ok(ModelSpec {
            provider_id: provider_id.clone(),
            model_id: model_id.clone(),
        });
    }

    if let Some(provider) = providers.providers.first()
        && let Some((model_id, _)) = provider.models.iter().next()
    {
        return Ok(ModelSpec {
            provider_id: provider.id.clone(),
            model_id: model_id.clone(),
        });
    }

    Err(ExecutorError::Io(io::Error::other(
        "OpenCode compaction requires a configured model",
    )))
}

pub async fn connect_event_stream(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
    last_event_id: Option<&str>,
) -> Result<reqwest::Response, ExecutorError> {
    let mut req = client
        .get(format!("{base_url}/event"))
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .query(&[("directory", directory)]);

    if let Some(last_event_id) = last_event_id {
        req = req.header("Last-Event-ID", last_event_id);
    }

    let resp = req
        .send()
        .await
        .map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "<failed to read response body>".to_string());
        return Err(ExecutorError::Io(io::Error::other(format!(
            "OpenCode event stream failed: HTTP {status} {body}"
        ))));
    }

    Ok(resp)
}

pub struct EventListenerConfig {
    pub client: reqwest::Client,
    pub base_url: String,
    pub directory: String,
    pub session_id: String,
    pub log_writer: LogWriter,
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
    pub auto_approve: bool,
    pub control_tx: mpsc::UnboundedSender<ControlEvent>,
    pub models_cache_key: String,
}

pub async fn spawn_event_listener(config: EventListenerConfig, initial_resp: reqwest::Response) {
    let EventListenerConfig {
        client,
        base_url,
        directory,
        session_id,
        log_writer,
        approvals,
        auto_approve,
        control_tx,
        models_cache_key,
    } = config;

    let mut seen_permissions: HashSet<String> = HashSet::new();
    let mut last_event_id: Option<String> = None;
    let mut base_retry_delay = Duration::from_millis(3000);
    let mut attempt: u32 = 0;
    let max_attempts: u32 = 20;
    let mut resp: Option<reqwest::Response> = Some(initial_resp);

    loop {
        let current_resp = match resp.take() {
            Some(r) => {
                attempt = 0;
                r
            }
            None => {
                match connect_event_stream(&client, &base_url, &directory, last_event_id.as_deref())
                    .await
                {
                    Ok(r) => {
                        attempt = 0;
                        r
                    }
                    Err(err) => {
                        let _ = log_writer
                            .log_error(format!("OpenCode event stream reconnect failed: {err}"))
                            .await;
                        attempt += 1;
                        if attempt >= max_attempts {
                            let _ = control_tx.send(ControlEvent::Disconnected);
                            return;
                        }

                        tokio::time::sleep(exponential_backoff(base_retry_delay, attempt)).await;
                        continue;
                    }
                }
            }
        };

        let outcome = process_event_stream(
            EventStreamContext {
                seen_permissions: &mut seen_permissions,
                client: &client,
                base_url: &base_url,
                directory: &directory,
                session_id: &session_id,
                log_writer: &log_writer,
                approvals: approvals.clone(),
                auto_approve,
                control_tx: &control_tx,
                base_retry_delay: &mut base_retry_delay,
                last_event_id: &mut last_event_id,
                models_cache_key: &models_cache_key,
            },
            current_resp,
        )
        .await;

        match outcome {
            Ok(EventStreamOutcome::Idle) | Ok(EventStreamOutcome::Terminal) => return,
            Ok(EventStreamOutcome::Disconnected) | Err(_) => {
                attempt += 1;
                if attempt >= max_attempts {
                    let _ = control_tx.send(ControlEvent::Disconnected);
                    return;
                }
            }
        }

        tokio::time::sleep(exponential_backoff(base_retry_delay, attempt)).await;
        resp = None;
    }
}

fn exponential_backoff(base: Duration, attempt: u32) -> Duration {
    let exp = attempt.saturating_sub(1).min(10);
    let mult = 1u32 << exp;
    base.checked_mul(mult)
        .unwrap_or(Duration::from_secs(30))
        .min(Duration::from_secs(30))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EventStreamOutcome {
    Idle,
    Terminal,
    Disconnected,
}

pub(super) struct EventStreamContext<'a> {
    seen_permissions: &'a mut HashSet<String>,
    pub client: &'a reqwest::Client,
    pub base_url: &'a str,
    pub directory: &'a str,
    pub session_id: &'a str,
    pub log_writer: &'a LogWriter,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    auto_approve: bool,
    control_tx: &'a mpsc::UnboundedSender<ControlEvent>,
    base_retry_delay: &'a mut Duration,
    last_event_id: &'a mut Option<String>,
    /// Cache key for model context windows, derived from config that affects available models.
    pub models_cache_key: &'a str,
}

async fn process_event_stream(
    ctx: EventStreamContext<'_>,
    resp: reqwest::Response,
) -> Result<EventStreamOutcome, ExecutorError> {
    let mut stream = resp.bytes_stream().eventsource();

    while let Some(evt) = stream.next().await {
        let evt = evt.map_err(|err| ExecutorError::Io(io::Error::other(err)))?;

        if !evt.id.trim().is_empty() {
            *ctx.last_event_id = Some(evt.id.trim().to_string());
        }
        if let Some(retry) = evt.retry {
            *ctx.base_retry_delay = retry;
        }

        let trimmed = evt.data.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(data) = serde_json::from_str::<Value>(trimmed) else {
            let _ = ctx
                .log_writer
                .log_error(format!(
                    "OpenCode event stream delivered non-JSON event payload: {trimmed}"
                ))
                .await;
            continue;
        };

        let Some(event_type) = data.get("type").and_then(Value::as_str) else {
            continue;
        };

        if !event_matches_session(event_type, &data, ctx.session_id) {
            continue;
        }

        let _ = ctx
            .log_writer
            .log_event(&OpencodeExecutorEvent::SdkEvent {
                event: data.clone(),
            })
            .await;

        match event_type {
            "message.updated" => {
                maybe_emit_token_usage(&ctx, &data).await;
            }
            "session.idle" => {
                let _ = ctx.control_tx.send(ControlEvent::Idle);
                return Ok(EventStreamOutcome::Idle);
            }
            "session.error" => {
                let error_type = data
                    .pointer("/properties/error/name")
                    .or_else(|| data.pointer("/properties/error/type"))
                    .and_then(Value::as_str)
                    .unwrap_or("unknown");
                let message = data
                    .pointer("/properties/error/data/message")
                    .or_else(|| data.pointer("/properties/error/message"))
                    .and_then(Value::as_str)
                    .unwrap_or("OpenCode session error")
                    .to_string();

                if error_type == "ProviderAuthError" {
                    let _ = ctx.control_tx.send(ControlEvent::AuthRequired { message });
                    return Ok(EventStreamOutcome::Terminal);
                }

                let _ = ctx.control_tx.send(ControlEvent::SessionError { message });
            }
            "permission.asked" => {
                let request_id = data
                    .pointer("/properties/id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();

                if request_id.is_empty() || !ctx.seen_permissions.insert(request_id.clone()) {
                    continue;
                }

                let tool_call_id = data
                    .pointer("/properties/tool/callID")
                    .and_then(Value::as_str)
                    .unwrap_or(&request_id)
                    .to_string();

                let permission = data
                    .pointer("/properties/permission")
                    .and_then(Value::as_str)
                    .unwrap_or("tool")
                    .to_string();

                let tool_input = data
                    .get("properties")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({}));

                let approvals = ctx.approvals.clone();
                let client = ctx.client.clone();
                let base_url = ctx.base_url.to_string();
                let directory = ctx.directory.to_string();
                let log_writer = ctx.log_writer.clone();
                let auto_approve = ctx.auto_approve;
                tokio::spawn(async move {
                    let status = request_permission_approval(
                        auto_approve,
                        approvals,
                        &permission,
                        tool_input,
                        &tool_call_id,
                    )
                    .await;

                    let _ = log_writer
                        .log_event(&OpencodeExecutorEvent::ApprovalResponse {
                            tool_call_id: tool_call_id.clone(),
                            status: status.clone(),
                        })
                        .await;

                    let (reply, message) = match status {
                        ApprovalStatus::Approved => ("once", None),
                        ApprovalStatus::Denied { reason } => {
                            let msg = reason
                                .unwrap_or_else(|| "User denied this tool use request".to_string())
                                .trim()
                                .to_string();
                            let msg = if msg.is_empty() {
                                "User denied this tool use request".to_string()
                            } else {
                                msg
                            };
                            ("reject", Some(msg))
                        }
                        ApprovalStatus::TimedOut => (
                            "reject",
                            Some(
                                "Approval request timed out; proceed without using this tool call."
                                    .to_string(),
                            ),
                        ),
                        ApprovalStatus::Pending => (
                            "reject",
                            Some(
                                "Approval request could not be completed; proceed without using this tool call."
                                    .to_string(),
                            ),
                        ),
                    };

                    // If we reject without a message, OpenCode treats it as a hard stop.
                    // Provide a message so the agent can continue with guidance.
                    let payload = if reply == "reject" {
                        serde_json::json!({ "reply": reply, "message": message.unwrap_or_else(|| "User denied this tool use request".to_string()) })
                    } else {
                        serde_json::json!({ "reply": reply })
                    };

                    let _ = client
                        .post(format!("{base_url}/permission/{request_id}/reply"))
                        .query(&[("directory", directory.as_str())])
                        .json(&payload)
                        .send()
                        .await;
                });
            }
            _ => {}
        }
    }

    Ok(EventStreamOutcome::Disconnected)
}

fn event_matches_session(event_type: &str, event: &Value, session_id: &str) -> bool {
    let extracted = match event_type {
        "message.updated" => event
            .pointer("/properties/info/sessionID")
            .and_then(Value::as_str),
        "message.part.updated" => event
            .pointer("/properties/part/sessionID")
            .and_then(Value::as_str),
        "permission.asked" | "permission.replied" | "session.idle" | "session.error" => event
            .pointer("/properties/sessionID")
            .and_then(Value::as_str),
        _ => event
            .pointer("/properties/sessionID")
            .and_then(Value::as_str)
            .or_else(|| {
                event
                    .pointer("/properties/info/sessionID")
                    .and_then(Value::as_str)
            })
            .or_else(|| {
                event
                    .pointer("/properties/part/sessionID")
                    .and_then(Value::as_str)
            }),
    };

    extracted == Some(session_id)
}

async fn request_permission_approval(
    auto_approve: bool,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    tool_name: &str,
    tool_input: Value,
    tool_call_id: &str,
) -> ApprovalStatus {
    if auto_approve {
        return ApprovalStatus::Approved;
    }

    let Some(approvals) = approvals else {
        return ApprovalStatus::Approved;
    };

    match approvals
        .request_tool_approval(tool_name, tool_input, tool_call_id)
        .await
    {
        Ok(status) => status,
        Err(
            ExecutorApprovalError::ServiceUnavailable | ExecutorApprovalError::SessionNotRegistered,
        ) => ApprovalStatus::Approved,
        Err(err) => ApprovalStatus::Denied {
            reason: Some(format!("Approval request failed: {err}")),
        },
    }
}
