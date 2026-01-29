use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum MigrationStateError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, EnumString, Display)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum EntityType {
    Project,
    Task,
    PrMerge,
    Workspace,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, EnumString, Display, Default)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum MigrationStatus {
    #[default]
    Pending,
    Migrated,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct MigrationState {
    pub id: Uuid,
    pub entity_type: EntityType,
    pub local_id: Uuid,
    pub remote_id: Option<Uuid>,
    pub status: MigrationStatus,
    pub error_message: Option<String>,
    pub attempt_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMigrationState {
    pub entity_type: EntityType,
    pub local_id: Uuid,
}

impl MigrationState {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, MigrationStateError> {
        let records = sqlx::query_as!(
            MigrationState,
            r#"SELECT
                id as "id!: Uuid",
                entity_type as "entity_type!: EntityType",
                local_id as "local_id!: Uuid",
                remote_id as "remote_id: Uuid",
                status as "status!: MigrationStatus",
                error_message,
                attempt_count as "attempt_count!",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM migration_state
            ORDER BY created_at ASC"#
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }

    pub async fn find_by_entity_type(
        pool: &SqlitePool,
        entity_type: EntityType,
    ) -> Result<Vec<Self>, MigrationStateError> {
        let entity_type_str = entity_type.to_string();
        let records = sqlx::query_as!(
            MigrationState,
            r#"SELECT
                id as "id!: Uuid",
                entity_type as "entity_type!: EntityType",
                local_id as "local_id!: Uuid",
                remote_id as "remote_id: Uuid",
                status as "status!: MigrationStatus",
                error_message,
                attempt_count as "attempt_count!",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM migration_state
            WHERE entity_type = $1
            ORDER BY created_at ASC"#,
            entity_type_str
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }

    pub async fn find_by_status(
        pool: &SqlitePool,
        status: MigrationStatus,
    ) -> Result<Vec<Self>, MigrationStateError> {
        let status_str = status.to_string();
        let records = sqlx::query_as!(
            MigrationState,
            r#"SELECT
                id as "id!: Uuid",
                entity_type as "entity_type!: EntityType",
                local_id as "local_id!: Uuid",
                remote_id as "remote_id: Uuid",
                status as "status!: MigrationStatus",
                error_message,
                attempt_count as "attempt_count!",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM migration_state
            WHERE status = $1
            ORDER BY created_at ASC"#,
            status_str
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }

    pub async fn find_pending_by_type(
        pool: &SqlitePool,
        entity_type: EntityType,
    ) -> Result<Vec<Self>, MigrationStateError> {
        let entity_type_str = entity_type.to_string();
        let records = sqlx::query_as!(
            MigrationState,
            r#"SELECT
                id as "id!: Uuid",
                entity_type as "entity_type!: EntityType",
                local_id as "local_id!: Uuid",
                remote_id as "remote_id: Uuid",
                status as "status!: MigrationStatus",
                error_message,
                attempt_count as "attempt_count!",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM migration_state
            WHERE entity_type = $1 AND status = 'pending'
            ORDER BY created_at ASC"#,
            entity_type_str
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }

    pub async fn find_by_entity(
        pool: &SqlitePool,
        entity_type: EntityType,
        local_id: Uuid,
    ) -> Result<Option<Self>, MigrationStateError> {
        let entity_type_str = entity_type.to_string();
        let record = sqlx::query_as!(
            MigrationState,
            r#"SELECT
                id as "id!: Uuid",
                entity_type as "entity_type!: EntityType",
                local_id as "local_id!: Uuid",
                remote_id as "remote_id: Uuid",
                status as "status!: MigrationStatus",
                error_message,
                attempt_count as "attempt_count!",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM migration_state
            WHERE entity_type = $1 AND local_id = $2"#,
            entity_type_str,
            local_id
        )
        .fetch_optional(pool)
        .await?;
        Ok(record)
    }

    pub async fn get_remote_id(
        pool: &SqlitePool,
        entity_type: EntityType,
        local_id: Uuid,
    ) -> Result<Option<Uuid>, MigrationStateError> {
        let entity_type_str = entity_type.to_string();
        let record = sqlx::query_scalar!(
            r#"SELECT remote_id as "remote_id: Uuid"
            FROM migration_state
            WHERE entity_type = $1 AND local_id = $2 AND status = 'migrated'"#,
            entity_type_str,
            local_id
        )
        .fetch_optional(pool)
        .await?;
        Ok(record.flatten())
    }

    pub async fn create<'e, E>(
        executor: E,
        data: &CreateMigrationState,
    ) -> Result<Self, MigrationStateError>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let id = Uuid::new_v4();
        let entity_type_str = data.entity_type.to_string();
        let record = sqlx::query_as!(
            MigrationState,
            r#"INSERT INTO migration_state (id, entity_type, local_id)
            VALUES ($1, $2, $3)
            RETURNING
                id as "id!: Uuid",
                entity_type as "entity_type!: EntityType",
                local_id as "local_id!: Uuid",
                remote_id as "remote_id: Uuid",
                status as "status!: MigrationStatus",
                error_message,
                attempt_count as "attempt_count!",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            entity_type_str,
            data.local_id
        )
        .fetch_one(executor)
        .await?;
        Ok(record)
    }

    pub async fn upsert<'e, E>(
        executor: E,
        data: &CreateMigrationState,
    ) -> Result<Self, MigrationStateError>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let id = Uuid::new_v4();
        let entity_type_str = data.entity_type.to_string();
        let record = sqlx::query_as!(
            MigrationState,
            r#"INSERT INTO migration_state (id, entity_type, local_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (entity_type, local_id) DO UPDATE SET
                updated_at = datetime('now', 'subsec')
            RETURNING
                id as "id!: Uuid",
                entity_type as "entity_type!: EntityType",
                local_id as "local_id!: Uuid",
                remote_id as "remote_id: Uuid",
                status as "status!: MigrationStatus",
                error_message,
                attempt_count as "attempt_count!",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            entity_type_str,
            data.local_id
        )
        .fetch_one(executor)
        .await?;
        Ok(record)
    }

    pub async fn mark_migrated<'e, E>(
        executor: E,
        entity_type: EntityType,
        local_id: Uuid,
        remote_id: Uuid,
    ) -> Result<(), MigrationStateError>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let entity_type_str = entity_type.to_string();
        sqlx::query!(
            r#"UPDATE migration_state
            SET status = 'migrated',
                remote_id = $3,
                error_message = NULL,
                updated_at = datetime('now', 'subsec')
            WHERE entity_type = $1 AND local_id = $2"#,
            entity_type_str,
            local_id,
            remote_id
        )
        .execute(executor)
        .await?;
        Ok(())
    }

    pub async fn mark_failed<'e, E>(
        executor: E,
        entity_type: EntityType,
        local_id: Uuid,
        error_message: &str,
    ) -> Result<(), MigrationStateError>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let entity_type_str = entity_type.to_string();
        sqlx::query!(
            r#"UPDATE migration_state
            SET status = 'failed',
                error_message = $3,
                attempt_count = attempt_count + 1,
                updated_at = datetime('now', 'subsec')
            WHERE entity_type = $1 AND local_id = $2"#,
            entity_type_str,
            local_id,
            error_message
        )
        .execute(executor)
        .await?;
        Ok(())
    }

    pub async fn mark_skipped<'e, E>(
        executor: E,
        entity_type: EntityType,
        local_id: Uuid,
        reason: &str,
    ) -> Result<(), MigrationStateError>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let entity_type_str = entity_type.to_string();
        sqlx::query!(
            r#"UPDATE migration_state
            SET status = 'skipped',
                error_message = $3,
                updated_at = datetime('now', 'subsec')
            WHERE entity_type = $1 AND local_id = $2"#,
            entity_type_str,
            local_id,
            reason
        )
        .execute(executor)
        .await?;
        Ok(())
    }

    pub async fn reset_failed(pool: &SqlitePool) -> Result<u64, MigrationStateError> {
        let result = sqlx::query!(
            r#"UPDATE migration_state
            SET status = 'pending',
                error_message = NULL,
                updated_at = datetime('now', 'subsec')
            WHERE status = 'failed'"#
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn get_stats(pool: &SqlitePool) -> Result<MigrationStats, MigrationStateError> {
        let stats = sqlx::query_as!(
            MigrationStats,
            r#"SELECT
                COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as "pending!: i64",
                COALESCE(SUM(CASE WHEN status = 'migrated' THEN 1 ELSE 0 END), 0) as "migrated!: i64",
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as "failed!: i64",
                COALESCE(SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END), 0) as "skipped!: i64",
                COUNT(*) as "total!: i64"
            FROM migration_state"#
        )
        .fetch_one(pool)
        .await?;
        Ok(stats)
    }

    pub async fn clear_all(pool: &SqlitePool) -> Result<u64, MigrationStateError> {
        let result = sqlx::query!("DELETE FROM migration_state")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MigrationStats {
    pub pending: i64,
    pub migrated: i64,
    pub failed: i64,
    pub skipped: i64,
    pub total: i64,
}
