use anyhow::Result;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::types::Task;

pub struct BranchTemplateService {
    pool: SqlitePool,
}

impl BranchTemplateService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get_template(&self, task_id: Uuid) -> Result<Option<String>> {
        let template: Option<Option<String>> = sqlx::query_scalar(
            "SELECT branch_template FROM forge_task_extensions WHERE task_id = ?",
        )
        .bind(task_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(template.flatten())
    }

    pub async fn set_template(&self, task_id: Uuid, template: Option<String>) -> Result<()> {
        if let Some(template) = template {
            sqlx::query(
                "INSERT OR REPLACE INTO forge_task_extensions (task_id, branch_template) VALUES (?, ?)"
            )
            .bind(task_id)
            .bind(template)
            .execute(&self.pool)
            .await?;
        } else {
            // If template is None, we could remove the record or set to NULL
            sqlx::query(
                "UPDATE forge_task_extensions SET branch_template = NULL WHERE task_id = ?",
            )
            .bind(task_id)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }
}

/// Generate a branch name for a task attempt
/// This is the core logic extracted from task_attempt.rs:453-466
pub fn generate_branch_name(task: &Task, attempt_id: &Uuid) -> String {
    if let Some(template) = &task.branch_template {
        // User-provided template with short UUID suffix for uniqueness
        format!("{}-{}", template, &attempt_id.to_string()[..4])
    } else {
        // Fallback to forge-{title}-{uuid} pattern
        let task_title_id = utils::text::git_branch_id(&task.title);
        format!(
            "forge-{}-{}",
            task_title_id,
            utils::text::short_uuid(attempt_id)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_task(branch_template: Option<String>, title: &str) -> Task {
        Task::new(Uuid::new_v4(), title.to_string(), branch_template)
    }

    #[test]
    fn test_generate_branch_name_uses_template_suffix() {
        let attempt_id = Uuid::new_v4();
        let task = dummy_task(Some("feature-login".to_string()), "Login Flow");
        let branch = generate_branch_name(&task, &attempt_id);
        assert!(branch.starts_with("feature-login-"));
        assert_eq!(branch.len(), "feature-login-".len() + 4);
    }

    #[test]
    fn test_generate_branch_name_falls_back_to_forge_pattern() {
        let attempt_id = Uuid::nil();
        let task = dummy_task(None, "Add Payment Flow");
        let branch = generate_branch_name(&task, &attempt_id);
        let expected_prefix = format!("forge-{}-", utils::text::git_branch_id(&task.title));
        let expected_suffix = utils::text::short_uuid(&attempt_id);
        assert!(branch.starts_with(&expected_prefix));
        assert!(branch.ends_with(&expected_suffix));
    }
}
