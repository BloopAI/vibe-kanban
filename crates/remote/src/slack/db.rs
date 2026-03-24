use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SlackProjectConnection {
    pub id: Uuid,
    pub project_id: Uuid,
    pub channel_id: String,
    pub encrypted_bot_token: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct UpsertConnectionInput {
    pub project_id: Uuid,
    pub channel_id: String,
    pub encrypted_bot_token: String,
}

/// Get the Slack connection for a project. Returns None if not configured.
pub async fn get_connection_for_project(
    pool: &PgPool,
    project_id: Uuid,
) -> sqlx::Result<Option<SlackProjectConnection>> {
    sqlx::query_as!(
        SlackProjectConnection,
        r#"
        SELECT id, project_id, channel_id, encrypted_bot_token, created_at, updated_at
        FROM slack_project_connections
        WHERE project_id = $1
        "#,
        project_id
    )
    .fetch_optional(pool)
    .await
}

/// Get a connection by its UUID (used by the DELETE route).
pub async fn get_connection_by_id(
    pool: &PgPool,
    id: Uuid,
) -> sqlx::Result<Option<SlackProjectConnection>> {
    sqlx::query_as!(
        SlackProjectConnection,
        r#"
        SELECT id, project_id, channel_id, encrypted_bot_token, created_at, updated_at
        FROM slack_project_connections
        WHERE id = $1
        "#,
        id
    )
    .fetch_optional(pool)
    .await
}

/// Upsert a connection. On conflict (same project_id), update channel and token.
/// Returns the connection id.
pub async fn upsert_connection(pool: &PgPool, input: UpsertConnectionInput) -> sqlx::Result<Uuid> {
    let row = sqlx::query!(
        r#"
        INSERT INTO slack_project_connections (project_id, channel_id, encrypted_bot_token)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id)
        DO UPDATE SET
            channel_id          = EXCLUDED.channel_id,
            encrypted_bot_token = EXCLUDED.encrypted_bot_token,
            updated_at          = NOW()
        RETURNING id
        "#,
        input.project_id,
        input.channel_id,
        input.encrypted_bot_token,
    )
    .fetch_one(pool)
    .await?;
    Ok(row.id)
}

/// Delete a connection by id. Returns true if a row was deleted.
pub async fn delete_connection(pool: &PgPool, id: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query!("DELETE FROM slack_project_connections WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
