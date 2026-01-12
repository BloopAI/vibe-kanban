use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

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
    pub async fn find_by_id<'e, E>(executor: E, id: Uuid) -> Result<Option<Tag>, TagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
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
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn create<'e, E>(
        executor: E,
        project_id: Uuid,
        name: String,
        color: String,
    ) -> Result<Tag, TagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let record = sqlx::query_as!(
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
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn update<'e, E>(
        executor: E,
        id: Uuid,
        name: String,
        color: String,
    ) -> Result<Tag, TagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            Tag,
            r#"
            UPDATE tags
            SET
                name = $1,
                color = $2
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
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), TagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM tags WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }

    pub async fn list_by_project<'e, E>(executor: E, project_id: Uuid) -> Result<Vec<Tag>, TagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
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
        .fetch_all(executor)
        .await?;

        Ok(records)
    }
}
