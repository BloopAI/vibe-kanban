use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::task::Task;

/// Type of match that caused tasks to be identified as potential duplicates
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DuplicateMatchType {
    /// Exact title match (case-insensitive)
    ExactTitle,
    /// Fuzzy/similar title match
    SimilarTitle,
    /// Similar description content
    SimilarDescription,
    /// Same external reference (e.g., GitHub issue)
    SameExternalRef,
}

/// A pair of tasks identified as potential duplicates
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DuplicatePair {
    /// The primary/older task (will be kept in merge)
    pub primary_task: Task,
    /// The secondary/newer task (will be merged into primary)
    pub secondary_task: Task,
    /// Similarity score between 0.0 and 1.0
    pub similarity_score: f64,
    /// Types of matches found
    pub match_types: Vec<DuplicateMatchType>,
}

/// Result of finding duplicate tasks in a project
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct FindDuplicatesResponse {
    /// List of duplicate pairs found
    pub duplicate_pairs: Vec<DuplicatePair>,
    /// Total number of tasks analyzed
    pub total_tasks_analyzed: usize,
}

/// Request to merge two tasks
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MergeTasksRequest {
    /// The task to keep (primary)
    pub primary_task_id: Uuid,
    /// The task to merge into primary (will be deleted)
    pub secondary_task_id: Uuid,
    /// Whether to append the secondary task's description to the primary
    pub append_description: bool,
    /// Whether to combine labels from both tasks
    pub combine_labels: bool,
}

/// Response from merging tasks
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MergeTasksResponse {
    /// The merged task
    pub merged_task: Task,
    /// ID of the task that was deleted
    pub deleted_task_id: Uuid,
}

/// Request to bulk merge multiple duplicate pairs
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct BulkMergeRequest {
    /// List of task pairs to merge
    pub merges: Vec<MergeTasksRequest>,
}

/// Response from bulk merge operation
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct BulkMergeResponse {
    /// Number of successful merges
    pub successful_merges: usize,
    /// Number of failed merges
    pub failed_merges: usize,
    /// List of merged tasks
    pub merged_tasks: Vec<Task>,
    /// Error messages for failed merges
    pub errors: Vec<String>,
}
