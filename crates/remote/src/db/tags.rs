use serde::{Deserialize, Serialize};
use sqlx::{Executor, PgPool, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::get_txid;
use crate::mutation_types::{DeleteResponse, MutationResponse};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

/// Default tags that are created for each new project
/// Colors are in HSL format: "H S% L%"
pub const DEFAULT_TAGS: &[(&str, &str)] = &[
    ("bug", "355 65% 53%"),
    ("feature", "124 82% 30%"),
    ("documentation", "205 100% 40%"),
    ("enhancement", "181 72% 78%"),
];

pub struct TagRepository;

impl TagRepository {
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Tag>, TagError> {
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

    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        project_id: Uuid,
        name: String,
        color: String,
    ) -> Result<MutationResponse<Tag>, TagError> {
        let mut tx = pool.begin().await?;

        let id = id.unwrap_or_else(Uuid::new_v4);
        let data = sqlx::query_as!(
            Tag,
            r#"
            INSERT INTO tags (id, project_id, name, color)
            VALUES ($1, $2, $3, $4)
            RETURNING
                id          AS "id!: Uuid",
                project_id  AS "project_id!: Uuid",
                name        AS "name!",
                color       AS "color!"
            "#,
            id,
            project_id,
            name,
            color
        )
        .fetch_one(&mut *tx)
        .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    /// Update a tag with partial fields. Uses COALESCE to preserve existing values
    /// when None is provided.
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: Option<String>,
        color: Option<String>,
    ) -> Result<MutationResponse<Tag>, TagError> {
        let mut tx = pool.begin().await?;

        let data = sqlx::query_as!(
            Tag,
            r#"
            UPDATE tags
            SET
                name = COALESCE($1, name),
                color = COALESCE($2, color)
            WHERE id = $3
            RETURNING
                id          AS "id!: Uuid",
                project_id  AS "project_id!: Uuid",
                name        AS "name!",
                color       AS "color!"
            "#,
            name,
            color,
            id
        )
        .fetch_one(&mut *tx)
        .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<DeleteResponse, TagError> {
        let mut tx = pool.begin().await?;

        sqlx::query!("DELETE FROM tags WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(DeleteResponse { txid })
    }

    pub async fn list_by_project(pool: &PgPool, project_id: Uuid) -> Result<Vec<Tag>, TagError> {
        let records = sqlx::query_as!(
            Tag,
            r#"
            SELECT
                id          AS "id!: Uuid",
                project_id  AS "project_id!: Uuid",
                name        AS "name!",
                color       AS "color!"
            FROM tags
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    pub async fn create_default_tags<'e, E>(
        executor: E,
        project_id: Uuid,
    ) -> Result<Vec<Tag>, TagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let names: Vec<String> = DEFAULT_TAGS.iter().map(|(n, _)| (*n).to_string()).collect();
        let colors: Vec<String> = DEFAULT_TAGS.iter().map(|(_, c)| (*c).to_string()).collect();

        let tags = sqlx::query_as!(
            Tag,
            r#"
            INSERT INTO tags (id, project_id, name, color)
            SELECT gen_random_uuid(), $1, name, color
            FROM UNNEST($2::text[], $3::text[]) AS t(name, color)
            RETURNING
                id          AS "id!: Uuid",
                project_id  AS "project_id!: Uuid",
                name        AS "name!",
                color       AS "color!"
            "#,
            project_id,
            &names,
            &colors
        )
        .fetch_all(executor)
        .await?;

        Ok(tags)
    }
}
