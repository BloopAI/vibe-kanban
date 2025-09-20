//! Forge Task Service
//!
//! This service wraps the upstream TaskService and adds forge-specific
//! functionality through composition.

use sqlx::SqlitePool;

/// Forge Task Service that wraps upstream service
pub struct ForgeTaskService {
    // upstream: upstream::services::TaskService,
    extensions_db: SqlitePool,
}

impl ForgeTaskService {
    /// Create a new ForgeTaskService
    pub fn new(extensions_db: SqlitePool) -> Self {
        Self {
            // upstream,
            extensions_db,
        }
    }

    /// Create a task with forge-specific extensions
    pub async fn create_task(&self, _data: CreateTask) -> Result<Task, anyhow::Error> {
        // First create the core task through upstream service
        // let task = self.upstream.create_task(data.core).await?;
        
        // Then add forge-specific extensions
        // if let Some(template) = data.branch_template {
        //     sqlx::query!(
        //         "INSERT INTO forge_task_extensions (task_id, branch_template) VALUES (?, ?)",
        //         task.id, template
        //     ).execute(&self.extensions_db).await?;
        // }
        
        // Ok(task)
        
        todo!("Implement task creation with upstream service")
    }
}

/// Data structure for creating a task with forge extensions
pub struct CreateTask {
    /// Core task data for upstream service
    // pub core: upstream::types::CreateTask,
    /// Optional branch template for forge extension
    pub branch_template: Option<String>,
}

/// Task structure returned by the service
pub struct Task {
    // pub core: upstream::types::Task,
    pub id: i64,
}