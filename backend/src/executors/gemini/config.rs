//! Gemini executor configuration and environment variable resolution
//!
//! This module contains configuration structures and functions for the Gemini executor,
//! including environment variable resolution for runtime parameters.

/// Configuration for Gemini WAL compaction and DB chunking
#[derive(Debug, Clone)]
pub struct GeminiStreamConfig {
    pub max_db_chunk_size: usize,
    pub wal_compaction_threshold: usize,
    pub wal_compaction_size: usize,
    pub wal_compaction_interval_ms: u64,
    pub max_wal_batches: usize,
    pub max_wal_total_size: usize,
}

impl Default for GeminiStreamConfig {
    fn default() -> Self {
        Self {
            max_db_chunk_size: max_message_size(),
            wal_compaction_threshold: 40,
            wal_compaction_size: max_message_size() * 2,
            wal_compaction_interval_ms: 30000,
            max_wal_batches: 100,
            max_wal_total_size: 1024 * 1024, // 1MB per process
        }
    }
}

// Constants for configuration
/// Size-based streaming configuration
pub const DEFAULT_MAX_CHUNK_SIZE: usize = 5120; // bytes (read buffer size)
pub const DEFAULT_MAX_DISPLAY_SIZE: usize = 2000; // bytes (SSE emission threshold for smooth UI)
pub const DEFAULT_MAX_MESSAGE_SIZE: usize = 8000; // bytes (message boundary for new assistant entries)
pub const DEFAULT_MAX_LATENCY_MS: u64 = 50; // milliseconds

/// Resolve MAX_CHUNK_SIZE from env or fallback
pub fn max_chunk_size() -> usize {
    std::env::var("GEMINI_CLI_MAX_CHUNK_SIZE")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(DEFAULT_MAX_CHUNK_SIZE)
}

/// Resolve MAX_DISPLAY_SIZE from env or fallback
pub fn max_display_size() -> usize {
    std::env::var("GEMINI_CLI_MAX_DISPLAY_SIZE")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(DEFAULT_MAX_DISPLAY_SIZE)
}

/// Resolve MAX_MESSAGE_SIZE from env or fallback
pub fn max_message_size() -> usize {
    std::env::var("GEMINI_CLI_MAX_MESSAGE_SIZE")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(DEFAULT_MAX_MESSAGE_SIZE)
}

/// Resolve MAX_LATENCY_MS from env or fallback
pub fn max_latency_ms() -> u64 {
    std::env::var("GEMINI_CLI_MAX_LATENCY_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(DEFAULT_MAX_LATENCY_MS)
}
