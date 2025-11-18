use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Error)]
pub enum TagError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TagRepository;

impl TagRepository {
    pub async fn find_by_id(tx: &mut Tx<'_>, id: Uuid) -> Result<Option<Tag>, TagError> {
        let record = sqlx::query_as!(
            Tag,
            r#"
            SELECT
                id          AS "id!: Uuid",
                project_id  AS "project_id!: Uuid",
                name        AS "name!",
                color       AS "color!"
            FROM tags
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Tag>, TagError> {
        let record = sqlx::query_as!(
            Tag,
            r#"
            SELECT
                id          AS "id!: Uuid",
                project_id  AS "project_id!: Uuid",
                name        AS "name!",
                color       AS "color!"
            FROM tags
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }
}
