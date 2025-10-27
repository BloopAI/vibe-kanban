use serde::{Deserialize, Serialize};

use crate::db::{
    projects::ProjectMetadata,
    tasks::{SharedTask, TaskStatus},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSharedTaskRequest {
    pub project: ProjectMetadata,
    pub title: String,
    pub description: Option<String>,
    pub assignee_user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSharedTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub version: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignSharedTaskRequest {
    pub new_assignee_user_id: Option<String>,
    pub version: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedTaskResponse {
    pub task: SharedTask,
}
