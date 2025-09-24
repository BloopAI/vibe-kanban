use anyhow::{anyhow, Result};
use sqlx::{Row, SqlitePool};
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

    pub async fn generate_branch_name(&self, task_id: Uuid, attempt_id: Uuid) -> Result<String> {
        let record = sqlx::query(
            r#"SELECT t.title, f.branch_template
               FROM tasks t
               LEFT JOIN forge_task_extensions f ON f.task_id = t.id
               WHERE t.id = ?"#,
        )
        .bind(task_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| anyhow!("Task {} not found", task_id))?;

        let branch_template: Option<String> = record.try_get("branch_template").ok();
        let title: String = record
            .try_get("title")
            .map_err(|_| anyhow!("Task {} missing title", task_id))?;

        let branch = if let Some(template) = branch_template {
            format!("{}-{}", template, &attempt_id.to_string()[..4])
        } else {
            let slug = utils::text::git_branch_id(&title);
            format!("forge-{}-{}", slug, utils::text::short_uuid(&attempt_id))
        };

        Ok(branch)
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
    use sqlx::SqlitePool;

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

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("failed to create in-memory pool");

        sqlx::query(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT,
                parent_task_attempt TEXT,
                created_at TEXT,
                updated_at TEXT
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE forge_task_extensions (
                task_id TEXT PRIMARY KEY,
                branch_template TEXT
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn generate_branch_name_prefers_template() {
        let pool = setup_pool().await;
        let service = BranchTemplateService::new(pool.clone());
        let task_id = Uuid::new_v4();
        let attempt_id = Uuid::new_v4();

        sqlx::query(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
             VALUES (?, ?, 'Checkout', 'todo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .bind(task_id)
        .bind(Uuid::new_v4())
        .execute(&pool)
        .await
        .unwrap();

        service
            .set_template(task_id, Some("feature-checkout".into()))
            .await
            .unwrap();

        let branch = service
            .generate_branch_name(task_id, attempt_id)
            .await
            .unwrap();

        assert!(branch.starts_with("feature-checkout-"));
        assert_eq!(branch.len(), "feature-checkout-".len() + 4);
    }
}
