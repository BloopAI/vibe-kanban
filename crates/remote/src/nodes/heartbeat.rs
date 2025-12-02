use std::time::Duration;

use chrono::Utc;
use sqlx::PgPool;
use tokio::time::interval;

use crate::db::{
    nodes::NodeRepository,
    task_assignments::TaskAssignmentRepository,
};

/// Default heartbeat timeout in seconds
const DEFAULT_HEARTBEAT_TIMEOUT_SECS: i64 = 60;

/// Default check interval in seconds
const DEFAULT_CHECK_INTERVAL_SECS: u64 = 30;

/// Monitor that periodically checks for stale nodes and marks them offline
pub struct HeartbeatMonitor {
    pool: PgPool,
    timeout_secs: i64,
    check_interval_secs: u64,
}

impl HeartbeatMonitor {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            timeout_secs: DEFAULT_HEARTBEAT_TIMEOUT_SECS,
            check_interval_secs: DEFAULT_CHECK_INTERVAL_SECS,
        }
    }

    /// Set custom timeout (for testing)
    #[allow(dead_code)]
    pub fn with_timeout(mut self, timeout_secs: i64) -> Self {
        self.timeout_secs = timeout_secs;
        self
    }

    /// Set custom check interval (for testing)
    #[allow(dead_code)]
    pub fn with_check_interval(mut self, check_interval_secs: u64) -> Self {
        self.check_interval_secs = check_interval_secs;
        self
    }

    /// Start the heartbeat monitor as a background task
    pub fn spawn(self) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            self.run().await;
        })
    }

    /// Run the heartbeat monitor loop
    async fn run(&self) {
        let mut ticker = interval(Duration::from_secs(self.check_interval_secs));

        loop {
            ticker.tick().await;

            if let Err(e) = self.check_stale_nodes().await {
                tracing::error!(error = %e, "Failed to check stale nodes");
            }
        }
    }

    /// Check for stale nodes and mark them offline
    async fn check_stale_nodes(&self) -> anyhow::Result<()> {
        let threshold = Utc::now() - chrono::Duration::seconds(self.timeout_secs);

        let node_repo = NodeRepository::new(&self.pool);
        let stale_node_ids = node_repo
            .mark_stale_offline(threshold)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to mark stale nodes offline: {}", e))?;

        if !stale_node_ids.is_empty() {
            tracing::info!(
                count = stale_node_ids.len(),
                "Marked stale nodes as offline"
            );

            // Fail active assignments for stale nodes
            let assignment_repo = TaskAssignmentRepository::new(&self.pool);
            for node_id in &stale_node_ids {
                match assignment_repo.fail_node_assignments(*node_id).await {
                    Ok(failed_task_ids) => {
                        if !failed_task_ids.is_empty() {
                            tracing::info!(
                                node_id = %node_id,
                                task_count = failed_task_ids.len(),
                                "Failed active assignments for offline node"
                            );
                        }
                    }
                    Err(e) => {
                        tracing::error!(
                            node_id = %node_id,
                            error = %e,
                            "Failed to fail assignments for offline node"
                        );
                    }
                }
            }

            // TODO: Emit node.offline activity events for notification
        }

        Ok(())
    }
}

// Note: Integration tests for HeartbeatMonitor should be done in a separate test file
// with a real database connection and Tokio runtime.
