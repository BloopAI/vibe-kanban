use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ProjectRepo {
    pub id: Uuid,
    pub project_id: Uuid,
    pub repo_id: Uuid,
}

impl ProjectRepo {
    pub async fn find_by_repo_id(
        pool: &SqlitePool,
        repo_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid"
               FROM project_repos
               WHERE repo_id = $1"#,
            repo_id
        )
        .fetch_all(pool)
        .await
    }
}
