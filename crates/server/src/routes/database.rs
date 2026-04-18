//! Database statistics and maintenance API routes.
//!
//! Provides endpoints for:
//! - GET /api/database/stats - Retrieve database statistics
//! - POST /api/database/vacuum - Run VACUUM to reclaim space
//! - POST /api/database/analyze - Run ANALYZE for query optimisation
//! - GET /api/database/archived-stats - Count archived terminal tasks for purging
//! - GET /api/database/archived-non-terminal - List stuck archived tasks
//! - POST /api/database/purge-archived - Delete archived terminal tasks
//! - GET /api/database/log-stats - Count log entries for purging
//! - POST /api/database/purge-logs - Delete old log entries
//! - GET /api/database/sync-status - Get Hive sync status (unsynced entity counts)
//! - POST /api/database/force-resync/:project_id - Force resync all entities for a project

use axum::{
    Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::{
    DatabaseStats, VacuumResult, analyze_database, get_database_stats,
    models::execution_process::ExecutionProcess, models::log_entry::DbLogEntry,
    models::project::Project, models::task::Task, models::task_attempt::TaskAttempt,
    vacuum_database,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::{assets::database_path, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Query parameters for archived task endpoints.
#[derive(Debug, Deserialize)]
pub struct ArchivedStatsQuery {
    /// Number of days old a task must be to be included. Defaults to 14.
    #[serde(default = "default_older_than_days")]
    pub older_than_days: i64,
}

fn default_older_than_days() -> i64 {
    14
}

/// Response for archived task stats query.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ArchivedStatsResponse {
    /// Number of archived terminal tasks older than the cutoff.
    pub count: i64,
    /// The cutoff in days used for the query.
    pub older_than_days: i64,
}

/// Response for archived task purge operation.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ArchivedPurgeResult {
    /// Number of tasks deleted.
    pub deleted: i64,
    /// The cutoff in days used for the purge.
    pub older_than_days: i64,
}

/// Query parameters for log entry endpoints.
#[derive(Debug, Deserialize)]
pub struct LogStatsQuery {
    /// Number of days old a log entry must be to be included. Defaults to 14.
    #[serde(default = "default_older_than_days")]
    pub older_than_days: i64,
}

/// Response for log entry stats query.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct LogStatsResponse {
    /// Number of log entries older than the cutoff.
    pub count: i64,
    /// The cutoff in days used for the query.
    pub older_than_days: i64,
}

/// Response for log entry purge operation.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct LogPurgeResult {
    /// Number of log entries deleted.
    pub deleted: i64,
    /// The cutoff in days used for the purge.
    pub older_than_days: i64,
}

/// Response for Hive sync status.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct SyncStatusResponse {
    /// Number of tasks not yet synced to Hive.
    pub unsynced_tasks: i64,
    /// Number of task attempts not yet synced to Hive.
    pub unsynced_attempts: i64,
    /// Number of execution processes not yet synced to Hive.
    pub unsynced_executions: i64,
    /// Number of log entries not yet synced to Hive.
    pub unsynced_logs: i64,
    /// Whether this node is connected to the Hive.
    pub is_connected: bool,
    /// Current node ID (if connected to Hive).
    pub node_id: Option<Uuid>,
}

/// Response for force resync operation.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ForceResyncResult {
    /// Number of tasks cleared for resync.
    pub tasks_cleared: u64,
    /// Number of attempts cleared for resync.
    pub attempts_cleared: u64,
    /// Number of executions cleared for resync.
    pub executions_cleared: u64,
    /// Number of log entries cleared for resync.
    pub logs_cleared: u64,
}

/// GET /api/database/stats
///
/// Returns database statistics including file sizes, page info, and table counts.
async fn get_stats(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<DatabaseStats>>, ApiError> {
    let db_path = database_path();
    let pool = &deployment.db().pool;

    let stats = get_database_stats(pool, &db_path)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(stats)))
}

/// POST /api/database/vacuum
///
/// Runs VACUUM on the database to reclaim space from deleted records.
/// Returns the bytes freed by the operation.
///
/// Rate limited to once per 5 minutes to prevent accidental repeated calls
/// that could lock the database.
async fn vacuum(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<VacuumResult>>, ApiError> {
    const VACUUM_COOLDOWN_SECS: u64 = 300; // 5 minutes

    // Check cooldown
    {
        let last_time = deployment.last_vacuum_time().read().await;
        if let Some(time) = *last_time
            && time.elapsed() < std::time::Duration::from_secs(VACUUM_COOLDOWN_SECS)
        {
            let remaining = VACUUM_COOLDOWN_SECS - time.elapsed().as_secs();
            return Err(ApiError::TooManyRequests(format!(
                "Please wait {} seconds before running VACUUM again",
                remaining
            )));
        }
    }

    let db_path = database_path();
    let pool = &deployment.db().pool;

    let result = vacuum_database(pool, &db_path)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    // Update cooldown timestamp
    {
        let mut last_time = deployment.last_vacuum_time().write().await;
        *last_time = Some(std::time::Instant::now());
    }

    Ok(ResponseJson(ApiResponse::success(result)))
}

/// POST /api/database/analyze
///
/// Runs ANALYZE on the database to update query planner statistics.
async fn analyze(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    analyze_database(pool)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// GET /api/database/archived-stats
///
/// Returns the count of archived tasks in terminal states (done/cancelled)
/// that are older than the specified number of days.
async fn archived_stats(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ArchivedStatsQuery>,
) -> Result<ResponseJson<ApiResponse<ArchivedStatsResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    let count = Task::count_archived_terminal_older_than(pool, query.older_than_days)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(ArchivedStatsResponse {
        count,
        older_than_days: query.older_than_days,
    })))
}

/// GET /api/database/archived-non-terminal
///
/// Returns a list of archived tasks that are NOT in terminal states (done/cancelled).
/// These are "stuck" tasks that were archived but not completed.
async fn archived_non_terminal(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Task>>>, ApiError> {
    let pool = &deployment.db().pool;

    let tasks = Task::find_archived_non_terminal(pool)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(tasks)))
}

/// POST /api/database/purge-archived
///
/// Deletes archived tasks in terminal states (done/cancelled) that are older
/// than the specified number of days. Returns the number of tasks deleted.
async fn purge_archived(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ArchivedStatsQuery>,
) -> Result<ResponseJson<ApiResponse<ArchivedPurgeResult>>, ApiError> {
    let pool = &deployment.db().pool;

    let deleted = Task::delete_archived_terminal_older_than(pool, query.older_than_days)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(ArchivedPurgeResult {
        deleted,
        older_than_days: query.older_than_days,
    })))
}

/// GET /api/database/log-stats
///
/// Returns the count of log entries older than the specified number of days.
async fn log_stats(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<LogStatsQuery>,
) -> Result<ResponseJson<ApiResponse<LogStatsResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    let count = DbLogEntry::count_older_than(pool, query.older_than_days)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(LogStatsResponse {
        count,
        older_than_days: query.older_than_days,
    })))
}

/// POST /api/database/purge-logs
///
/// Deletes log entries older than the specified number of days.
/// Returns the number of log entries deleted.
async fn purge_logs(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<LogStatsQuery>,
) -> Result<ResponseJson<ApiResponse<LogPurgeResult>>, ApiError> {
    let pool = &deployment.db().pool;

    let deleted = DbLogEntry::delete_older_than(pool, query.older_than_days)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(LogPurgeResult {
        deleted,
        older_than_days: query.older_than_days,
    })))
}

/// GET /api/database/sync-status
///
/// Returns the number of unsynced entities (tasks, attempts, executions, logs)
/// and the current node connection status.
async fn sync_status(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<SyncStatusResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get counts in parallel for efficiency
    let (unsynced_tasks, unsynced_attempts, unsynced_executions, unsynced_logs) = tokio::try_join!(
        Task::count_unsynced(pool),
        TaskAttempt::count_unsynced(pool),
        ExecutionProcess::count_unsynced(pool),
        DbLogEntry::count_unsynced(pool),
    )
    .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    // Get node connection status
    // Only return node_id when connected - a disconnected node_id could be stale/misleading
    let (is_connected, node_id) = if let Some(ctx) = deployment.node_runner_context() {
        let connected = ctx.is_connected().await;
        let nid = if connected { ctx.node_id().await } else { None };
        (connected, nid)
    } else {
        (false, None)
    };

    Ok(ResponseJson(ApiResponse::success(SyncStatusResponse {
        unsynced_tasks,
        unsynced_attempts,
        unsynced_executions,
        unsynced_logs,
        is_connected,
        node_id,
    })))
}

/// POST /api/database/force-resync/:project_id
///
/// Clears hive_synced_at for all tasks, attempts, executions, and logs in a project,
/// triggering them to be re-synced to the Hive on the next sync cycle.
async fn force_resync(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<ForceResyncResult>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify project exists
    let project = Project::find_by_id(pool, project_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Project {} not found", project_id)))?;

    // Only allow force resync for swarm-linked projects
    if project.remote_project_id.is_none() {
        return Err(ApiError::BadRequest(
            "Project is not linked to a swarm (no remote_project_id)".to_string(),
        ));
    }

    // Clear sync timestamps for all entities in this project
    let tasks_cleared = Task::clear_hive_sync_for_project(pool, project_id)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let attempts_cleared = TaskAttempt::clear_hive_sync_for_project(pool, project_id)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let executions_cleared = ExecutionProcess::clear_hive_sync_for_project(pool, project_id)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let logs_cleared = DbLogEntry::clear_hive_sync_for_project(pool, project_id)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    tracing::info!(
        project_id = %project_id,
        tasks_cleared = tasks_cleared,
        attempts_cleared = attempts_cleared,
        executions_cleared = executions_cleared,
        logs_cleared = logs_cleared,
        "Force resync triggered for project"
    );

    Ok(ResponseJson(ApiResponse::success(ForceResyncResult {
        tasks_cleared,
        attempts_cleared,
        executions_cleared,
        logs_cleared,
    })))
}

/// GET /api/database/hive/attempts/{assignment_id}
///
/// Proxy to the Hive API to fetch attempt details with execution processes for remote attempts.
/// This endpoint is used by the frontend when viewing attempts from other nodes.
async fn get_hive_attempt(
    State(deployment): State<DeploymentImpl>,
    Path(assignment_id): Path<Uuid>,
) -> Result<
    ResponseJson<ApiResponse<services::services::remote_client::NodeTaskAttemptResponse>>,
    ApiError,
> {
    // Prefer node_auth_client (API key auth) - works even without user login
    // Fall back to remote_client (OAuth) for non-node deployments
    let remote_client = match deployment.node_auth_client().cloned() {
        Some(c) => c,
        None => deployment.remote_client().map_err(|e| {
            tracing::warn!(
                assignment_id = %assignment_id,
                error = %e,
                "No client available for Hive attempt fetch"
            );
            e
        })?,
    };

    // Fetch the attempt data from the Hive using the remote client
    // The Hive endpoint is GET /v1/nodes/task-attempts/{attempt_id}
    let response = remote_client
        .get_node_task_attempt(assignment_id)
        .await
        .map_err(|e| {
            tracing::error!(?e, assignment_id = %assignment_id, "Failed to fetch attempt from Hive");
            ApiError::RemoteClient(e)
        })?;

    match response {
        Some(data) => Ok(ResponseJson(ApiResponse::success(data))),
        None => Err(ApiError::NotFound(format!(
            "Attempt {} not found on Hive",
            assignment_id
        ))),
    }
}

/// Create the database routes router.
pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/database/stats", get(get_stats))
        .route("/database/vacuum", post(vacuum))
        .route("/database/analyze", post(analyze))
        .route("/database/archived-stats", get(archived_stats))
        .route(
            "/database/archived-non-terminal",
            get(archived_non_terminal),
        )
        .route("/database/purge-archived", post(purge_archived))
        .route("/database/log-stats", get(log_stats))
        .route("/database/purge-logs", post(purge_logs))
        .route("/database/sync-status", get(sync_status))
        .route("/database/force-resync/{project_id}", post(force_resync))
        .route(
            "/database/hive/attempts/{assignment_id}",
            get(get_hive_attempt),
        )
}
