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

    pub async fn create(
        tx: &mut Tx<'_>,
        project_id: Uuid,
        name: String,
        color: String,
    ) -> Result<Tag, TagError> {
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
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn create_with_pool(
        pool: &PgPool,
        project_id: Uuid,
        name: String,
        color: String,
    ) -> Result<Tag, TagError> {
        let mut tx = pool.begin().await?;
        let record = Self::create(&mut tx, project_id, name, color).await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn update(
        tx: &mut Tx<'_>,
        id: Uuid,
        name: String,
        color: String,
    ) -> Result<Tag, TagError> {
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
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn update_with_pool(
        pool: &PgPool,
        id: Uuid,
        name: String,
        color: String,
    ) -> Result<Tag, TagError> {
        let mut tx = pool.begin().await?;
        let record = Self::update(&mut tx, id, name, color).await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn delete(tx: &mut Tx<'_>, id: Uuid) -> Result<(), TagError> {
        sqlx::query!("DELETE FROM tags WHERE id = $1", id)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    pub async fn delete_with_pool(pool: &PgPool, id: Uuid) -> Result<(), TagError> {
        let mut tx = pool.begin().await?;
        Self::delete(&mut tx, id).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn list_by_project(tx: &mut Tx<'_>, project_id: Uuid) -> Result<Vec<Tag>, TagError> {
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
        .fetch_all(&mut **tx)
        .await?;

        Ok(records)
    }

    pub async fn fetch_by_project(pool: &PgPool, project_id: Uuid) -> Result<Vec<Tag>, TagError> {
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
}
