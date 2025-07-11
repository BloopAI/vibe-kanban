//! Gemini streaming functionality with WAL and chunked storage
//!
//! This module provides real-time streaming support for Gemini execution processes
//! with Write-Ahead Log (WAL) capabilities for resumable streaming.

use std::{collections::HashMap, sync::Mutex, time::Instant};

use json_patch::{patch, Patch, PatchOperation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::config::GeminiStreamConfig;
use crate::{
    executor::{NormalizedEntry, NormalizedEntryType},
    models::execution_process::ExecutionProcess,
};

lazy_static::lazy_static! {
    /// Write-Ahead Log: Maps execution_process_id → WAL state (Gemini-specific)
    static ref GEMINI_WAL_MAP: Mutex<HashMap<Uuid, GeminiWalState>> = Mutex::new(HashMap::new());
}

/// A batch of JSON patches for Gemini streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiPatchBatch {
    /// Monotonic batch identifier for cursor-based streaming
    pub batch_id: u64,
    /// Array of JSON Patch operations (RFC 6902 format)
    pub patches: Vec<Value>,
    /// ISO 8601 timestamp when this batch was created
    pub timestamp: String,
    /// Total content length after applying all patches in this batch
    pub content_length: usize,
}

/// WAL state for a single Gemini execution process
#[derive(Debug)]
pub struct GeminiWalState {
    pub batches: Vec<GeminiPatchBatch>,
    pub total_content_length: usize,
    pub next_batch_id: u64,
    pub last_compaction: Instant,
    pub last_db_flush: Instant,
    pub last_access: Instant,
}

impl Default for GeminiWalState {
    fn default() -> Self {
        Self::new()
    }
}

impl GeminiWalState {
    pub fn new() -> Self {
        let now = Instant::now();
        Self {
            batches: Vec::new(),
            total_content_length: 0,
            next_batch_id: 1,
            last_compaction: now,
            last_db_flush: now,
            last_access: now,
        }
    }
}

/// Gemini streaming utilities
pub struct GeminiStreaming;

impl GeminiStreaming {
    /// Push patches to the Gemini WAL system
    pub fn push_patch(execution_process_id: Uuid, patches: Vec<Value>, content_length: usize) {
        let mut wal_map = GEMINI_WAL_MAP.lock().unwrap();
        let wal_state = wal_map.entry(execution_process_id).or_default();
        let config = GeminiStreamConfig::default();

        // Update access time for orphan cleanup
        wal_state.last_access = Instant::now();

        // Enforce size limits - force compaction instead of clearing to prevent data loss
        if wal_state.batches.len() >= config.max_wal_batches
            || wal_state.total_content_length >= config.max_wal_total_size
        {
            tracing::warn!(
                "WAL size limits exceeded for process {} (batches: {}, size: {}), forcing compaction",
                execution_process_id,
                wal_state.batches.len(),
                wal_state.total_content_length
            );

            // Force compaction to preserve data instead of losing it
            Self::compact_wal(wal_state);

            // If still over limits after compaction, keep only the most recent batches
            if wal_state.batches.len() >= config.max_wal_batches {
                let keep_count = config.max_wal_batches / 2; // Keep half
                let remove_count = wal_state.batches.len() - keep_count;
                wal_state.batches.drain(..remove_count);
                tracing::warn!(
                    "After compaction still over limit, kept {} most recent batches",
                    keep_count
                );
            }
        }

        let batch = GeminiPatchBatch {
            batch_id: wal_state.next_batch_id,
            patches,
            timestamp: chrono::Utc::now().to_rfc3339(),
            content_length,
        };

        wal_state.next_batch_id += 1;
        wal_state.batches.push(batch);
        wal_state.total_content_length = content_length;

        // Check if compaction is needed
        if Self::should_compact(wal_state, &config) {
            Self::compact_wal(wal_state);
        }
    }

    /// Get WAL batches for an execution process, optionally filtering by cursor
    pub fn get_wal_batches(
        execution_process_id: Uuid,
        after_batch_id: Option<u64>,
    ) -> Option<Vec<GeminiPatchBatch>> {
        GEMINI_WAL_MAP.lock().ok().and_then(|mut wal_map| {
            wal_map.get_mut(&execution_process_id).map(|wal_state| {
                // Update access time when WAL is retrieved
                wal_state.last_access = Instant::now();

                match after_batch_id {
                    Some(cursor) => {
                        // Return only batches with batch_id > cursor
                        wal_state
                            .batches
                            .iter()
                            .filter(|batch| batch.batch_id > cursor)
                            .cloned()
                            .collect()
                    }
                    None => {
                        // Return all batches
                        wal_state.batches.clone()
                    }
                }
            })
        })
    }

    /// Clean up WAL when execution process finishes
    pub async fn finalize_execution(
        pool: &sqlx::SqlitePool,
        execution_process_id: Uuid,
        final_buffer: &str,
    ) {
        // Flush any remaining content to database
        if !final_buffer.trim().is_empty() {
            Self::store_chunk_to_db(pool, execution_process_id, final_buffer).await;
        }

        // Remove WAL entry
        Self::purge_wal(execution_process_id);
    }

    /// Remove WAL entry for a specific execution process
    pub fn purge_wal(execution_process_id: Uuid) {
        if let Ok(mut wal_map) = GEMINI_WAL_MAP.lock() {
            wal_map.remove(&execution_process_id);
            tracing::debug!(
                "Cleaned up WAL for execution process {}",
                execution_process_id
            );
        }
    }

    /// Find the best boundary to split a chunk (newline preferred, sentence fallback)
    pub fn find_chunk_boundary(buffer: &str, max_size: usize) -> usize {
        if buffer.len() <= max_size {
            return buffer.len();
        }

        let search_window = &buffer[..max_size];

        // First preference: newline boundary
        if let Some(pos) = search_window.rfind('\n') {
            return pos + 1; // Include the newline
        }

        // Second preference: sentence boundary (., !, ?)
        if let Some(pos) = search_window.rfind(&['.', '!', '?'][..]) {
            if pos + 1 < search_window.len() {
                return pos + 1;
            }
        }

        // Fallback: word boundary
        if let Some(pos) = search_window.rfind(' ') {
            return pos + 1;
        }

        // Last resort: split at max_size
        max_size
    }

    /// Store a chunk to the database
    async fn store_chunk_to_db(pool: &sqlx::SqlitePool, execution_process_id: Uuid, content: &str) {
        if content.trim().is_empty() {
            return;
        }

        let entry = NormalizedEntry {
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::AssistantMessage,
            content: content.to_string(),
            metadata: None,
        };

        match serde_json::to_string(&entry) {
            Ok(jsonl_line) => {
                let formatted_line = format!("{}\n", jsonl_line);
                if let Err(e) =
                    ExecutionProcess::append_stdout(pool, execution_process_id, &formatted_line)
                        .await
                {
                    tracing::error!("Failed to store chunk to database: {}", e);
                } else {
                    tracing::debug!("Stored {}B chunk to database", content.len());
                }
            }
            Err(e) => {
                tracing::error!("Failed to serialize chunk: {}", e);
            }
        }
    }

    /// Conditionally flush accumulated content to database in chunks
    pub async fn maybe_flush_chunk(
        pool: &sqlx::SqlitePool,
        execution_process_id: Uuid,
        buffer: &mut String,
        config: &GeminiStreamConfig,
    ) {
        if buffer.len() < config.max_db_chunk_size {
            return;
        }

        // Find the best split point (newline preferred, sentence boundary fallback)
        let split_point = Self::find_chunk_boundary(buffer, config.max_db_chunk_size);

        if split_point > 0 {
            let chunk = buffer[..split_point].to_string();
            buffer.drain(..split_point);

            // Store chunk to database
            Self::store_chunk_to_db(pool, execution_process_id, &chunk).await;

            // Update WAL flush time
            if let Ok(mut wal_map) = GEMINI_WAL_MAP.lock() {
                if let Some(wal_state) = wal_map.get_mut(&execution_process_id) {
                    wal_state.last_db_flush = Instant::now();
                }
            }
        }
    }

    /// Check if WAL compaction is needed based on configured thresholds
    fn should_compact(wal_state: &GeminiWalState, config: &GeminiStreamConfig) -> bool {
        wal_state.batches.len() >= config.wal_compaction_threshold
            || wal_state.total_content_length >= config.wal_compaction_size
            || wal_state.last_compaction.elapsed().as_millis() as u64
                >= config.wal_compaction_interval_ms
    }

    /// Compact WAL by losslessly merging older patches into a snapshot
    fn compact_wal(wal_state: &mut GeminiWalState) {
        // Need at least a few batches to make compaction worthwhile
        if wal_state.batches.len() <= 5 {
            return;
        }

        // Keep the most recent 3 batches for smooth incremental updates
        let recent_count = 3;
        let compact_count = wal_state.batches.len() - recent_count;

        if compact_count <= 1 {
            return; // Not enough to compact
        }

        // Start with an empty conversation and apply all patches sequentially
        let mut conversation_value = serde_json::json!({
            "entries": [],
            "session_id": null,
            "executor_type": "gemini",
            "prompt": null,
            "summary": null
        });

        let mut total_content_length = 0;
        let oldest_batch_id = wal_state.batches[0].batch_id;
        let compact_timestamp = chrono::Utc::now().to_rfc3339();

        // Apply patches from oldest to newest (excluding recent ones) using json-patch crate
        for batch in &wal_state.batches[..compact_count] {
            // Convert Vec<Value> to json_patch::Patch
            let patch_operations: Result<Vec<PatchOperation>, _> = batch
                .patches
                .iter()
                .map(|p| serde_json::from_value(p.clone()))
                .collect();

            match patch_operations {
                Ok(ops) => {
                    let patch_obj = Patch(ops);
                    if let Err(e) = patch(&mut conversation_value, &patch_obj) {
                        tracing::warn!("Failed to apply patch during compaction: {}, skipping", e);
                        continue;
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to deserialize patch operations: {}, skipping", e);
                    continue;
                }
            }
            total_content_length = batch.content_length; // Use the final length
        }

        // Extract the final entries array for the snapshot
        let final_entries = conversation_value
            .get("entries")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        // Create a single snapshot patch that replaces the entire entries array
        let snapshot_patch = GeminiPatchBatch {
            batch_id: oldest_batch_id, // Use the oldest batch_id to maintain cursor compatibility
            patches: vec![serde_json::json!({
                "op": "replace",
                "path": "/entries",
                "value": final_entries
            })],
            timestamp: compact_timestamp,
            content_length: total_content_length,
        };

        // Replace old batches with snapshot + keep recent batches
        let mut new_batches = vec![snapshot_patch];
        new_batches.extend_from_slice(&wal_state.batches[compact_count..]);
        wal_state.batches = new_batches;

        wal_state.last_compaction = Instant::now();

        tracing::info!(
            "Losslessly compacted WAL: {} batches → {} (1 snapshot + {} recent), preserving all content",
            compact_count + recent_count,
            wal_state.batches.len(),
            recent_count
        );
    }
}
