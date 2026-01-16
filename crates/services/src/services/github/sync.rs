//! GitHub sync service for bidirectional synchronization.
//!
//! This module handles synchronization between Vibe Kanban tasks and GitHub Issues,
//! including status mapping and conflict resolution.

use chrono::Utc;
use db::models::{
    github_issue_mapping::{CreateGitHubIssueMapping, GitHubIssueMapping, SyncDirection},
    github_project_link::GitHubProjectLink,
    task::{Task, TaskStatus},
    task_property::{CreateTaskProperty, PropertySource, TaskProperty},
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use thiserror::Error;
use tracing::{debug, info, warn};
use ts_rs::TS;
use uuid::Uuid;

use super::graphql::GitHubGraphQLError;
use super::projects::{GitHubIssue, GitHubProjectItem, GitHubProjectsError, GitHubProjectsService};

#[derive(Debug, Error)]
pub enum GitHubSyncError {
    #[error(transparent)]
    Projects(#[from] GitHubProjectsError),
    #[error(transparent)]
    GraphQL(#[from] GitHubGraphQLError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Sync conflict: {0}")]
    Conflict(String),
    #[error("Invalid mapping: {0}")]
    InvalidMapping(String),
}

/// Status mapping between Vibe Kanban and GitHub
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct StatusMapping {
    pub vibe_status: TaskStatus,
    pub github_project_status: String,
    pub github_issue_state: String, // "OPEN" or "CLOSED"
}

impl StatusMapping {
    /// Default status mappings
    pub fn defaults() -> Vec<Self> {
        vec![
            Self {
                vibe_status: TaskStatus::Todo,
                github_project_status: "Todo".to_string(),
                github_issue_state: "OPEN".to_string(),
            },
            Self {
                vibe_status: TaskStatus::InProgress,
                github_project_status: "In Progress".to_string(),
                github_issue_state: "OPEN".to_string(),
            },
            Self {
                vibe_status: TaskStatus::InReview,
                github_project_status: "In Review".to_string(),
                github_issue_state: "OPEN".to_string(),
            },
            Self {
                vibe_status: TaskStatus::Done,
                github_project_status: "Done".to_string(),
                github_issue_state: "CLOSED".to_string(),
            },
            Self {
                vibe_status: TaskStatus::Cancelled,
                github_project_status: "Cancelled".to_string(),
                github_issue_state: "CLOSED".to_string(),
            },
        ]
    }

    /// Map GitHub issue state to Vibe status
    pub fn github_to_vibe(issue_state: &str, project_status: Option<&str>) -> TaskStatus {
        // First try to match project status (more specific)
        if let Some(status) = project_status {
            let lower = status.to_lowercase();
            if lower.contains("progress") {
                return TaskStatus::InProgress;
            }
            if lower.contains("review") {
                return TaskStatus::InReview;
            }
            if lower.contains("done") || lower.contains("complete") {
                return TaskStatus::Done;
            }
            if lower.contains("cancel") {
                return TaskStatus::Cancelled;
            }
        }

        // Fall back to issue state
        match issue_state.to_uppercase().as_str() {
            "CLOSED" => TaskStatus::Done,
            _ => TaskStatus::Todo,
        }
    }

    /// Map Vibe status to GitHub issue state
    pub fn vibe_to_github_state(status: &TaskStatus) -> &'static str {
        match status {
            TaskStatus::Done | TaskStatus::Cancelled => "CLOSED",
            _ => "OPEN",
        }
    }
}

/// Result of a sync operation
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub items_synced: u32,
    pub items_created: u32,
    pub items_updated: u32,
    pub items_skipped: u32,
    pub errors: Vec<String>,
}

impl Default for SyncResult {
    fn default() -> Self {
        Self {
            items_synced: 0,
            items_created: 0,
            items_updated: 0,
            items_skipped: 0,
            errors: Vec::new(),
        }
    }
}

pub struct GitHubSyncService {
    projects_service: GitHubProjectsService,
}

impl GitHubSyncService {
    pub fn new() -> Self {
        Self {
            projects_service: GitHubProjectsService::new(),
        }
    }

    /// Check if GitHub CLI is available and authenticated
    pub fn check_available(&self) -> Result<(), GitHubSyncError> {
        self.projects_service.check_available()?;
        Ok(())
    }

    /// Sync all issues from a GitHub Project to Vibe Kanban tasks
    pub async fn sync_from_github(
        &self,
        pool: &SqlitePool,
        link: &GitHubProjectLink,
        project_id: Uuid,
    ) -> Result<SyncResult, GitHubSyncError> {
        let mut result = SyncResult::default();

        info!(
            "Starting sync from GitHub project {} to Vibe project {}",
            link.github_project_id, project_id
        );

        // Get all items from the GitHub project
        let items = self.projects_service.get_project_items(&link.github_project_id)?;

        for item in items {
            match self.sync_item_from_github(pool, link, project_id, &item).await {
                Ok(created) => {
                    if created {
                        result.items_created += 1;
                    } else {
                        result.items_updated += 1;
                    }
                    result.items_synced += 1;
                }
                Err(e) => {
                    let error_msg = format!(
                        "Failed to sync item {}: {}",
                        item.id,
                        e
                    );
                    warn!("{}", error_msg);
                    result.errors.push(error_msg);
                }
            }
        }

        // Update last sync timestamp
        GitHubProjectLink::update_last_sync_at(pool, link.id).await?;

        info!(
            "Sync completed: {} synced, {} created, {} updated, {} errors",
            result.items_synced, result.items_created, result.items_updated, result.errors.len()
        );

        Ok(result)
    }

    /// Sync a single item from GitHub to Vibe
    async fn sync_item_from_github(
        &self,
        pool: &SqlitePool,
        link: &GitHubProjectLink,
        project_id: Uuid,
        item: &GitHubProjectItem,
    ) -> Result<bool, GitHubSyncError> {
        // Skip items that don't have an issue (draft items, etc.)
        let issue = match &item.issue {
            Some(i) => i,
            None => {
                debug!("Skipping project item {} without issue content", item.id);
                return Ok(false);
            }
        };

        // Check if we already have a mapping for this issue
        let existing_mapping =
            GitHubIssueMapping::find_by_github_issue(pool, link.id, issue.number).await?;

        if let Some(mapping) = existing_mapping {
            // Check sync direction
            if matches!(mapping.sync_direction, SyncDirection::VibeToGithub) {
                debug!(
                    "Skipping issue #{} - sync direction is vibe_to_github only",
                    issue.number
                );
                return Ok(false);
            }

            // Update existing task
            self.update_task_from_issue(pool, mapping.task_id, issue, item)
                .await?;

            // Update sync timestamps
            GitHubIssueMapping::update_sync_timestamps(
                pool,
                mapping.id,
                Some(issue.updated_at),
                None,
            )
            .await?;

            Ok(false)
        } else {
            // Create new task and mapping
            let task_id = self.create_task_from_issue(pool, project_id, issue, item).await?;

            // Create the mapping
            let mapping_data = CreateGitHubIssueMapping {
                task_id,
                github_project_link_id: link.id,
                github_issue_number: issue.number,
                github_issue_id: issue.id.clone(),
                github_issue_url: issue.url.clone(),
                sync_direction: Some(SyncDirection::Bidirectional),
            };
            GitHubIssueMapping::create(pool, &mapping_data).await?;

            Ok(true)
        }
    }

    /// Create a new Vibe task from a GitHub issue
    async fn create_task_from_issue(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        issue: &GitHubIssue,
        item: &GitHubProjectItem,
    ) -> Result<Uuid, GitHubSyncError> {
        // All imported tasks start as Todo (agent not started)
        // GitHub status is stored in task_properties for reference
        let status = TaskStatus::Todo;

        // Create task
        let task_id = Uuid::new_v4();
        let task = Task::create(
            pool,
            &db::models::task::CreateTask {
                project_id,
                title: issue.title.clone(),
                description: issue.body.clone(),
                status: Some(status),
                parent_workspace_id: None,
                image_ids: None,
                shared_task_id: None,
            },
            task_id,
        )
        .await?;

        // Store additional properties (including GitHub status)
        self.sync_issue_properties(pool, task.id, issue, item).await?;

        info!(
            "Created task {} from GitHub issue #{}",
            task.id, issue.number
        );

        Ok(task.id)
    }

    /// Update an existing Vibe task from a GitHub issue
    async fn update_task_from_issue(
        &self,
        pool: &SqlitePool,
        task_id: Uuid,
        issue: &GitHubIssue,
        item: &GitHubProjectItem,
    ) -> Result<(), GitHubSyncError> {
        // Get the existing task to preserve agent workflow status
        let existing_task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or_else(|| GitHubSyncError::InvalidMapping(format!("Task {} not found", task_id)))?;

        // Update task: keep existing status (agent workflow), only update title/description
        // GitHub status is stored in task_properties
        Task::update(
            pool,
            task_id,
            existing_task.project_id,
            issue.title.clone(),
            issue.body.clone(),
            existing_task.status, // Preserve agent workflow status
            existing_task.parent_workspace_id,
        )
        .await?;

        // Update properties (including GitHub status)
        self.sync_issue_properties(pool, task_id, issue, item).await?;

        debug!(
            "Updated task {} from GitHub issue #{}",
            task_id, issue.number
        );

        Ok(())
    }

    /// Sync issue properties (labels, milestone, assignees) to task properties
    async fn sync_issue_properties(
        &self,
        pool: &SqlitePool,
        task_id: Uuid,
        issue: &GitHubIssue,
        item: &GitHubProjectItem,
    ) -> Result<(), GitHubSyncError> {
        // Sync labels
        if !issue.labels.is_empty() {
            let labels_json = serde_json::to_string(&issue.labels)
                .unwrap_or_else(|_| "[]".to_string());
            TaskProperty::upsert(
                pool,
                &CreateTaskProperty {
                    task_id,
                    property_name: "labels".to_string(),
                    property_value: labels_json,
                    source: Some(PropertySource::Github),
                },
            )
            .await?;
        }

        // Sync milestone
        if let Some(milestone) = &issue.milestone {
            let milestone_json = serde_json::to_string(milestone)
                .unwrap_or_else(|_| "null".to_string());
            TaskProperty::upsert(
                pool,
                &CreateTaskProperty {
                    task_id,
                    property_name: "milestone".to_string(),
                    property_value: milestone_json,
                    source: Some(PropertySource::Github),
                },
            )
            .await?;
        }

        // Sync assignees
        if !issue.assignees.is_empty() {
            let assignees_json = serde_json::to_string(&issue.assignees)
                .unwrap_or_else(|_| "[]".to_string());
            TaskProperty::upsert(
                pool,
                &CreateTaskProperty {
                    task_id,
                    property_name: "github_assignees".to_string(),
                    property_value: assignees_json,
                    source: Some(PropertySource::Github),
                },
            )
            .await?;
        }

        // Sync GitHub Project field values (Status, Priority, ジャンル, etc.)
        for field_value in &item.field_values {
            let property_name = format!("github_{}", field_value.field_name.to_lowercase().replace(' ', "_"));
            TaskProperty::upsert(
                pool,
                &CreateTaskProperty {
                    task_id,
                    property_name,
                    property_value: field_value.value.clone(),
                    source: Some(PropertySource::Github),
                },
            )
            .await?;
        }

        Ok(())
    }

    /// Sync a Vibe task to GitHub (for Vibe → GitHub direction)
    pub async fn sync_task_to_github(
        &self,
        pool: &SqlitePool,
        task: &Task,
    ) -> Result<(), GitHubSyncError> {
        // Find the mapping for this task
        let mapping = GitHubIssueMapping::find_by_task_id(pool, task.id).await?;

        let mapping = match mapping {
            Some(m) => m,
            None => {
                debug!("No GitHub mapping found for task {}", task.id);
                return Ok(());
            }
        };

        // Check sync direction
        if matches!(mapping.sync_direction, SyncDirection::GithubToVibe) {
            debug!(
                "Skipping task {} - sync direction is github_to_vibe only",
                task.id
            );
            return Ok(());
        }

        // Verify the GitHub link exists
        let _link = GitHubProjectLink::find_by_id(pool, mapping.github_project_link_id)
            .await?
            .ok_or_else(|| {
                GitHubSyncError::InvalidMapping(format!(
                    "GitHub link {} not found",
                    mapping.github_project_link_id
                ))
            })?;

        // Determine the target issue state based on task status
        let issue_state = StatusMapping::vibe_to_github_state(&task.status);

        // Update the GitHub issue via GraphQL
        self.update_github_issue(
            &mapping.github_issue_id,
            Some(&task.title),
            task.description.as_deref(),
            Some(issue_state),
        )?;

        info!(
            "Synced task {} to GitHub issue #{} (state: {})",
            task.id, mapping.github_issue_number, issue_state
        );

        // Update vibe_updated_at timestamp
        GitHubIssueMapping::update_sync_timestamps(pool, mapping.id, None, Some(Utc::now()))
            .await?;

        Ok(())
    }

    /// Update a GitHub issue via GraphQL mutation
    fn update_github_issue(
        &self,
        issue_id: &str,
        title: Option<&str>,
        body: Option<&str>,
        state: Option<&str>,
    ) -> Result<(), GitHubSyncError> {
        use super::graphql::queries;

        let full_query = format!("{}\n{}", queries::ISSUE_FRAGMENT, queries::UPDATE_ISSUE);

        let mut variables = serde_json::json!({
            "id": issue_id
        });

        if let Some(t) = title {
            variables["title"] = serde_json::Value::String(t.to_string());
        }
        if let Some(b) = body {
            variables["body"] = serde_json::Value::String(b.to_string());
        }
        if let Some(s) = state {
            variables["state"] = serde_json::Value::String(s.to_string());
        }

        let _result: serde_json::Value = self
            .projects_service
            .graphql
            .mutate(&full_query, Some(variables))?;

        Ok(())
    }
}

impl Default for GitHubSyncService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_status_mapping_github_to_vibe() {
        assert_eq!(
            StatusMapping::github_to_vibe("OPEN", None),
            TaskStatus::Todo
        );
        assert_eq!(
            StatusMapping::github_to_vibe("CLOSED", None),
            TaskStatus::Done
        );
        assert_eq!(
            StatusMapping::github_to_vibe("OPEN", Some("In Progress")),
            TaskStatus::InProgress
        );
        assert_eq!(
            StatusMapping::github_to_vibe("OPEN", Some("In Review")),
            TaskStatus::InReview
        );
    }

    #[test]
    fn test_status_mapping_vibe_to_github() {
        assert_eq!(StatusMapping::vibe_to_github_state(&TaskStatus::Todo), "OPEN");
        assert_eq!(
            StatusMapping::vibe_to_github_state(&TaskStatus::InProgress),
            "OPEN"
        );
        assert_eq!(StatusMapping::vibe_to_github_state(&TaskStatus::Done), "CLOSED");
        assert_eq!(
            StatusMapping::vibe_to_github_state(&TaskStatus::Cancelled),
            "CLOSED"
        );
    }
}
