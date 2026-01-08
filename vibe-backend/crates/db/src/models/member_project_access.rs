use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use ts_rs::TS;
use uuid::Uuid;

/// Represents a member's access to a specific project
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MemberProjectAccess {
    pub id: Uuid,
    pub member_id: Uuid,
    pub project_id: Uuid,
    pub created_at: DateTime<Utc>,
}

/// Request to set member's project access (replaces all existing)
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct SetMemberProjectAccess {
    pub project_ids: Vec<Uuid>,
}

#[derive(Debug, sqlx::FromRow)]
struct MemberProjectAccessRow {
    id: Uuid,
    member_id: Uuid,
    project_id: Uuid,
    created_at: DateTime<Utc>,
}

impl From<MemberProjectAccessRow> for MemberProjectAccess {
    fn from(row: MemberProjectAccessRow) -> Self {
        Self {
            id: row.id,
            member_id: row.member_id,
            project_id: row.project_id,
            created_at: row.created_at,
        }
    }
}

impl MemberProjectAccess {
    /// Get all project IDs that a member has access to
    pub async fn get_project_ids_for_member(
        pool: &PgPool,
        member_id: Uuid,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        let rows = sqlx::query_scalar!(
            r#"SELECT project_id as "project_id!: Uuid"
               FROM member_project_access
               WHERE member_id = $1"#,
            member_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows)
    }

    /// Get all member IDs that have access to a project
    pub async fn get_member_ids_for_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        let rows = sqlx::query_scalar!(
            r#"SELECT member_id as "member_id!: Uuid"
               FROM member_project_access
               WHERE project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows)
    }

    /// Set member's project access (replaces all existing)
    pub async fn set_for_member(
        pool: &PgPool,
        member_id: Uuid,
        project_ids: &[Uuid],
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        // Start transaction
        let mut tx = pool.begin().await?;

        // Delete all existing access for this member
        sqlx::query!("DELETE FROM member_project_access WHERE member_id = $1", member_id)
            .execute(&mut *tx)
            .await?;

        // Insert new access entries
        for project_id in project_ids {
            let id = Uuid::new_v4();
            sqlx::query!(
                r#"INSERT INTO member_project_access (id, member_id, project_id)
                   VALUES ($1, $2, $3)"#,
                id,
                member_id,
                project_id
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;

        Ok(project_ids.to_vec())
    }

    /// Add access to a single project
    pub async fn add_project_access(
        pool: &PgPool,
        member_id: Uuid,
        project_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let row = sqlx::query_as!(
            MemberProjectAccessRow,
            r#"INSERT INTO member_project_access (id, member_id, project_id)
               VALUES ($1, $2, $3)
               ON CONFLICT(member_id, project_id) DO UPDATE SET id = member_project_access.id
               RETURNING id as "id!: Uuid",
                         member_id as "member_id!: Uuid",
                         project_id as "project_id!: Uuid",
                         created_at as "created_at!: DateTime<Utc>""#,
            id,
            member_id,
            project_id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Remove access to a single project
    pub async fn remove_project_access(
        pool: &PgPool,
        member_id: Uuid,
        project_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "DELETE FROM member_project_access WHERE member_id = $1 AND project_id = $2",
            member_id,
            project_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Check if member has access to a specific project
    pub async fn has_access(
        pool: &PgPool,
        member_id: Uuid,
        project_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let count = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!: i64"
               FROM member_project_access
               WHERE member_id = $1 AND project_id = $2"#,
            member_id,
            project_id
        )
        .fetch_one(pool)
        .await?;

        Ok(count > 0)
    }
}
