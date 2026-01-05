use db::models::{
    discovery_item::{CreateDiscoveryItem, DiscoveryItem, DiscoveryStatus, UpdateDiscoveryItem},
    feedback_entry::{CreateFeedbackEntry, FeedbackEntry, FeedbackType},
    task::{CreateTask, Task, TaskStatus},
};
use sqlx::SqlitePool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum DiscoveryServiceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Discovery item not found")]
    NotFound,
    #[error("Discovery item is not in 'ready' status")]
    NotReadyForPromotion,
    #[error("Discovery item has already been promoted")]
    AlreadyPromoted,
    #[error("Cannot perform operation: {0}")]
    InvalidOperation(String),
}

pub type Result<T> = std::result::Result<T, DiscoveryServiceError>;

#[derive(Clone, Default)]
pub struct DiscoveryService;

impl DiscoveryService {
    pub fn new() -> Self {
        Self
    }

    // ==================== Discovery Items ====================

    /// Create a new discovery item (scenario, spec, story, or spike)
    pub async fn create_discovery_item(
        &self,
        pool: &SqlitePool,
        data: CreateDiscoveryItem,
    ) -> Result<DiscoveryItem> {
        let item = DiscoveryItem::create(pool, &data).await?;
        Ok(item)
    }

    /// Update an existing discovery item
    pub async fn update_discovery_item(
        &self,
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateDiscoveryItem,
    ) -> Result<DiscoveryItem> {
        let item = DiscoveryItem::update(pool, id, &data).await?;
        Ok(item)
    }

    /// Get a discovery item by ID
    pub async fn get_discovery_item(
        &self,
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<DiscoveryItem> {
        DiscoveryItem::find_by_id(pool, id)
            .await?
            .ok_or(DiscoveryServiceError::NotFound)
    }

    /// Get all discovery items for a project
    pub async fn get_project_discovery_items(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<DiscoveryItem>> {
        let items = DiscoveryItem::find_by_project_id(pool, project_id).await?;
        Ok(items)
    }

    /// Get the discovery item that was promoted to a specific task
    pub async fn get_discovery_item_for_task(
        &self,
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Option<DiscoveryItem>> {
        let item = DiscoveryItem::find_by_task_id(pool, task_id).await?;
        Ok(item)
    }

    /// Delete a discovery item
    pub async fn delete_discovery_item(&self, pool: &SqlitePool, id: Uuid) -> Result<u64> {
        let rows = DiscoveryItem::delete(pool, id).await?;
        Ok(rows)
    }

    // ==================== Promotion to Task ====================

    /// Promote a discovery item to a task
    /// This creates a new task with the discovery item's context and links them
    pub async fn promote_to_task(
        &self,
        pool: &SqlitePool,
        discovery_item_id: Uuid,
    ) -> Result<(Task, DiscoveryItem)> {
        // Get the discovery item
        let item = self.get_discovery_item(pool, discovery_item_id).await?;

        // Validate status
        if item.status == DiscoveryStatus::Promoted {
            return Err(DiscoveryServiceError::AlreadyPromoted);
        }

        if item.status != DiscoveryStatus::Ready {
            return Err(DiscoveryServiceError::NotReadyForPromotion);
        }

        // Build the task description from the discovery item's context
        let description = Some(item.to_context());

        // Create the task
        let task_id = Uuid::new_v4();
        let create_task = CreateTask {
            project_id: item.project_id,
            title: item.title.clone(),
            description,
            status: Some(TaskStatus::Todo),
            parent_workspace_id: None,
            image_ids: None,
            shared_task_id: None,
        };

        Task::create(pool, &create_task, task_id).await?;

        // Link the discovery item to the task and update status
        let updated_item = DiscoveryItem::promote_to_task(pool, discovery_item_id, task_id).await?;

        // Set discovery_item_id on task (bidirectional link)
        sqlx::query!(
            "UPDATE tasks SET discovery_item_id = $1, updated_at = datetime('now', 'subsec') WHERE id = $2",
            discovery_item_id,
            task_id
        )
        .execute(pool)
        .await?;

        // Reload task to get updated discovery_item_id
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(DiscoveryServiceError::NotFound)?;

        Ok((task, updated_item))
    }

    // ==================== Feedback Entries ====================

    /// Create a feedback entry
    pub async fn create_feedback(
        &self,
        pool: &SqlitePool,
        data: CreateFeedbackEntry,
    ) -> Result<FeedbackEntry> {
        let entry = FeedbackEntry::create(pool, &data).await?;
        Ok(entry)
    }

    /// Get feedback entries for a task (including from linked discovery items)
    pub async fn get_task_feedback(
        &self,
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<FeedbackEntry>> {
        let entries = FeedbackEntry::find_all_for_task(pool, task_id).await?;
        Ok(entries)
    }

    /// Get feedback entries for a discovery item
    pub async fn get_discovery_item_feedback(
        &self,
        pool: &SqlitePool,
        discovery_item_id: Uuid,
    ) -> Result<Vec<FeedbackEntry>> {
        let entries = FeedbackEntry::find_by_discovery_item_id(pool, discovery_item_id).await?;
        Ok(entries)
    }

    /// Capture execution feedback automatically
    /// This is called when an execution completes to record learnings
    pub async fn capture_execution_feedback(
        &self,
        pool: &SqlitePool,
        task_id: Uuid,
        execution_id: Uuid,
        content: String,
        summary: Option<String>,
    ) -> Result<FeedbackEntry> {
        let data = CreateFeedbackEntry {
            task_id: Some(task_id),
            discovery_item_id: None,
            feedback_type: FeedbackType::Execution,
            content,
            summary,
            source_execution_id: Some(execution_id),
        };

        let entry = FeedbackEntry::create(pool, &data).await?;
        Ok(entry)
    }

    /// Delete a feedback entry
    pub async fn delete_feedback(&self, pool: &SqlitePool, id: Uuid) -> Result<u64> {
        let rows = FeedbackEntry::delete(pool, id).await?;
        Ok(rows)
    }

    // ==================== Conflict Detection ====================

    /// Find potentially related work in the project
    /// This helps avoid duplicate or conflicting tasks
    pub async fn find_related_work(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        title: &str,
        _content: Option<&str>,
    ) -> Result<RelatedWork> {
        // Get all discovery items for the project
        let discovery_items = DiscoveryItem::find_by_project_id(pool, project_id).await?;

        // Get all tasks for the project
        let tasks = Task::find_by_project_id_with_attempt_status(pool, project_id).await?;

        // Simple keyword-based matching (can be enhanced with semantic search later)
        let title_lower = title.to_lowercase();
        let keywords: Vec<&str> = title_lower.split_whitespace().collect();

        let related_discovery_items: Vec<DiscoveryItem> = discovery_items
            .into_iter()
            .filter(|item| {
                let item_title_lower = item.title.to_lowercase();
                keywords.iter().any(|k| item_title_lower.contains(k))
            })
            .collect();

        let related_tasks: Vec<Task> = tasks
            .into_iter()
            .filter(|t| {
                let task_title_lower = t.task.title.to_lowercase();
                keywords.iter().any(|k| task_title_lower.contains(k))
            })
            .map(|t| t.task)
            .collect();

        Ok(RelatedWork {
            discovery_items: related_discovery_items,
            tasks: related_tasks,
        })
    }
}

/// Related work found during conflict detection
#[derive(Debug, Clone)]
pub struct RelatedWork {
    pub discovery_items: Vec<DiscoveryItem>,
    pub tasks: Vec<Task>,
}
