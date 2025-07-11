use std::{str::FromStr, time::Duration};

use axum::{
    extract::{Path, Query, State},
    response::sse::{Event, Sse},
    routing::get,
    Router,
};
use futures_util::stream::Stream;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    executors::gemini::GeminiExecutor,
    models::execution_process::{ExecutionProcess, ExecutionProcessStatus},
};

/// Interval for DB tail polling (ms) - now blazing fast for real-time updates
const TAIL_INTERVAL_MS: u64 = 100;

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
        let mut last_entry_count: usize = 0;
        let mut interval = tokio::time::interval(Duration::from_millis(poll_interval));
        let mut last_seen_batch_id: u64 = query.since_batch_id.unwrap_or(0); // Cursor for WAL streaming
        let mut fallback_batch_id: u64 = query.since_batch_id.map(|id| id + 1).unwrap_or(1); // Monotonic batch ID for fallback polling

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
                        let batch_data = serde_json::json!({
                            "batch_id": batch.batch_id,
                            "patches": batch.patches
                        });
                        let json = serde_json::to_string(&batch_data).unwrap_or_default();
                        yield Ok(Event::default().event("patch").data(json));
                        // Update cursor to highest batch_id seen
                        last_seen_batch_id = batch.batch_id.max(last_seen_batch_id);
                    }
                }
            } else {
                // Fallback: Database polling for non-streaming executors
                // Use normalized logs from the REST endpoint approach for consistency
                if let Ok(Some(proc)) = ExecutionProcess::find_by_id(&app_state.db_pool, process_id).await {
                    let stdout = proc.stdout.unwrap_or_default();
                    if stdout.len() > last_len {
                        let new_chunk = &stdout[last_len..];
                        last_len = stdout.len();

                        // Get the full stdout content and normalize it properly
                        if !new_chunk.trim().is_empty() {
                            // Determine executor type and create appropriate executor for normalization
                            let executor_type = proc.executor_type.as_deref().unwrap_or("unknown");
                            if let Ok(executor_config) = crate::executor::ExecutorConfig::from_str(executor_type) {
                                let executor = executor_config.create_executor();

                                // Use working directory for normalization
                                let working_dir = &proc.working_directory;

                                // Normalize the full stdout content to get proper conversation structure
                                if let Ok(normalized) = executor.normalize_logs(&stdout, working_dir) {
                                    // Use exact entry count tracking instead of flawed ratio calculation
                                    let new_entries = &normalized.entries[last_entry_count..];

                                    if !new_entries.is_empty() {
                                        let mut patch = Vec::<Value>::new();

                                        // Add patches for new entries
                                        for entry in new_entries {
                                            patch.push(serde_json::json!({
                                                "op": "add",
                                                "path": "/entries/-",
                                                "value": entry
                                            }));
                                        }

                                        if !patch.is_empty() {
                                            // Use same format as fast-path for backward compatibility
                                            // Generate monotonic batch_id for fallback to enable deduplication
                                            let batch_data = serde_json::json!({
                                                "batch_id": fallback_batch_id,
                                                "patches": patch
                                            });
                                            let json = serde_json::to_string(&batch_data).unwrap_or_default();
                                            yield Ok(Event::default().event("patch").data(json));

                                            // Increment batch_id for next patch
                                            fallback_batch_id += 1;
                                            // Update exact entry count after successful send
                                            last_entry_count = normalized.entries.len();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
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
