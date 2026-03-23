use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncDirection {
    Inbound,
    Outbound,
}

impl SyncDirection {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Inbound => "inbound",
            Self::Outbound => "outbound",
        }
    }
}

pub async fn try_acquire(
    pool: &PgPool,
    connection_id: Uuid,
    issue_id: Uuid,
    direction: SyncDirection,
) -> sqlx::Result<bool> {
    sqlx::query!("DELETE FROM linear_sync_in_flight WHERE expires_at < NOW()")
        .execute(pool)
        .await?;

    let result = sqlx::query!(
        r#"
        INSERT INTO linear_sync_in_flight (connection_id, issue_id, direction, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '30 seconds')
        ON CONFLICT (connection_id, issue_id, direction) DO NOTHING
        "#,
        connection_id,
        issue_id,
        direction.as_str()
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected() == 1)
}

pub async fn outbound_in_flight(
    pool: &PgPool,
    connection_id: Uuid,
    issue_id: Uuid,
) -> sqlx::Result<bool> {
    let row = sqlx::query!(
        r#"
        SELECT 1 AS "exists: i32"
        FROM linear_sync_in_flight
        WHERE connection_id = $1 AND issue_id = $2 AND direction = 'outbound'
          AND expires_at > NOW()
        "#,
        connection_id,
        issue_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.is_some())
}

pub async fn release(
    pool: &PgPool,
    connection_id: Uuid,
    issue_id: Uuid,
    direction: SyncDirection,
) -> sqlx::Result<()> {
    sqlx::query!(
        "DELETE FROM linear_sync_in_flight WHERE connection_id = $1 AND issue_id = $2 AND direction = $3",
        connection_id,
        issue_id,
        direction.as_str()
    )
    .execute(pool)
    .await?;
    Ok(())
}
