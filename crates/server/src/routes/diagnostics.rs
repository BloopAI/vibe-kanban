//! Diagnostics endpoints for database and system monitoring.
//!
//! Provides access to database metrics, connection pool statistics,
//! and WAL file monitoring data.

use axum::{Router, extract::State, response::Json as ResponseJson, routing::get};
use db::{
    get_wal_size,
    metrics::{DbMetricsSnapshot, PoolStats},
    models::task_attempt::TaskAttempt,
};
use deployment::Deployment;
use serde::Serialize;
use services::services::{
    container::ContainerService,
    normalization_metrics::NormalizationMetricsSnapshot,
    worktree_manager::{DiskUsageStats, WorktreeManager},
};
use ts_rs::TS;
use utils::{assets::asset_dir, response::ApiResponse};

use crate::{DeploymentImpl, error::ApiError};

/// Complete diagnostics response including all database health metrics.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct DiagnosticsResponse {
    /// Database query and operation metrics.
    pub db_metrics: DbMetricsSnapshot,
    /// Connection pool statistics.
    pub pool_stats: PoolStats,
    /// Current WAL file size in bytes.
    pub wal_size_bytes: u64,
    /// WAL file size in human-readable format.
    pub wal_size_human: String,
    /// Normalization metrics (completion times, timeouts).
    pub normalization: NormalizationMetricsSnapshot,
}

/// Format bytes into human-readable string.
fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Get complete database diagnostics.
///
/// Returns metrics about database performance, connection pool health,
/// and WAL file status.
///
/// # Endpoint
/// `GET /api/diagnostics`
///
/// # Response
/// ```json
/// {
///   "success": true,
///   "data": {
///     "db_metrics": {
///       "queries_total": 12345,
///       "queries_slow": 5,
///       "query_avg_duration_ms": 12.5,
///       "retry_attempts": 3,
///       "retry_successes": 2,
///       "retry_failures": 1,
///       "busy_errors": 3,
///       "other_errors": 0,
///       "pool_acquires_total": 1000,
///       "pool_timeouts": 0,
///       "wal_size_bytes": 1048576,
///       "last_checkpoint_duration_ms": 45,
///       "latency_p50_ms": 5,
///       "latency_p95_ms": 25,
///       "latency_p99_ms": 100
///     },
///     "pool_stats": {
///       "size": 10,
///       "idle": 8,
///       "acquired": 2
///     },
///     "wal_size_bytes": 1048576,
///     "wal_size_human": "1.00 MB"
///   }
/// }
/// ```
async fn get_diagnostics(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<DiagnosticsResponse>>, ApiError> {
    let db = deployment.db();

    // Get metrics snapshot
    let db_metrics = db.metrics.snapshot();

    // Get pool statistics
    let pool_stats = db.metrics.get_pool_stats(&db.pool);

    // Get WAL file size
    let db_path = asset_dir().join("db.sqlite");
    let wal_size_bytes = get_wal_size(&db_path);
    let wal_size_human = format_bytes(wal_size_bytes);

    // Get normalization metrics from container service
    let normalization = deployment.container().normalization_metrics().snapshot();

    let response = DiagnosticsResponse {
        db_metrics,
        pool_stats,
        wal_size_bytes,
        wal_size_human,
        normalization,
    };

    Ok(ResponseJson(ApiResponse::success(response)))
}

/// Prometheus-compatible metrics endpoint.
///
/// Returns metrics in Prometheus text exposition format for integration
/// with external monitoring systems.
///
/// # Endpoint
/// `GET /api/diagnostics/prometheus`
async fn get_prometheus_metrics(State(deployment): State<DeploymentImpl>) -> String {
    let db = deployment.db();
    let metrics = db.metrics.snapshot();
    let pool_stats = db.metrics.get_pool_stats(&db.pool);
    let db_path = asset_dir().join("db.sqlite");
    let wal_size = get_wal_size(&db_path);
    let norm_metrics = deployment.container().normalization_metrics().snapshot();

    let mut output = String::new();

    // Query metrics
    output.push_str("# HELP vk_db_queries_total Total number of database queries\n");
    output.push_str("# TYPE vk_db_queries_total counter\n");
    output.push_str(&format!("vk_db_queries_total {}\n", metrics.queries_total));

    output.push_str("# HELP vk_db_queries_slow Number of slow queries (>100ms)\n");
    output.push_str("# TYPE vk_db_queries_slow counter\n");
    output.push_str(&format!("vk_db_queries_slow {}\n", metrics.queries_slow));

    output.push_str("# HELP vk_db_query_duration_avg_ms Average query duration in milliseconds\n");
    output.push_str("# TYPE vk_db_query_duration_avg_ms gauge\n");
    output.push_str(&format!(
        "vk_db_query_duration_avg_ms {:.2}\n",
        metrics.query_avg_duration_ms
    ));

    // Latency percentiles
    output.push_str("# HELP vk_db_latency_p50_ms 50th percentile query latency\n");
    output.push_str("# TYPE vk_db_latency_p50_ms gauge\n");
    output.push_str(&format!(
        "vk_db_latency_p50_ms {}\n",
        metrics.latency_p50_ms
    ));

    output.push_str("# HELP vk_db_latency_p95_ms 95th percentile query latency\n");
    output.push_str("# TYPE vk_db_latency_p95_ms gauge\n");
    output.push_str(&format!(
        "vk_db_latency_p95_ms {}\n",
        metrics.latency_p95_ms
    ));

    output.push_str("# HELP vk_db_latency_p99_ms 99th percentile query latency\n");
    output.push_str("# TYPE vk_db_latency_p99_ms gauge\n");
    output.push_str(&format!(
        "vk_db_latency_p99_ms {}\n",
        metrics.latency_p99_ms
    ));

    // Retry metrics
    output.push_str("# HELP vk_db_retry_attempts Total retry attempts due to SQLITE_BUSY\n");
    output.push_str("# TYPE vk_db_retry_attempts counter\n");
    output.push_str(&format!(
        "vk_db_retry_attempts {}\n",
        metrics.retry_attempts
    ));

    output.push_str("# HELP vk_db_retry_successes Successful retries\n");
    output.push_str("# TYPE vk_db_retry_successes counter\n");
    output.push_str(&format!(
        "vk_db_retry_successes {}\n",
        metrics.retry_successes
    ));

    output.push_str("# HELP vk_db_retry_failures Failed retries\n");
    output.push_str("# TYPE vk_db_retry_failures counter\n");
    output.push_str(&format!(
        "vk_db_retry_failures {}\n",
        metrics.retry_failures
    ));

    // Error metrics
    output.push_str("# HELP vk_db_busy_errors SQLITE_BUSY errors encountered\n");
    output.push_str("# TYPE vk_db_busy_errors counter\n");
    output.push_str(&format!("vk_db_busy_errors {}\n", metrics.busy_errors));

    output.push_str("# HELP vk_db_other_errors Other database errors\n");
    output.push_str("# TYPE vk_db_other_errors counter\n");
    output.push_str(&format!("vk_db_other_errors {}\n", metrics.other_errors));

    // Pool metrics
    output.push_str("# HELP vk_db_pool_size Total connections in pool\n");
    output.push_str("# TYPE vk_db_pool_size gauge\n");
    output.push_str(&format!("vk_db_pool_size {}\n", pool_stats.size));

    output.push_str("# HELP vk_db_pool_idle Idle connections in pool\n");
    output.push_str("# TYPE vk_db_pool_idle gauge\n");
    output.push_str(&format!("vk_db_pool_idle {}\n", pool_stats.idle));

    output.push_str("# HELP vk_db_pool_acquired Acquired connections in pool\n");
    output.push_str("# TYPE vk_db_pool_acquired gauge\n");
    output.push_str(&format!("vk_db_pool_acquired {}\n", pool_stats.acquired));

    output.push_str("# HELP vk_db_pool_acquires_total Total connection acquisitions\n");
    output.push_str("# TYPE vk_db_pool_acquires_total counter\n");
    output.push_str(&format!(
        "vk_db_pool_acquires_total {}\n",
        metrics.pool_acquires_total
    ));

    output.push_str("# HELP vk_db_pool_timeouts Pool acquisition timeouts\n");
    output.push_str("# TYPE vk_db_pool_timeouts counter\n");
    output.push_str(&format!("vk_db_pool_timeouts {}\n", metrics.pool_timeouts));

    // WAL metrics
    output.push_str("# HELP vk_db_wal_size_bytes WAL file size in bytes\n");
    output.push_str("# TYPE vk_db_wal_size_bytes gauge\n");
    output.push_str(&format!("vk_db_wal_size_bytes {}\n", wal_size));

    output.push_str("# HELP vk_db_checkpoint_duration_ms Last checkpoint duration\n");
    output.push_str("# TYPE vk_db_checkpoint_duration_ms gauge\n");
    output.push_str(&format!(
        "vk_db_checkpoint_duration_ms {}\n",
        metrics.last_checkpoint_duration_ms
    ));

    // Normalization metrics
    output.push_str("# HELP vk_normalization_total Total normalization operations\n");
    output.push_str("# TYPE vk_normalization_total counter\n");
    output.push_str(&format!("vk_normalization_total {}\n", norm_metrics.total));

    output.push_str("# HELP vk_normalization_timeouts Normalization timeout count\n");
    output.push_str("# TYPE vk_normalization_timeouts counter\n");
    output.push_str(&format!(
        "vk_normalization_timeouts {}\n",
        norm_metrics.timeouts
    ));

    output.push_str("# HELP vk_normalization_timeout_rate Normalization timeout rate (0-1)\n");
    output.push_str("# TYPE vk_normalization_timeout_rate gauge\n");
    output.push_str(&format!(
        "vk_normalization_timeout_rate {:.4}\n",
        norm_metrics.timeout_rate
    ));

    output.push_str(
        "# HELP vk_normalization_avg_duration_ms Average normalization duration in milliseconds\n",
    );
    output.push_str("# TYPE vk_normalization_avg_duration_ms gauge\n");
    output.push_str(&format!(
        "vk_normalization_avg_duration_ms {:.2}\n",
        norm_metrics.avg_duration_ms
    ));

    // Normalization latency buckets (histogram-style)
    output.push_str(
        "# HELP vk_normalization_latency_bucket Normalization latency distribution buckets\n",
    );
    output.push_str("# TYPE vk_normalization_latency_bucket gauge\n");
    output.push_str(&format!(
        "vk_normalization_latency_bucket{{le=\"0.1\"}} {}\n",
        norm_metrics.latency_buckets.under_100ms
    ));
    output.push_str(&format!(
        "vk_normalization_latency_bucket{{le=\"0.5\"}} {}\n",
        norm_metrics.latency_buckets.under_500ms
    ));
    output.push_str(&format!(
        "vk_normalization_latency_bucket{{le=\"1\"}} {}\n",
        norm_metrics.latency_buckets.under_1s
    ));
    output.push_str(&format!(
        "vk_normalization_latency_bucket{{le=\"2\"}} {}\n",
        norm_metrics.latency_buckets.under_2s
    ));
    output.push_str(&format!(
        "vk_normalization_latency_bucket{{le=\"5\"}} {}\n",
        norm_metrics.latency_buckets.under_5s
    ));
    output.push_str(&format!(
        "vk_normalization_latency_bucket{{le=\"+Inf\"}} {}\n",
        norm_metrics.latency_buckets.over_5s
    ));

    output
}

/// Get worktree disk usage statistics.
///
/// Returns information about the worktree directory, including total space used
/// and the largest worktrees. Each worktree includes an attempt_id if it matches
/// a known task attempt's container_ref.
///
/// # Endpoint
/// `GET /api/diagnostics/disk-usage`
async fn get_disk_usage(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<DiskUsageStats>>, ApiError> {
    let mut stats = WorktreeManager::get_disk_usage().await?;

    // Query all active task attempts with container refs
    let pool = &deployment.db().pool;
    if let Ok(refs) = TaskAttempt::find_by_worktree_deleted(pool).await {
        // Build a map of worktree directory names to attempt IDs
        // container_ref is a full path like "/path/to/worktrees/vk-1234abcd"
        // We need to match against the worktree name (last path component)
        let ref_map: std::collections::HashMap<String, uuid::Uuid> = refs
            .into_iter()
            .filter_map(|(id, path, _updated_at)| {
                std::path::Path::new(&path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| (name.to_string(), id))
            })
            .collect();

        // Populate attempt_id for each worktree
        for worktree in &mut stats.largest_worktrees {
            worktree.attempt_id = ref_map.get(&worktree.name).copied();
        }
    }

    Ok(ResponseJson(ApiResponse::success(stats)))
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/diagnostics", get(get_diagnostics))
        .route("/diagnostics/prometheus", get(get_prometheus_metrics))
        .route("/diagnostics/disk-usage", get(get_disk_usage))
}
