use std::collections::HashSet;

use db::models::{
    task::Task,
    task_deduplication::{
        BulkMergeRequest, BulkMergeResponse, DuplicateMatchType, DuplicatePair,
        FindDuplicatesResponse, MergeTasksRequest, MergeTasksResponse,
    },
};
use sqlx::SqlitePool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum DeduplicationError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Task not found: {0}")]
    TaskNotFound(Uuid),
    #[error("Cannot merge task with itself")]
    SelfMerge,
    #[error("Tasks belong to different projects")]
    DifferentProjects,
}

/// Service for detecting and merging duplicate tasks
pub struct TaskDeduplicationService;

impl TaskDeduplicationService {
    /// Threshold for considering titles as similar (0.0 to 1.0)
    const TITLE_SIMILARITY_THRESHOLD: f64 = 0.7;
    /// Threshold for considering descriptions as similar (0.0 to 1.0)
    const DESCRIPTION_SIMILARITY_THRESHOLD: f64 = 0.6;
    /// Minimum similarity score to be considered a duplicate
    const MIN_DUPLICATE_SCORE: f64 = 0.5;

    /// Find potential duplicate tasks in a project
    pub async fn find_duplicates(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<FindDuplicatesResponse, DeduplicationError> {
        // Fetch all tasks for the project using existing db method
        let tasks_with_status =
            Task::find_by_project_id_with_attempt_status(pool, project_id).await?;

        // Extract just the Task from TaskWithAttemptStatus
        let tasks: Vec<Task> = tasks_with_status.into_iter().map(|t| t.task).collect();
        let total_tasks = tasks.len();

        let mut duplicate_pairs = Vec::new();

        // Compare each pair of tasks
        for i in 0..tasks.len() {
            for j in (i + 1)..tasks.len() {
                let task_a = &tasks[i];
                let task_b = &tasks[j];

                if let Some(pair) = Self::analyze_pair(task_a, task_b) {
                    duplicate_pairs.push(pair);
                }
            }
        }

        // Sort by similarity score (highest first)
        duplicate_pairs
            .sort_by(|a, b| b.similarity_score.partial_cmp(&a.similarity_score).unwrap());

        Ok(FindDuplicatesResponse {
            duplicate_pairs,
            total_tasks_analyzed: total_tasks,
        })
    }

    /// Analyze two tasks and determine if they are duplicates
    fn analyze_pair(task_a: &Task, task_b: &Task) -> Option<DuplicatePair> {
        let mut match_types = Vec::new();
        let mut scores = Vec::new();

        // Check external reference match first (highest priority)
        if let (Some(ref_a), Some(ref_b)) = (&task_a.external_ref, &task_b.external_ref)
            && ref_a == ref_b
        {
            match_types.push(DuplicateMatchType::SameExternalRef);
            scores.push(1.0);
        }

        // Check exact title match (case-insensitive)
        let title_a = task_a.title.to_lowercase().trim().to_string();
        let title_b = task_b.title.to_lowercase().trim().to_string();

        if title_a == title_b {
            match_types.push(DuplicateMatchType::ExactTitle);
            scores.push(1.0);
        } else {
            // Check fuzzy title similarity
            let title_sim = Self::calculate_string_similarity(&title_a, &title_b);
            if title_sim >= Self::TITLE_SIMILARITY_THRESHOLD {
                match_types.push(DuplicateMatchType::SimilarTitle);
                scores.push(title_sim);
            }
        }

        // Check description similarity
        if let (Some(desc_a), Some(desc_b)) = (&task_a.description, &task_b.description) {
            let desc_a_clean = desc_a.to_lowercase().trim().to_string();
            let desc_b_clean = desc_b.to_lowercase().trim().to_string();

            if !desc_a_clean.is_empty() && !desc_b_clean.is_empty() {
                let desc_sim = Self::calculate_string_similarity(&desc_a_clean, &desc_b_clean);
                if desc_sim >= Self::DESCRIPTION_SIMILARITY_THRESHOLD {
                    match_types.push(DuplicateMatchType::SimilarDescription);
                    scores.push(desc_sim);
                }
            }
        }

        // Calculate overall similarity score
        if scores.is_empty() {
            return None;
        }

        let avg_score = scores.iter().sum::<f64>() / scores.len() as f64;

        // Only return if above minimum threshold
        if avg_score < Self::MIN_DUPLICATE_SCORE {
            return None;
        }

        // Determine primary (older) and secondary (newer) task
        let (primary, secondary) = if task_a.created_at <= task_b.created_at {
            (task_a, task_b)
        } else {
            (task_b, task_a)
        };

        Some(DuplicatePair {
            primary_task: primary.clone(),
            secondary_task: secondary.clone(),
            similarity_score: avg_score,
            match_types,
        })
    }

    /// Calculate similarity between two strings using Jaccard similarity on word tokens
    fn calculate_string_similarity(a: &str, b: &str) -> f64 {
        let words_a: HashSet<&str> = a.split_whitespace().collect();
        let words_b: HashSet<&str> = b.split_whitespace().collect();

        if words_a.is_empty() && words_b.is_empty() {
            return 1.0;
        }

        if words_a.is_empty() || words_b.is_empty() {
            return 0.0;
        }

        let intersection = words_a.intersection(&words_b).count();
        let union = words_a.union(&words_b).count();

        intersection as f64 / union as f64
    }

    /// Merge two tasks, keeping the primary task and deleting the secondary
    pub async fn merge_tasks(
        pool: &SqlitePool,
        request: MergeTasksRequest,
    ) -> Result<MergeTasksResponse, DeduplicationError> {
        if request.primary_task_id == request.secondary_task_id {
            return Err(DeduplicationError::SelfMerge);
        }

        // Fetch both tasks
        let primary = Task::find_by_id(pool, request.primary_task_id)
            .await?
            .ok_or(DeduplicationError::TaskNotFound(request.primary_task_id))?;

        let secondary = Task::find_by_id(pool, request.secondary_task_id)
            .await?
            .ok_or(DeduplicationError::TaskNotFound(request.secondary_task_id))?;

        // Verify tasks belong to the same project
        if primary.project_id != secondary.project_id {
            return Err(DeduplicationError::DifferentProjects);
        }

        // Prepare merged description
        let merged_description = if request.append_description {
            match (&primary.description, &secondary.description) {
                (Some(primary_desc), Some(secondary_desc)) => Some(format!(
                    "{}\n\n---\n\n**Merged from task #{}:**\n{}",
                    primary_desc,
                    secondary.task_number.unwrap_or(0),
                    secondary_desc
                )),
                (None, Some(secondary_desc)) => Some(format!(
                    "**Merged from task #{}:**\n{}",
                    secondary.task_number.unwrap_or(0),
                    secondary_desc
                )),
                (primary_desc, None) => primary_desc.clone(),
            }
        } else {
            primary.description.clone()
        };

        // Prepare merged labels
        let merged_labels = if request.combine_labels {
            let mut labels = primary.labels.clone();
            for label in &secondary.labels {
                if !labels.iter().any(|l| l.name == label.name) {
                    labels.push(label.clone());
                }
            }
            labels
        } else {
            primary.labels.clone()
        };

        // Update the primary task with merged data
        Task::update_description_and_labels(
            pool,
            request.primary_task_id,
            merged_description,
            &merged_labels,
        )
        .await?;

        // Delete the secondary task
        Task::delete(pool, request.secondary_task_id).await?;

        // Fetch the updated primary task
        let merged_task = Task::find_by_id(pool, request.primary_task_id)
            .await?
            .ok_or(DeduplicationError::TaskNotFound(request.primary_task_id))?;

        Ok(MergeTasksResponse {
            merged_task,
            deleted_task_id: request.secondary_task_id,
        })
    }

    /// Bulk merge multiple duplicate pairs
    pub async fn bulk_merge(
        pool: &SqlitePool,
        request: BulkMergeRequest,
    ) -> Result<BulkMergeResponse, DeduplicationError> {
        let mut successful_merges = 0;
        let mut failed_merges = 0;
        let mut merged_tasks = Vec::new();
        let mut errors = Vec::new();

        for merge_request in request.merges {
            match Self::merge_tasks(pool, merge_request.clone()).await {
                Ok(response) => {
                    successful_merges += 1;
                    merged_tasks.push(response.merged_task);
                }
                Err(e) => {
                    failed_merges += 1;
                    errors.push(format!(
                        "Failed to merge {} into {}: {}",
                        merge_request.secondary_task_id, merge_request.primary_task_id, e
                    ));
                }
            }
        }

        Ok(BulkMergeResponse {
            successful_merges,
            failed_merges,
            merged_tasks,
            errors,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_string_similarity() {
        // Exact match
        assert!(
            (TaskDeduplicationService::calculate_string_similarity(
                "fix login bug",
                "fix login bug"
            ) - 1.0)
                .abs()
                < 0.001
        );

        // Similar strings
        let sim =
            TaskDeduplicationService::calculate_string_similarity("fix login bug", "fix login");
        assert!(sim > 0.5);

        // Different strings
        let sim = TaskDeduplicationService::calculate_string_similarity(
            "fix login bug",
            "add new feature",
        );
        assert!(sim < 0.3);

        // Empty strings
        assert!(
            (TaskDeduplicationService::calculate_string_similarity("", "") - 1.0).abs() < 0.001
        );
        assert!(TaskDeduplicationService::calculate_string_similarity("hello", "").abs() < 0.001);
    }
}
