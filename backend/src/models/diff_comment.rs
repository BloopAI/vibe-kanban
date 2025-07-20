use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export)]
pub struct DiffComment {
    pub id: String,
    pub project_id: Uuid,
    pub task_id: Uuid,
    pub attempt_id: Uuid,
    pub file_path: String,
    pub old_line_number: Option<i32>,
    pub new_line_number: Option<i32>,
    pub selection_start_line: i32,
    pub selection_end_line: i32,
    pub comment_text: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub submitted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum CommentStatus {
    Draft,
    Submitted,
}

impl TryFrom<String> for CommentStatus {
    type Error = String;

    fn try_from(s: String) -> Result<Self, Self::Error> {
        match s.as_str() {
            "draft" => Ok(CommentStatus::Draft),
            "submitted" => Ok(CommentStatus::Submitted),
            _ => Err(format!("Invalid comment status: {}", s)),
        }
    }
}

impl From<CommentStatus> for String {
    fn from(status: CommentStatus) -> Self {
        match status {
            CommentStatus::Draft => "draft".to_string(),
            CommentStatus::Submitted => "submitted".to_string(),
        }
    }
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateDiffCommentRequest {
    pub project_id: Uuid,
    pub task_id: Uuid,
    pub attempt_id: Uuid,
    pub file_path: String,
    pub old_line_number: Option<i32>,
    pub new_line_number: Option<i32>,
    pub selection_start_line: i32,
    pub selection_end_line: i32,
    pub comment_text: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateDiffCommentRequest {
    pub comment_text: Option<String>,
    pub status: Option<CommentStatus>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct SubmitDraftCommentsRequest {
    pub comment_ids: Vec<String>,
    pub auto_execute: Option<bool>,
    pub formatted_prompt: Option<String>,
}

impl DiffComment {
    pub fn get_status(&self) -> CommentStatus {
        match self.status.as_str() {
            "draft" => CommentStatus::Draft,
            "submitted" => CommentStatus::Submitted,
            _ => CommentStatus::Draft,
        }
    }

    pub async fn create(
        pool: &SqlitePool,
        request: CreateDiffCommentRequest,
    ) -> anyhow::Result<DiffComment> {
        let id = uuid::Uuid::new_v4().to_string();
        let status = "draft".to_string();
        let created_at = chrono::Utc::now().to_rfc3339();
        let updated_at = created_at.clone();

        sqlx::query!(
            r#"
            INSERT INTO diff_comments (
                id, project_id, task_id, attempt_id, file_path,
                old_line_number, new_line_number, selection_start_line, selection_end_line,
                comment_text, status, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            "#,
            id,
            request.project_id,
            request.task_id,
            request.attempt_id,
            request.file_path,
            request.old_line_number,
            request.new_line_number,
            request.selection_start_line,
            request.selection_end_line,
            request.comment_text,
            status,
            created_at,
            updated_at
        )
        .execute(pool)
        .await?;

        Self::get_by_id(pool, &id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Failed to fetch created comment"))
    }

    pub async fn get_by_id(pool: &SqlitePool, id: &str) -> anyhow::Result<Option<DiffComment>> {
        sqlx::query_as!(
            DiffComment,
            r#"
            SELECT 
                id as "id!: String",
                project_id as "project_id!: Uuid",
                task_id as "task_id!: Uuid",
                attempt_id as "attempt_id!: Uuid",
                file_path as "file_path!: String",
                CAST(old_line_number AS INTEGER) as "old_line_number: i32",
                CAST(new_line_number AS INTEGER) as "new_line_number: i32",
                CAST(selection_start_line AS INTEGER) as "selection_start_line!: i32",
                CAST(selection_end_line AS INTEGER) as "selection_end_line!: i32",
                comment_text as "comment_text!: String",
                status as "status!: String",
                datetime(created_at) as "created_at!: String",
                datetime(updated_at) as "updated_at!: String",
                datetime(submitted_at) as "submitted_at: String"
            FROM diff_comments WHERE id = ?1
            "#,
            id
        )
        .fetch_optional(pool)
        .await
        .map_err(Into::into)
    }

    pub async fn list_by_attempt(
        pool: &SqlitePool,
        task_id: &str,
        attempt_id: &str,
    ) -> anyhow::Result<Vec<DiffComment>> {
        let task_uuid = Uuid::parse_str(task_id)?;
        let attempt_uuid = Uuid::parse_str(attempt_id)?;
        
        sqlx::query_as!(
            DiffComment,
            r#"
            SELECT 
                id as "id!: String",
                project_id as "project_id!: Uuid",
                task_id as "task_id!: Uuid",
                attempt_id as "attempt_id!: Uuid",
                file_path as "file_path!: String",
                CAST(old_line_number AS INTEGER) as "old_line_number: i32",
                CAST(new_line_number AS INTEGER) as "new_line_number: i32",
                CAST(selection_start_line AS INTEGER) as "selection_start_line!: i32",
                CAST(selection_end_line AS INTEGER) as "selection_end_line!: i32",
                comment_text as "comment_text!: String",
                status as "status!: String",
                datetime(created_at) as "created_at!: String",
                datetime(updated_at) as "updated_at!: String",
                datetime(submitted_at) as "submitted_at: String"
            FROM diff_comments 
            WHERE task_id = ?1 AND attempt_id = ?2
            ORDER BY file_path, selection_start_line
            "#,
            task_uuid,
            attempt_uuid
        )
        .fetch_all(pool)
        .await
        .map_err(Into::into)
    }

    pub async fn list_draft_comments(
        pool: &SqlitePool,
        task_id: &str,
        attempt_id: &str,
    ) -> anyhow::Result<Vec<DiffComment>> {
        let task_uuid = Uuid::parse_str(task_id)?;
        let attempt_uuid = Uuid::parse_str(attempt_id)?;
        
        sqlx::query_as!(
            DiffComment,
            r#"
            SELECT 
                id as "id!: String",
                project_id as "project_id!: Uuid",
                task_id as "task_id!: Uuid",
                attempt_id as "attempt_id!: Uuid",
                file_path as "file_path!: String",
                CAST(old_line_number AS INTEGER) as "old_line_number: i32",
                CAST(new_line_number AS INTEGER) as "new_line_number: i32",
                CAST(selection_start_line AS INTEGER) as "selection_start_line!: i32",
                CAST(selection_end_line AS INTEGER) as "selection_end_line!: i32",
                comment_text as "comment_text!: String",
                status as "status!: String",
                datetime(created_at) as "created_at!: String",
                datetime(updated_at) as "updated_at!: String",
                datetime(submitted_at) as "submitted_at: String"
            FROM diff_comments 
            WHERE task_id = ?1 AND attempt_id = ?2 AND status = 'draft'
            ORDER BY created_at
            "#,
            task_uuid,
            attempt_uuid
        )
        .fetch_all(pool)
        .await
        .map_err(Into::into)
    }

    pub async fn update(
        pool: &SqlitePool,
        id: &str,
        request: UpdateDiffCommentRequest,
    ) -> anyhow::Result<DiffComment> {
        let comment = Self::get_by_id(pool, id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Comment not found"))?;

        let comment_text = request.comment_text.unwrap_or(comment.comment_text);
        let status = request.status.map(|s| s.into()).unwrap_or(comment.status);
        
        let should_set_submitted = status == "submitted" && comment.submitted_at.is_none();

        sqlx::query!(
            r#"
            UPDATE diff_comments 
            SET comment_text = ?2, status = ?3, updated_at = datetime('now'), 
                submitted_at = CASE WHEN ?4 THEN datetime('now') ELSE submitted_at END
            WHERE id = ?1
            "#,
            id,
            comment_text,
            status,
            should_set_submitted
        )
        .execute(pool)
        .await?;
        
        Self::get_by_id(pool, id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Failed to fetch updated comment"))
    }

    pub async fn delete(pool: &SqlitePool, id: &str) -> anyhow::Result<()> {
        sqlx::query!(
            r#"
            DELETE FROM diff_comments WHERE id = ?1
            "#,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn submit_draft_comments(
        pool: &SqlitePool,
        comment_ids: Vec<String>,
    ) -> anyhow::Result<Vec<DiffComment>> {
        let mut comments = Vec::new();
        for id in comment_ids {
            sqlx::query!(
                r#"
                UPDATE diff_comments 
                SET status = 'submitted', submitted_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ?1 AND status = 'draft'
                "#,
                id
            )
            .execute(pool)
            .await?;
            
            if let Some(comment) = Self::get_by_id(pool, &id).await? {
                comments.push(comment);
            }
        }
        
        Ok(comments)
    }

    pub async fn get_combined_prompt(
        pool: &SqlitePool,
        comment_ids: Vec<String>,
    ) -> anyhow::Result<String> {
        let mut prompt = String::from("Please review the following code comments and suggestions:\n\n");
        let mut comments = Vec::new();
        
        // Fetch all comments
        for id in comment_ids {
            if let Some(comment) = Self::get_by_id(pool, &id).await? {
                comments.push(comment);
            }
        }
        
        // Group by file
        let mut grouped_by_file: std::collections::HashMap<String, Vec<DiffComment>> = std::collections::HashMap::new();
        for comment in comments {
            grouped_by_file.entry(comment.file_path.clone()).or_insert_with(Vec::new).push(comment);
        }
        
        // Format like the frontend
        for (file_path, file_comments) in grouped_by_file {
            prompt.push_str(&format!("\n### {}\n\n", file_path));
            for comment in file_comments {
                prompt.push_str(&format!(
                    "**Lines {}-{}:**\n{}\n\n",
                    comment.selection_start_line,
                    comment.selection_end_line,
                    comment.comment_text
                ));
            }
        }
        
        prompt.push_str("\nPlease analyze these comments and provide improved code that addresses all the feedback.");
        
        Ok(prompt)
    }
}