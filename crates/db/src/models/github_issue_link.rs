use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Sqlite, Transaction};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct GitHubIssueLink {
    pub id: Uuid,
    pub project_id: Uuid,
    pub task_id: Uuid,
    pub issue_id: i64,
    pub issue_number: i64,
    pub repo_owner: String,
    pub repo_name: String,
    pub html_url: String,
    pub title: String,
    pub state: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_synced_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NewGitHubIssueLink {
    pub project_id: Uuid,
    pub task_id: Uuid,
    pub issue_id: i64,
    pub issue_number: i64,
    pub repo_owner: String,
    pub repo_name: String,
    pub html_url: String,
    pub title: String,
    pub state: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl GitHubIssueLink {
    pub async fn create(
        pool: &SqlitePool,
        data: &NewGitHubIssueLink,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            GitHubIssueLink,
            r#"INSERT INTO github_issue_links (
                id, project_id, task_id, issue_id, issue_number, repo_owner, repo_name,
                html_url, title, state, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12
            ) RETURNING
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                task_id as "task_id!: Uuid",
                issue_id,
                issue_number,
                repo_owner,
                repo_name,
                html_url,
                title,
                state,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                last_synced_at as "last_synced_at?: DateTime<Utc>"
            "#,
            id,
            data.project_id,
            data.task_id,
            data.issue_id,
            data.issue_number,
            data.repo_owner,
            data.repo_name,
            data.html_url,
            data.title,
            data.state,
            data.created_at,
            data.updated_at
        )
        .fetch_one(pool)
        .await
    }

    pub async fn create_tx(
        tx: &mut Transaction<'_, Sqlite>,
        data: &NewGitHubIssueLink,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            GitHubIssueLink,
            r#"INSERT INTO github_issue_links (
                id, project_id, task_id, issue_id, issue_number, repo_owner, repo_name,
                html_url, title, state, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12
            ) RETURNING
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                task_id as "task_id!: Uuid",
                issue_id,
                issue_number,
                repo_owner,
                repo_name,
                html_url,
                title,
                state,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                last_synced_at as "last_synced_at?: DateTime<Utc>"
            "#,
            id,
            data.project_id,
            data.task_id,
            data.issue_id,
            data.issue_number,
            data.repo_owner,
            data.repo_name,
            data.html_url,
            data.title,
            data.state,
            data.created_at,
            data.updated_at
        )
        .fetch_one(&mut **tx)
        .await
    }

    pub async fn find_by_issue_id(
        pool: &SqlitePool,
        issue_id: i64,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubIssueLink,
            r#"SELECT 
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                task_id as "task_id!: Uuid",
                issue_id,
                issue_number,
                repo_owner,
                repo_name,
                html_url,
                title,
                state,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                last_synced_at as "last_synced_at?: DateTime<Utc>"
            FROM github_issue_links WHERE issue_id = $1"#,
            issue_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_repo_and_number(
        pool: &SqlitePool,
        project_id: Uuid,
        owner: &str,
        name: &str,
        number: i64,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubIssueLink,
            r#"SELECT 
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                task_id as "task_id!: Uuid",
                issue_id,
                issue_number,
                repo_owner,
                repo_name,
                html_url,
                title,
                state,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                last_synced_at as "last_synced_at?: DateTime<Utc>"
            FROM github_issue_links 
            WHERE project_id = $1 AND repo_owner = $2 AND repo_name = $3 AND issue_number = $4"#,
            project_id,
            owner,
            name,
            number
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn list_for_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubIssueLink,
            r#"SELECT 
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                task_id as "task_id!: Uuid",
                issue_id,
                issue_number,
                repo_owner,
                repo_name,
                html_url,
                title,
                state,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                last_synced_at as "last_synced_at?: DateTime<Utc>"
            FROM github_issue_links WHERE project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubIssueLink,
            r#"SELECT 
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                task_id as "task_id!: Uuid",
                issue_id,
                issue_number,
                repo_owner,
                repo_name,
                html_url,
                title,
                state,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                last_synced_at as "last_synced_at?: DateTime<Utc>"
            FROM github_issue_links WHERE task_id = $1"#,
            task_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn update_state_and_synced(
        pool: &SqlitePool,
        id: Uuid,
        state: &str,
        updated_at: DateTime<Utc>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE github_issue_links SET state = ?, updated_at = ?, last_synced_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(state)
        .bind(updated_at)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{project::CreateProject, project::Project, task::CreateTask, task::Task};
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
    use std::str::FromStr;

    async fn setup_pool() -> SqlitePool {
        // Use an in-memory DB with a single connection and run embedded migrations
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn seed_project_and_task(pool: &SqlitePool) -> (uuid::Uuid, uuid::Uuid) {
        let project_id = uuid::Uuid::new_v4();
        let unique_repo_path = format!("/tmp/repo-{}", project_id);
        let project = Project::create(
            pool,
            &CreateProject {
                name: "test".into(),
                git_repo_path: unique_repo_path,
                use_existing_repo: true,
                setup_script: None,
                dev_script: None,
                cleanup_script: None,
                copy_files: None,
            },
            project_id,
        )
        .await
        .unwrap();

        let task_id = uuid::Uuid::new_v4();
        let _task = Task::create(
            pool,
            &CreateTask {
                project_id: project.id,
                title: "Sample task".into(),
                description: Some("desc".into()),
                parent_task_attempt: None,
                image_ids: None,
            },
            task_id,
        )
        .await
        .unwrap();

        (project.id, task_id)
    }

    fn sample_link(project_id: uuid::Uuid, task_id: uuid::Uuid) -> NewGitHubIssueLink {
        let now = chrono::Utc::now();
        NewGitHubIssueLink {
            project_id,
            task_id,
            issue_id: 123456789,
            issue_number: 46,
            repo_owner: "owner".into(),
            repo_name: "repo".into(),
            html_url: "https://github.com/owner/repo/issues/46".into(),
            title: "Issue title".into(),
            state: "open".into(),
            created_at: now,
            updated_at: now,
        }
    }

    #[tokio::test]
    async fn create_and_read_link() {
        let pool = setup_pool().await;
        let (project_id, task_id) = seed_project_and_task(&pool).await;
        let new_link = sample_link(project_id, task_id);
        let link = GitHubIssueLink::create(&pool, &new_link).await.unwrap();

        // find_by_issue_id
        let by_id = GitHubIssueLink::find_by_issue_id(&pool, new_link.issue_id)
            .await
            .unwrap()
            .expect("exists");
        assert_eq!(by_id.task_id, task_id);

        // find_by_repo_and_number
        let by_key = GitHubIssueLink::find_by_repo_and_number(
            &pool,
            project_id,
            &new_link.repo_owner,
            &new_link.repo_name,
            new_link.issue_number,
        )
        .await
        .unwrap()
        .expect("exists by tuple");
        assert_eq!(by_key.id, link.id);

        // list_for_project
        let listed = GitHubIssueLink::list_for_project(&pool, project_id)
            .await
            .unwrap();
        assert_eq!(listed.len(), 1);

        // find_by_task_id
        let by_task = GitHubIssueLink::find_by_task_id(&pool, task_id)
            .await
            .unwrap()
            .expect("exists by task_id");
        assert_eq!(by_task.issue_number, new_link.issue_number);
    }

    #[tokio::test]
    async fn uniqueness_constraints_hold() {
        let pool = setup_pool().await;
        let (project_id, task_id) = seed_project_and_task(&pool).await;
        let mut link = sample_link(project_id, task_id);
        let _ = GitHubIssueLink::create(&pool, &link).await.unwrap();

        // Same issue_id -> violation
        let (project_id2, task_id2) = seed_project_and_task(&pool).await;
        let mut dupe_issue = sample_link(project_id2, task_id2);
        dupe_issue.issue_id = link.issue_id; // same global id
        let err = GitHubIssueLink::create(&pool, &dupe_issue).await.err().unwrap();
        match err {
            sqlx::Error::Database(db_err) => {
                assert!(db_err.message().to_lowercase().contains("unique"));
            }
            other => panic!("expected database unique error, got {other:?}"),
        }

        // Same (project, owner, repo, number) -> violation
        link.issue_id = 999_999; // change global id
        let err2 = GitHubIssueLink::create(&pool, &link).await.err().unwrap();
        match err2 {
            sqlx::Error::Database(db_err) => {
                assert!(db_err.message().to_lowercase().contains("unique"));
            }
            other => panic!("expected database unique error, got {other:?}"),
        }
    }
}
