use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

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
pub const DEFAULT_TAGS: &[(&str, &str)] = &[
    ("bug", "#d73a4a"),
    ("feature", "#0e8a16"),
    ("documentation", "#0075ca"),
    ("enhancement", "#a2eeef"),
];

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
