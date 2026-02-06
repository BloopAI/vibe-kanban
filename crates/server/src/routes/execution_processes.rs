use anyhow;
use axum::{
    Extension, Router,
    extract::{
        Path, Query, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    middleware::from_fn_with_state,
    response::{IntoResponse, Json as ResponseJson},
    routing::{get, post},
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessError, ExecutionProcessStatus},
    execution_process_repo_state::ExecutionProcessRepoState,
};
use deployment::Deployment;
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use serde::Deserialize;
use services::services::container::ContainerService;
use utils::{log_msg::LogMsg, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_execution_process_middleware};

#[derive(Debug, Deserialize)]
pub struct SessionExecutionProcessQuery {
    pub session_id: Uuid,
    /// If true, include soft-deleted (dropped) processes in results/stream
    #[serde(default)]
    pub show_soft_deleted: Option<bool>,
}

pub async fn get_execution_process_by_id(
    Extension(execution_process): Extension<ExecutionProcess>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

pub async fn stream_raw_logs_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Path(exec_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    // Check if the stream exists before upgrading the WebSocket
    let _stream = deployment
        .container()
        .stream_raw_logs(&exec_id)
        .await
        .ok_or_else(|| {
            ApiError::ExecutionProcess(ExecutionProcessError::ExecutionProcessNotFound)
        })?;

    Ok(ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_raw_logs_ws(socket, deployment, exec_id).await {
            tracing::warn!("raw logs WS closed: {}", e);
        }
    }))
}

async fn handle_raw_logs_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    exec_id: Uuid,
) -> anyhow::Result<()> {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use executors::logs::utils::patch::ConversationPatch;
    use utils::log_msg::LogMsg;

    // Get the raw stream and convert to JSON patches on-the-fly
    let raw_stream = deployment
        .container()
        .stream_raw_logs(&exec_id)
        .await
        .ok_or_else(|| anyhow::anyhow!("Execution process not found"))?;

    let counter = Arc::new(AtomicUsize::new(0));
    let mut stream = raw_stream.map_ok({
        let counter = counter.clone();
        move |m| match m {
            LogMsg::Stdout(content) => {
                let index = counter.fetch_add(1, Ordering::SeqCst);
                let patch = ConversationPatch::add_stdout(index, content);
                LogMsg::JsonPatch(patch).to_ws_message_unchecked()
            }
            LogMsg::Stderr(content) => {
                let index = counter.fetch_add(1, Ordering::SeqCst);
                let patch = ConversationPatch::add_stderr(index, content);
                LogMsg::JsonPatch(patch).to_ws_message_unchecked()
            }
            LogMsg::Finished => LogMsg::Finished.to_ws_message_unchecked(),
            _ => unreachable!("Raw stream should only have Stdout/Stderr/Finished"),
        }
    });

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Drain (and ignore) any client->server messages so pings/pongs work
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    // Forward server messages
    while let Some(item) = stream.next().await {
        match item {
            Ok(msg) => {
                if sender.send(msg).await.is_err() {
                    break; // client disconnected
                }
            }
            Err(e) => {
                tracing::error!("stream error: {}", e);
                break;
            }
        }
    }
    Ok(())
}

pub async fn stream_normalized_logs_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Path(exec_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let stream = deployment
        .container()
        .stream_normalized_logs(&exec_id)
        .await
        .ok_or_else(|| {
            ApiError::ExecutionProcess(ExecutionProcessError::ExecutionProcessNotFound)
        })?;

    // Convert the error type to anyhow::Error and turn TryStream -> Stream<Result<_, _>>
    let stream = stream.err_into::<anyhow::Error>().into_stream();

    Ok(ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_normalized_logs_ws(socket, stream).await {
            tracing::warn!("normalized logs WS closed: {}", e);
        }
    }))
}

async fn handle_normalized_logs_ws(
    socket: WebSocket,
    stream: impl futures_util::Stream<Item = anyhow::Result<LogMsg>> + Unpin + Send + 'static,
) -> anyhow::Result<()> {
    use axum::extract::ws::Message;
    use futures_util::FutureExt;

    let mut stream = stream;
    let (mut sender, mut receiver) = socket.split();
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    let mut profiler = WsProfiler::new();
    let mut wait_start = std::time::Instant::now();

    loop {
        // Phase 1: Block on the first message (the "wait" phase)
        let first = match stream.next().await {
            Some(item) => item,
            None => break, // stream ended
        };

        let wait_elapsed = wait_start.elapsed();
        profiler.time_waiting += wait_elapsed;

        let mut patches: Vec<json_patch::Patch> = Vec::new();
        let mut finished = false;
        let mut had_error = false;

        match first {
            Ok(LogMsg::JsonPatch(patch)) => {
                patches.push(patch);
            }
            Ok(LogMsg::Finished) => {
                finished = true;
            }
            Ok(_) => {}
            Err(e) => {
                tracing::error!("stream error: {}", e);
                had_error = true;
            }
        }

        // Phase 2: Drain all immediately-available messages (non-blocking)
        if !finished && !had_error {
            while let Some(Some(item)) = stream.next().now_or_never() {
                match item {
                    Ok(LogMsg::JsonPatch(patch)) => {
                        patches.push(patch);
                    }
                    Ok(LogMsg::Finished) => {
                        finished = true;
                        break;
                    }
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!("stream error: {}", e);
                        had_error = true;
                        break;
                    }
                }
            }
        }

        // Phase 3: Send the combined batch as a single WS frame
        let patches_in_batch = patches.len() as u64;
        if !patches.is_empty() {
            // Concatenate all operations from all patches into a single Patch
            let mut all_ops = patches.remove(0).0;
            for p in patches {
                all_ops.extend(p.0);
            }
            let combined = LogMsg::JsonPatch(json_patch::Patch(all_ops));

            let ser_start = std::time::Instant::now();
            let ws_msg = combined.to_ws_message_unchecked();
            let ser_elapsed = ser_start.elapsed();
            profiler.time_serializing += ser_elapsed;

            let msg_bytes = match &ws_msg {
                Message::Text(t) => t.len(),
                _ => 0,
            };

            let send_start = std::time::Instant::now();
            if sender.send(ws_msg).await.is_err() {
                break;
            }
            let send_elapsed = send_start.elapsed();
            profiler.time_sending += send_elapsed;
            profiler.total_messages += 1;
            profiler.total_bytes += msg_bytes as u64;

            profiler.record_event(
                wait_elapsed,
                ser_elapsed,
                send_elapsed,
                msg_bytes,
                patches_in_batch,
            );
        }

        // Phase 4: Handle terminal conditions
        if finished {
            let ws_msg = LogMsg::Finished.to_ws_message_unchecked();
            let _ = sender.send(ws_msg).await;
            break;
        }

        if had_error {
            break;
        }

        wait_start = std::time::Instant::now();
        profiler.maybe_flush();
    }

    profiler.write_summary();
    Ok(())
}

pub async fn stop_execution_process(
    Extension(execution_process): Extension<ExecutionProcess>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    deployment
        .container()
        .stop_execution(&execution_process, ExecutionProcessStatus::Killed)
        .await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn stream_execution_processes_by_session_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<SessionExecutionProcessQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_execution_processes_by_session_ws(
            socket,
            deployment,
            query.session_id,
            query.show_soft_deleted.unwrap_or(false),
        )
        .await
        {
            tracing::warn!("execution processes by session WS closed: {}", e);
        }
    })
}

async fn handle_execution_processes_by_session_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    session_id: uuid::Uuid,
    show_soft_deleted: bool,
) -> anyhow::Result<()> {
    // Get the raw stream and convert LogMsg to WebSocket messages
    let mut stream = deployment
        .events()
        .stream_execution_processes_for_session_raw(session_id, show_soft_deleted)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Drain (and ignore) any client->server messages so pings/pongs work
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    // Forward server messages
    while let Some(item) = stream.next().await {
        match item {
            Ok(msg) => {
                if sender.send(msg).await.is_err() {
                    break; // client disconnected
                }
            }
            Err(e) => {
                tracing::error!("stream error: {}", e);
                break;
            }
        }
    }
    Ok(())
}

pub async fn get_execution_process_repo_states(
    Extension(execution_process): Extension<ExecutionProcess>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ExecutionProcessRepoState>>>, ApiError> {
    let pool = &deployment.db().pool;
    let repo_states =
        ExecutionProcessRepoState::find_by_execution_process_id(pool, execution_process.id).await?;
    Ok(ResponseJson(ApiResponse::success(repo_states)))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let workspace_id_router = Router::new()
        .route("/", get(get_execution_process_by_id))
        .route("/stop", post(stop_execution_process))
        .route("/repo-states", get(get_execution_process_repo_states))
        .route("/raw-logs/ws", get(stream_raw_logs_ws))
        .route("/normalized-logs/ws", get(stream_normalized_logs_ws))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_execution_process_middleware,
        ));

    let workspaces_router = Router::new()
        .route(
            "/stream/session/ws",
            get(stream_execution_processes_by_session_ws),
        )
        .nest("/{id}", workspace_id_router);

    Router::new().nest("/execution-processes", workspaces_router)
}

// ── WebSocket delivery profiler ─────────────────────────────────────────

use std::{
    io::Write as IoWrite,
    path::PathBuf,
    time::{Duration, Instant},
};

#[derive(serde::Serialize)]
struct WsEventRecord {
    ts_us: u64,
    wait_us: u64,
    serialize_us: u64,
    send_us: u64,
    msg_bytes: usize,
    patches_in_batch: u64,
}

struct WsProfiler {
    start: Instant,
    time_waiting: Duration,
    time_serializing: Duration,
    time_sending: Duration,
    total_messages: u64,
    total_bytes: u64,
    total_patches_batched: u64,
    max_batch_size: u64,
    event_log: Vec<WsEventRecord>,
    output_path: PathBuf,
    last_flush: Instant,
}

impl WsProfiler {
    fn new() -> Self {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let profiling_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiling");
        let _ = std::fs::create_dir_all(&profiling_dir);
        let output_path = profiling_dir.join(format!("ws_delivery_profile_{}.jsonl", timestamp));
        tracing::info!("WS delivery profiler writing to: {}", output_path.display());

        let now = Instant::now();
        Self {
            start: now,
            time_waiting: Duration::ZERO,
            time_serializing: Duration::ZERO,
            time_sending: Duration::ZERO,
            total_messages: 0,
            total_bytes: 0,
            total_patches_batched: 0,
            max_batch_size: 0,
            event_log: Vec::with_capacity(1024),
            output_path,
            last_flush: now,
        }
    }

    fn record_event(
        &mut self,
        wait_elapsed: Duration,
        ser_elapsed: Duration,
        send_elapsed: Duration,
        msg_bytes: usize,
        patches_in_batch: u64,
    ) {
        self.total_patches_batched += patches_in_batch;
        self.max_batch_size = self.max_batch_size.max(patches_in_batch);
        self.event_log.push(WsEventRecord {
            ts_us: self.start.elapsed().as_micros() as u64,
            wait_us: wait_elapsed.as_micros() as u64,
            serialize_us: ser_elapsed.as_micros() as u64,
            send_us: send_elapsed.as_micros() as u64,
            msg_bytes,
            patches_in_batch,
        });
    }

    fn maybe_flush(&mut self) {
        if self.event_log.len() >= 1000 || self.last_flush.elapsed() > Duration::from_secs(5) {
            self.flush_events();
            self.last_flush = Instant::now();
        }
    }

    fn flush_events(&mut self) {
        if self.event_log.is_empty() {
            return;
        }
        let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.output_path)
        else {
            tracing::warn!(
                "Failed to open WS profiler output: {}",
                self.output_path.display()
            );
            self.event_log.clear();
            return;
        };

        for record in self.event_log.drain(..) {
            if let Ok(json) = serde_json::to_string(&record) {
                let _ = writeln!(file, "{}", json);
            }
        }
    }

    fn write_summary(&mut self) {
        self.flush_events();

        let wall_clock = self.start.elapsed();

        let summary = serde_json::json!({
            "type": "SUMMARY",
            "total_wall_clock_ms": wall_clock.as_millis() as u64,
            "time_waiting_for_stream_ms": self.time_waiting.as_millis() as u64,
            "time_waiting_pct": if wall_clock.as_micros() > 0 {
                (self.time_waiting.as_micros() as f64 / wall_clock.as_micros() as f64 * 100.0) as u64
            } else { 0 },
            "time_serializing_ms": self.time_serializing.as_millis() as u64,
            "time_sending_ms": self.time_sending.as_millis() as u64,
            "total_ws_frames": self.total_messages,
            "total_patches_batched": self.total_patches_batched,
            "avg_patches_per_frame": if self.total_messages > 0 { self.total_patches_batched / self.total_messages } else { 0 },
            "max_batch_size": self.max_batch_size,
            "total_bytes": self.total_bytes,
            "avg_msg_bytes": if self.total_messages > 0 { self.total_bytes / self.total_messages } else { 0 },
            "per_msg_avg_us": {
                "serialize": if self.total_messages > 0 { self.time_serializing.as_micros() as u64 / self.total_messages } else { 0 },
                "send": if self.total_messages > 0 { self.time_sending.as_micros() as u64 / self.total_messages } else { 0 },
            },
        });

        if let Ok(json) = serde_json::to_string(&summary)
            && let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.output_path)
        {
            let _ = writeln!(file, "{}", json);
        }

        tracing::info!(
            wall_clock_ms = wall_clock.as_millis() as u64,
            waiting_pct = if wall_clock.as_micros() > 0 {
                (self.time_waiting.as_micros() as f64 / wall_clock.as_micros() as f64 * 100.0)
                    as u64
            } else {
                0
            },
            serialize_ms = self.time_serializing.as_millis() as u64,
            send_ms = self.time_sending.as_millis() as u64,
            total_messages = self.total_messages,
            total_bytes = self.total_bytes,
            "WS delivery profiler summary"
        );
    }
}
