use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

/// un commit pendiente que espera que el usuario provea el título
/// se crea cuando el modo de commit es Manual y hay cambios para commitear
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct PendingCommit {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub repo_id: Uuid,
    /// path del repo dentro del workspace
    pub repo_path: String,
    /// resumen de los cambios (diff stats o descripción)
    pub diff_summary: String,
    /// summary del agente si está disponible
    pub agent_summary: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreatePendingCommit {
    pub workspace_id: Uuid,
    pub repo_id: Uuid,
    pub repo_path: String,
    pub diff_summary: String,
    pub agent_summary: Option<String>,
}

impl PendingCommit {
    /// crear un nuevo pending commit
    pub async fn create(
        pool: &SqlitePool,
        data: &CreatePendingCommit,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        sqlx::query_as!(
            PendingCommit,
            r#"INSERT INTO pending_commits (
                id, workspace_id, repo_id, repo_path, diff_summary, agent_summary, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
                id as "id!: Uuid",
                workspace_id as "workspace_id!: Uuid",
                repo_id as "repo_id!: Uuid",
                repo_path,
                diff_summary,
                agent_summary,
                created_at as "created_at!: DateTime<Utc>"
            "#,
            id,
            data.workspace_id,
            data.repo_id,
            data.repo_path,
            data.diff_summary,
            data.agent_summary,
            now
        )
        .fetch_one(pool)
        .await
    }

    /// encontrar todos los pending commits
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            PendingCommit,
            r#"SELECT
                id as "id!: Uuid",
                workspace_id as "workspace_id!: Uuid",
                repo_id as "repo_id!: Uuid",
                repo_path,
                diff_summary,
                agent_summary,
                created_at as "created_at!: DateTime<Utc>"
            FROM pending_commits
            ORDER BY created_at ASC"#
        )
        .fetch_all(pool)
        .await
    }

    /// encontrar pending commits por workspace
    pub async fn find_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            PendingCommit,
            r#"SELECT
                id as "id!: Uuid",
                workspace_id as "workspace_id!: Uuid",
                repo_id as "repo_id!: Uuid",
                repo_path,
                diff_summary,
                agent_summary,
                created_at as "created_at!: DateTime<Utc>"
            FROM pending_commits
            WHERE workspace_id = $1
            ORDER BY created_at ASC"#,
            workspace_id
        )
        .fetch_all(pool)
        .await
    }

    /// encontrar un pending commit por id
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            PendingCommit,
            r#"SELECT
                id as "id!: Uuid",
                workspace_id as "workspace_id!: Uuid",
                repo_id as "repo_id!: Uuid",
                repo_path,
                diff_summary,
                agent_summary,
                created_at as "created_at!: DateTime<Utc>"
            FROM pending_commits
            WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// contar pending commits
    pub async fn count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!: i64" FROM pending_commits"#)
            .fetch_one(pool)
            .await
    }

    /// eliminar un pending commit por id
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM pending_commits WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// eliminar todos los pending commits de un workspace
    pub async fn delete_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM pending_commits WHERE workspace_id = $1")
            .bind(workspace_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// eliminar todos los pending commits
    pub async fn delete_all(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM pending_commits")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
