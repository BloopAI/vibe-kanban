//! PoolManager - Sandbox Pool Management
//!
//! Manages dynamic sandbox creation, pooling, cleanup, and health checks.
//! Migrated from PoolManager.js

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use db::models::sandbox::{CreateSandbox, Sandbox, SandboxStatus};
use db::models::swarm_config::SwarmConfig;
use serde::Serialize;
use sqlx::SqlitePool;
use thiserror::Error;
use tokio::sync::RwLock;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum PoolError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Sandbox not found: {0}")]
    SandboxNotFound(Uuid),
    #[error("Pool is at capacity (max: {0})")]
    AtCapacity(i32),
    #[error("Cannot destroy busy sandbox")]
    SandboxBusy,
    #[error("Daytona client not configured")]
    DaytonaNotConfigured,
    #[error("Sandbox creation failed: {0}")]
    CreationFailed(String),
    #[error("Already creating sandbox for task: {0}")]
    AlreadyCreating(Uuid),
}

pub type Result<T> = std::result::Result<T, PoolError>;

/// Status of the sandbox pool
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct PoolStatus {
    pub config: PoolConfig,
    pub sandboxes: Vec<SandboxInfo>,
    pub stats: PoolStats,
}

/// Pool configuration
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct PoolConfig {
    pub max_sandboxes: i32,
    pub idle_timeout_minutes: i32,
    pub default_snapshot: String,
}

/// Statistics about the pool
#[derive(Debug, Clone, Default, Serialize, TS)]
#[ts(export)]
pub struct PoolStats {
    pub total: usize,
    pub busy: usize,
    pub idle: usize,
    pub destroyed: usize,
}

/// Information about a sandbox in the pool
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct SandboxInfo {
    pub id: Uuid,
    pub daytona_id: String,
    pub status: SandboxStatus,
    pub swarm_id: Option<Uuid>,
    pub task_id: Option<Uuid>,
    pub idle_time_seconds: i64,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
}

/// Inferred role from task tags
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentRole {
    Frontend,
    Backend,
    Qa,
    Devops,
    Product,
    Architect,
    Content,
    General,
}

impl AgentRole {
    /// Infer role from task tags
    pub fn from_tags(tags: &[String]) -> Self {
        let tag_set: HashSet<_> = tags.iter().map(|t| t.to_lowercase()).collect();

        if tag_set.iter().any(|t| ["frontend", "ui", "react", "vue"].contains(&t.as_str())) {
            return Self::Frontend;
        }
        if tag_set.iter().any(|t| ["backend", "api", "server", "database"].contains(&t.as_str())) {
            return Self::Backend;
        }
        if tag_set.iter().any(|t| ["qa", "test", "e2e", "testing"].contains(&t.as_str())) {
            return Self::Qa;
        }
        if tag_set.iter().any(|t| ["devops", "deploy", "infra", "ci-cd"].contains(&t.as_str())) {
            return Self::Devops;
        }
        if tag_set.iter().any(|t| ["prd", "planning", "product"].contains(&t.as_str())) {
            return Self::Product;
        }
        if tag_set.iter().any(|t| ["architecture", "architect", "design"].contains(&t.as_str())) {
            return Self::Architect;
        }
        if tag_set.iter().any(|t| ["content", "copy", "writing"].contains(&t.as_str())) {
            return Self::Content;
        }

        Self::General
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Frontend => "frontend",
            Self::Backend => "backend",
            Self::Qa => "qa",
            Self::Devops => "devops",
            Self::Product => "product",
            Self::Architect => "architect",
            Self::Content => "content",
            Self::General => "general",
        }
    }
}

/// PoolManager handles sandbox lifecycle and pooling
pub struct PoolManager {
    /// Set of task IDs currently being created
    creating_sandboxes: Arc<RwLock<HashSet<Uuid>>>,
}

impl Default for PoolManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PoolManager {
    pub fn new() -> Self {
        Self {
            creating_sandboxes: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    /// Get pool configuration from database
    async fn get_config(&self, pool: &SqlitePool) -> Result<PoolConfig> {
        let config = SwarmConfig::get(pool).await?;
        Ok(PoolConfig {
            max_sandboxes: config.pool_max_sandboxes,
            idle_timeout_minutes: config.pool_idle_timeout_minutes,
            default_snapshot: config.pool_default_snapshot,
        })
    }

    /// Get pool status including all sandboxes
    pub async fn get_status(&self, pool: &SqlitePool) -> Result<PoolStatus> {
        let config = self.get_config(pool).await?;
        let sandboxes = Sandbox::find_all(pool).await?;

        let now = Utc::now();
        let mut stats = PoolStats::default();

        let sandbox_infos: Vec<SandboxInfo> = sandboxes
            .into_iter()
            .map(|s| {
                stats.total += 1;
                match s.status {
                    SandboxStatus::Busy => stats.busy += 1,
                    SandboxStatus::Idle => stats.idle += 1,
                    SandboxStatus::Destroyed => stats.destroyed += 1,
                }

                let idle_time_seconds = if s.status == SandboxStatus::Idle {
                    s.last_used_at
                        .map(|t| (now - t).num_seconds())
                        .unwrap_or(0)
                } else {
                    0
                };

                SandboxInfo {
                    id: s.id,
                    daytona_id: s.daytona_id,
                    status: s.status,
                    swarm_id: s.swarm_id,
                    task_id: s.current_task_id,
                    idle_time_seconds,
                    created_at: s.created_at,
                }
            })
            .collect();

        Ok(PoolStatus {
            config,
            sandboxes: sandbox_infos,
            stats,
        })
    }

    /// Get count of active (non-destroyed) sandboxes
    pub async fn get_active_count(&self, pool: &SqlitePool) -> Result<i64> {
        Ok(Sandbox::count_active(pool).await?)
    }

    /// Check if pool is at capacity
    pub async fn is_at_capacity(&self, pool: &SqlitePool) -> Result<bool> {
        let config = self.get_config(pool).await?;
        let active_count = self.get_active_count(pool).await?;
        Ok(active_count >= config.max_sandboxes as i64)
    }

    /// Check if already creating sandbox for task
    pub async fn is_creating(&self, task_id: Uuid) -> bool {
        self.creating_sandboxes.read().await.contains(&task_id)
    }

    /// Find an idle sandbox for a swarm
    pub async fn find_idle_sandbox(
        &self,
        pool: &SqlitePool,
        swarm_id: Uuid,
    ) -> Result<Option<Sandbox>> {
        let idle_sandboxes = Sandbox::find_idle(pool).await?;

        let sandbox = idle_sandboxes
            .into_iter()
            .find(|s| s.swarm_id == Some(swarm_id));

        if let Some(ref s) = sandbox {
            tracing::info!(sandbox_id = %s.id, "Reusing idle sandbox from pool");
        }

        Ok(sandbox)
    }

    /// Register a new sandbox in the pool
    pub async fn register_sandbox(
        &self,
        pool: &SqlitePool,
        daytona_id: String,
        swarm_id: Option<Uuid>,
    ) -> Result<Sandbox> {
        let sandbox_id = Uuid::new_v4();
        let data = CreateSandbox {
            daytona_id: daytona_id.clone(),
            swarm_id,
        };

        let sandbox = Sandbox::create(pool, &data, sandbox_id).await?;

        tracing::info!(
            sandbox_id = %sandbox.id,
            daytona_id = %daytona_id,
            "Sandbox registered in pool"
        );

        Ok(sandbox)
    }

    /// Mark creation as started for a task
    pub async fn start_creating(&self, task_id: Uuid) -> Result<()> {
        let mut creating = self.creating_sandboxes.write().await;
        if creating.contains(&task_id) {
            return Err(PoolError::AlreadyCreating(task_id));
        }
        creating.insert(task_id);
        Ok(())
    }

    /// Mark creation as finished for a task
    pub async fn finish_creating(&self, task_id: Uuid) {
        self.creating_sandboxes.write().await.remove(&task_id);
    }

    /// Assign a task to a sandbox
    pub async fn assign_task(
        &self,
        pool: &SqlitePool,
        sandbox_id: Uuid,
        task_id: Uuid,
    ) -> Result<()> {
        Sandbox::assign_task(pool, sandbox_id, task_id).await?;

        tracing::info!(
            sandbox_id = %sandbox_id,
            task_id = %task_id,
            "Task assigned to sandbox"
        );

        Ok(())
    }

    /// Release a sandbox back to the pool
    pub async fn release(&self, pool: &SqlitePool, sandbox_id: Uuid) -> Result<()> {
        Sandbox::release_task(pool, sandbox_id).await?;

        tracing::info!(sandbox_id = %sandbox_id, "Sandbox released to pool");

        Ok(())
    }

    /// Mark a sandbox as destroyed
    pub async fn mark_destroyed(&self, pool: &SqlitePool, sandbox_id: Uuid) -> Result<()> {
        Sandbox::mark_destroyed(pool, sandbox_id).await?;

        tracing::info!(sandbox_id = %sandbox_id, "Sandbox marked as destroyed");

        Ok(())
    }

    /// Delete a sandbox record from the database
    pub async fn delete(&self, pool: &SqlitePool, sandbox_id: Uuid) -> Result<()> {
        let sandbox = Sandbox::find_by_id(pool, sandbox_id)
            .await?
            .ok_or(PoolError::SandboxNotFound(sandbox_id))?;

        if sandbox.status == SandboxStatus::Busy {
            return Err(PoolError::SandboxBusy);
        }

        Sandbox::delete(pool, sandbox_id).await?;

        tracing::info!(sandbox_id = %sandbox_id, "Sandbox deleted from database");

        Ok(())
    }

    /// Cleanup idle sandboxes that have been idle longer than the timeout
    pub async fn cleanup_idle_sandboxes(&self, pool: &SqlitePool) -> Result<Vec<Uuid>> {
        let config = self.get_config(pool).await?;
        let idle_timeout = Duration::from_secs(config.idle_timeout_minutes as u64 * 60);
        let cutoff = Utc::now()
            - chrono::Duration::from_std(idle_timeout)
                .expect("idle_timeout should be within chrono::Duration bounds");

        let idle_sandboxes = Sandbox::find_idle(pool).await?;
        let mut destroyed = Vec::new();

        for sandbox in idle_sandboxes {
            let last_used = sandbox.last_used_at.unwrap_or(sandbox.created_at);
            if last_used < cutoff {
                Sandbox::mark_destroyed(pool, sandbox.id).await?;
                destroyed.push(sandbox.id);

                tracing::info!(
                    sandbox_id = %sandbox.id,
                    idle_minutes = config.idle_timeout_minutes,
                    "Idle sandbox marked for cleanup"
                );
            }
        }

        Sandbox::delete_destroyed(pool).await?;

        Ok(destroyed)
    }

    /// Get a sandbox by ID
    pub async fn get(&self, pool: &SqlitePool, sandbox_id: Uuid) -> Result<Sandbox> {
        Sandbox::find_by_id(pool, sandbox_id)
            .await?
            .ok_or(PoolError::SandboxNotFound(sandbox_id))
    }

    /// Get a sandbox by Daytona ID
    pub async fn get_by_daytona_id(
        &self,
        pool: &SqlitePool,
        daytona_id: &str,
    ) -> Result<Option<Sandbox>> {
        Ok(Sandbox::find_by_daytona_id(pool, daytona_id).await?)
    }

    /// Get all busy sandboxes
    pub async fn get_busy_sandboxes(&self, pool: &SqlitePool) -> Result<Vec<Sandbox>> {
        Ok(Sandbox::find_busy(pool).await?)
    }
}
