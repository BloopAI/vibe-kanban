use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Simplified Task representation for branch template generation
/// This avoids importing the full db crate dependency
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: Uuid,
    pub title: String,
    pub branch_template: Option<String>,
}

impl Task {
    pub fn new(id: Uuid, title: String, branch_template: Option<String>) -> Self {
        Self {
            id,
            title,
            branch_template,
        }
    }
}
