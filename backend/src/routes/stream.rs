use std::time::Duration;

use axum::{
    extract::{Path, Query, State},
    response::sse::{Event, Sse},
    routing::get,
    Router,
};
use futures_util::stream::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    executors::gemini::GeminiExecutor,
    models::execution_process::{ExecutionProcess, ExecutionProcessStatus},
};

/// Interval for DB tail polling (ms) - now blazing fast for real-time updates
const TAIL_INTERVAL_MS: u64 = 100;

/// Structured batch data for SSE streaming
#[derive(Serialize)]
struct BatchData {
    batch_id: u64,
    patches: Vec<Value>,
}

/// Query parameters for resumable SSE streaming
#[derive(Debug, Deserialize)]
pub struct StreamQuery {
    /// Optional cursor to resume streaming from specific batch ID
    since_batch_id: Option<u64>,
}

/// SSE handler for incremental normalized-logs JSON-Patch streaming
///
/// GET /api/projects/:project_id/execution-processes/:process_id/normalized-logs/stream?since_batch_id=123
pub async fn normalized_logs_stream(
    Path((_project_id, process_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<StreamQuery>,
    State(app_state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    // Check if this is a Gemini executor (only executor with streaming support)
    let is_gemini = match ExecutionProcess::find_by_id(&app_state.db_pool, process_id).await {
        Ok(Some(process)) => process.executor_type.as_deref() == Some("gemini"),
        _ => {
            tracing::warn!(
                "Failed to find execution process {} for SSE streaming",
                process_id
            );
            false
        }
    };

    // Use blazing fast polling interval for Gemini (only streaming executor)
    let poll_interval = if is_gemini { 50 } else { TAIL_INTERVAL_MS };

    // Stream that yields patches from WAL (fast-path) or DB tail (fallback)
    let stream = async_stream::stream! {
        // Track previous stdout length and entry count for database polling fallback
        let mut last_len: usize = 0;
        let mut last_entry_count: usize = query.since_batch_id.unwrap_or(1) as usize;
        let mut interval = tokio::time::interval(Duration::from_millis(poll_interval));
        let mut last_seen_batch_id: u64 = query.since_batch_id.unwrap_or(0); // Cursor for WAL streaming

        // Monotonic batch ID for fallback polling (always start at 1)
        let since = query.since_batch_id.unwrap_or(1);
        let mut fallback_batch_id: u64 = since + 1;

        // Fast catch-up phase for resumable streaming
        if let Some(since_batch) = query.since_batch_id {
            if !is_gemini {
                // Load current process state to get all available entries
                if let Ok(Some(proc)) = ExecutionProcess::find_by_id(&app_state.db_pool, process_id).await {
                    if let Some(stdout) = &proc.stdout {
                        // Create executor and normalize logs to get all entries
                        if let Some(executor) = proc.executor_type
                            .as_deref()
                            .unwrap_or("unknown")
                            .parse::<crate::executor::ExecutorConfig>()
                            .ok()
                            .map(|cfg| cfg.create_executor())
                        {
                            if let Ok(normalized) = executor.normalize_logs(stdout, &proc.working_directory) {
                            // Send all entries after since_batch_id immediately
                            let start_entry = since_batch as usize;
                            let catch_up_entries = normalized.entries.get(start_entry..).unwrap_or(&[]);

                            for (i, entry) in catch_up_entries.iter().enumerate() {
                                let batch_data = BatchData {
                                    batch_id: since_batch + 1 + i as u64,
                                    patches: vec![serde_json::json!({
                                        "op": "add",
                                        "path": "/entries/-",
                                        "value": entry
                                    })],
                                };
                                yield Ok(Event::default().event("patch").data(serde_json::to_string(&batch_data).unwrap_or_default()));
                            }

                                // Update cursors to current state
                                last_entry_count = normalized.entries.len();
                                fallback_batch_id = since_batch + 1 + catch_up_entries.len() as u64;
                                last_len = stdout.len();
                            }
                        }
                    }
                }
            }
        }

        loop {
            interval.tick().await;

            // Check process status first
            let process_status = match ExecutionProcess::find_by_id(&app_state.db_pool, process_id).await {
                Ok(Some(proc)) => proc.status,
                _ => {
                    tracing::warn!("Execution process {} not found during SSE streaming", process_id);
                    break;
                }
            };

            if is_gemini {
                // Gemini streaming: Read from Gemini WAL using cursor
                let cursor = if last_seen_batch_id == 0 { None } else { Some(last_seen_batch_id) };
                if let Some(new_batches) = GeminiExecutor::get_wal_batches(process_id, cursor) {
                    // Send any new batches since last cursor
                    for batch in &new_batches {
                        // Send full batch including batch_id for cursor tracking
                        let batch_data = BatchData {
                            batch_id: batch.batch_id,
                            patches: batch.patches.clone(),
                        };
                        let json = serde_json::to_string(&batch_data).unwrap_or_default();
                        yield Ok(Event::default().event("patch").data(json));
                        // Update cursor to highest batch_id seen
                        last_seen_batch_id = batch.batch_id.max(last_seen_batch_id);
                    }
                }
            } else {
                // Fallback: Database polling for non-streaming executors
                // 1. Load the process
                    let proc = match ExecutionProcess::find_by_id(&app_state.db_pool, process_id)
                    .await
                    .ok()
                    .flatten()
                {
                    Some(p) => p,
                    None => {
                        tracing::warn!("Execution process {} not found during SSE polling", process_id);
                        continue;
                    }
                };

                // 2. Grab the stdout and check if there's new content
                let stdout = match proc.stdout {
                    Some(ref s) if s.len() > last_len && !s[last_len..].trim().is_empty() => s.clone(),
                    _ => continue, // no new output
                };

                // 3. Instantiate the right executor
                let executor = match proc.executor_type
                    .as_deref()
                    .unwrap_or("unknown")
                    .parse::<crate::executor::ExecutorConfig>()
                    .ok()
                    .map(|cfg| cfg.create_executor())
                {
                    Some(exec) => exec,
                    None => {
                        tracing::warn!(
                            "Unknown executor '{}' for process {}",
                            proc.executor_type.unwrap_or_default(),
                            process_id
                        );
                        continue;
                    }
                };

                // 4. Normalize logs
                let normalized = match executor.normalize_logs(&stdout, &proc.working_directory) {
                    Ok(norm) => norm,
                    Err(err) => {
                        tracing::error!(
                            "Failed to normalize logs for process {}: {}",
                            process_id,
                            err
                        );
                        continue;
                    }
                };

                if last_entry_count > normalized.entries.len() {
                    continue;
                }

                // 5. Compute patches for any new entries
                if last_entry_count >= normalized.entries.len() {
                    continue;
                }
                let new_entries = [&normalized.entries[last_entry_count]];
                let patches: Vec<Value> = new_entries
                    .iter()
                    .map(|entry| serde_json::json!({
                        "op": "add",
                        "path": "/entries/-",
                        "value": entry
                    }))
                    .collect();

                // 6. Emit the batch
                let batch_data = BatchData {
                    batch_id: fallback_batch_id - 1,
                    patches,
                };
                let json = serde_json::to_string(&batch_data).unwrap_or_default();
                yield Ok(Event::default().event("patch").data(json));

                // 7. Update our cursors
                fallback_batch_id += 1;
                last_entry_count += 1;
                last_len = stdout.len();
            }

            // Stop streaming when process completed
            if process_status != ExecutionProcessStatus::Running {
                break;
            }
        }
    };

    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default())
}

/// Router exposing `/normalized-logs/stream`
pub fn stream_router() -> Router<AppState> {
    Router::new().route(
        "/projects/:project_id/execution-processes/:process_id/normalized-logs/stream",
        get(normalized_logs_stream),
    )
}
