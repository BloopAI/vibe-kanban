//! Cached node project model for storing project information synced from the hive.
//!
//! This provides a local cache of all projects across all nodes in the organization,
//! allowing the frontend to show a unified view.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::cached_node::CachedNodeStatus;

/// A cached node project from the hive
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct CachedNodeProject {
    pub id: Uuid,
    pub node_id: Uuid,
    pub project_id: Uuid,
    pub local_project_id: Uuid,
    pub project_name: String,
    pub git_repo_path: String,
    pub default_branch: String,
    pub sync_status: String,
    #[ts(type = "Date | null")]
    pub last_synced_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub cached_at: DateTime<Utc>,
}

/// A cached node project with joined node information for display
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct CachedNodeProjectWithNode {
    pub id: Uuid,
    pub node_id: Uuid,
    pub project_id: Uuid,
    pub local_project_id: Uuid,
    pub project_name: String,
    pub git_repo_path: String,
    pub default_branch: String,
    pub sync_status: String,
    #[ts(type = "Date | null")]
    pub last_synced_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub cached_at: DateTime<Utc>,
    // Joined node fields
    pub node_name: String,
    #[sqlx(try_from = "String")]
    pub node_status: CachedNodeStatus,
    pub node_public_url: Option<String>,
}

/// Input for creating/updating a cached node project
#[derive(Debug, Clone)]
pub struct CachedNodeProjectInput {
    pub id: Uuid,
    pub node_id: Uuid,
    pub project_id: Uuid,
    pub local_project_id: Uuid,
    pub project_name: String,
    pub git_repo_path: String,
    pub default_branch: String,
    pub sync_status: String,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl CachedNodeProject {
    /// List all cached projects for a node
    pub async fn list_by_node(
        pool: &SqlitePool,
        node_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            CachedNodeProject,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                node_id             AS "node_id!: Uuid",
                project_id          AS "project_id!: Uuid",
                local_project_id    AS "local_project_id!: Uuid",
                project_name        AS "project_name!",
                git_repo_path       AS "git_repo_path!",
                default_branch      AS "default_branch!",
                sync_status         AS "sync_status!",
                last_synced_at      AS "last_synced_at?: DateTime<Utc>",
                created_at          AS "created_at!: DateTime<Utc>",
                cached_at           AS "cached_at!: DateTime<Utc>"
            FROM cached_node_projects
            WHERE node_id = $1
            ORDER BY project_name ASC
            "#,
            node_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find a cached project by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            CachedNodeProject,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                node_id             AS "node_id!: Uuid",
                project_id          AS "project_id!: Uuid",
                local_project_id    AS "local_project_id!: Uuid",
                project_name        AS "project_name!",
                git_repo_path       AS "git_repo_path!",
                default_branch      AS "default_branch!",
                sync_status         AS "sync_status!",
                last_synced_at      AS "last_synced_at?: DateTime<Utc>",
                created_at          AS "created_at!: DateTime<Utc>",
                cached_at           AS "cached_at!: DateTime<Utc>"
            FROM cached_node_projects
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Upsert a cached node project
    pub async fn upsert(
        pool: &SqlitePool,
        data: CachedNodeProjectInput,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            CachedNodeProject,
            r#"
            INSERT INTO cached_node_projects (
                id, node_id, project_id, local_project_id, project_name,
                git_repo_path, default_branch, sync_status, last_synced_at,
                created_at, cached_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, datetime('now', 'subsec')
            )
            ON CONFLICT(id) DO UPDATE SET
                node_id           = excluded.node_id,
                project_id        = excluded.project_id,
                local_project_id  = excluded.local_project_id,
                project_name      = excluded.project_name,
                git_repo_path     = excluded.git_repo_path,
                default_branch    = excluded.default_branch,
                sync_status       = excluded.sync_status,
                last_synced_at    = excluded.last_synced_at,
                created_at        = excluded.created_at,
                cached_at         = datetime('now', 'subsec')
            RETURNING
                id                  AS "id!: Uuid",
                node_id             AS "node_id!: Uuid",
                project_id          AS "project_id!: Uuid",
                local_project_id    AS "local_project_id!: Uuid",
                project_name        AS "project_name!",
                git_repo_path       AS "git_repo_path!",
                default_branch      AS "default_branch!",
                sync_status         AS "sync_status!",
                last_synced_at      AS "last_synced_at?: DateTime<Utc>",
                created_at          AS "created_at!: DateTime<Utc>",
                cached_at           AS "cached_at!: DateTime<Utc>"
            "#,
            data.id,
            data.node_id,
            data.project_id,
            data.local_project_id,
            data.project_name,
            data.git_repo_path,
            data.default_branch,
            data.sync_status,
            data.last_synced_at,
            data.created_at
        )
        .fetch_one(pool)
        .await
    }

    /// Remove projects for a node that are not in the given list
    pub async fn remove_stale_for_node(
        pool: &SqlitePool,
        node_id: Uuid,
        keep_ids: &[Uuid],
    ) -> Result<u64, sqlx::Error> {
        if keep_ids.is_empty() {
            let result = sqlx::query!(
                "DELETE FROM cached_node_projects WHERE node_id = $1",
                node_id
            )
            .execute(pool)
            .await?;
            return Ok(result.rows_affected());
        }

        let placeholders: Vec<String> = keep_ids.iter().map(|id| format!("'{}'", id)).collect();
        let in_clause = placeholders.join(", ");

        let query = format!(
            "DELETE FROM cached_node_projects WHERE node_id = ? AND id NOT IN ({})",
            in_clause
        );

        let result = sqlx::query(&query).bind(node_id).execute(pool).await?;

        Ok(result.rows_affected())
    }

    /// Remove a specific cached project
    pub async fn remove(pool: &SqlitePool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM cached_node_projects WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

impl CachedNodeProjectWithNode {
    /// List all cached projects with node info, excluding those linked to local projects
    pub async fn find_all_excluding(
        pool: &SqlitePool,
        organization_id: Uuid,
        exclude_project_ids: &[Uuid],
    ) -> Result<Vec<Self>, sqlx::Error> {
        // Build exclusion clause
        let exclude_clause = if exclude_project_ids.is_empty() {
            String::new()
        } else {
            let placeholders: Vec<String> = exclude_project_ids
                .iter()
                .map(|id| format!("'{}'", id))
                .collect();
            format!(" AND cnp.project_id NOT IN ({})", placeholders.join(", "))
        };

        let query = format!(
            r#"
            SELECT
                cnp.id                  AS "id!: Uuid",
                cnp.node_id             AS "node_id!: Uuid",
                cnp.project_id          AS "project_id!: Uuid",
                cnp.local_project_id    AS "local_project_id!: Uuid",
                cnp.project_name        AS "project_name!",
                cnp.git_repo_path       AS "git_repo_path!",
                cnp.default_branch      AS "default_branch!",
                cnp.sync_status         AS "sync_status!",
                cnp.last_synced_at      AS "last_synced_at?: DateTime<Utc>",
                cnp.created_at          AS "created_at!: DateTime<Utc>",
                cnp.cached_at           AS "cached_at!: DateTime<Utc>",
                cn.name                 AS "node_name!",
                cn.status               AS "node_status!: String",
                cn.public_url           AS "node_public_url?"
            FROM cached_node_projects cnp
            JOIN cached_nodes cn ON cnp.node_id = cn.id
            WHERE cn.organization_id = ?{}
            ORDER BY cn.name ASC, cnp.project_name ASC
            "#,
            exclude_clause
        );

        sqlx::query_as(&query)
            .bind(organization_id)
            .fetch_all(pool)
            .await
    }

    /// List all cached projects with node info for an organization
    pub async fn list_by_organization(
        pool: &SqlitePool,
        organization_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        Self::find_all_excluding(pool, organization_id, &[]).await
    }

    /// List all cached projects with node info (across all organizations),
    /// excluding those with project_ids in the given list
    pub async fn find_all_with_exclusions(
        pool: &SqlitePool,
        exclude_project_ids: &[Uuid],
    ) -> Result<Vec<Self>, sqlx::Error> {
        Self::find_remote_projects(pool, exclude_project_ids, None).await
    }

    /// List all cached projects with node info (across all organizations),
    /// excluding those with project_ids in the given list AND excluding the current node.
    ///
    /// This is the primary method for getting "remote" projects to display in the unified view.
    /// It excludes:
    /// - Projects already linked locally (via exclude_project_ids)
    /// - Projects from the current node (via exclude_node_id)
    pub async fn find_remote_projects(
        pool: &SqlitePool,
        exclude_project_ids: &[Uuid],
        exclude_node_id: Option<Uuid>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        // Build WHERE clauses
        let mut conditions: Vec<String> = Vec::new();

        // Exclude by project_id (already linked locally)
        if !exclude_project_ids.is_empty() {
            let placeholders: Vec<String> = exclude_project_ids
                .iter()
                .map(|id| format!("'{}'", id))
                .collect();
            conditions.push(format!("cnp.project_id NOT IN ({})", placeholders.join(", ")));
        }

        // Exclude current node's projects
        if let Some(node_id) = exclude_node_id {
            conditions.push(format!("cnp.node_id != '{}'", node_id));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", conditions.join(" AND "))
        };

        let query = format!(
            r#"
            SELECT
                cnp.id                  AS "id!: Uuid",
                cnp.node_id             AS "node_id!: Uuid",
                cnp.project_id          AS "project_id!: Uuid",
                cnp.local_project_id    AS "local_project_id!: Uuid",
                cnp.project_name        AS "project_name!",
                cnp.git_repo_path       AS "git_repo_path!",
                cnp.default_branch      AS "default_branch!",
                cnp.sync_status         AS "sync_status!",
                cnp.last_synced_at      AS "last_synced_at?: DateTime<Utc>",
                cnp.created_at          AS "created_at!: DateTime<Utc>",
                cnp.cached_at           AS "cached_at!: DateTime<Utc>",
                cn.name                 AS "node_name!",
                cn.status               AS "node_status!: String",
                cn.public_url           AS "node_public_url?"
            FROM cached_node_projects cnp
            JOIN cached_nodes cn ON cnp.node_id = cn.id
            {}
            ORDER BY cn.name ASC, cnp.project_name ASC
            "#,
            where_clause
        );

        sqlx::query_as(&query).fetch_all(pool).await
    }

    /// List all cached projects with node info (across all organizations)
    pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        Self::find_all_with_exclusions(pool, &[]).await
    }
}

/// Cursor for tracking node sync state
#[derive(Debug, Clone, FromRow)]
pub struct NodeSyncCursor {
    pub organization_id: Uuid,
    pub last_synced_at: DateTime<Utc>,
    pub sync_version: i64,
}

impl NodeSyncCursor {
    /// Get the sync cursor for an organization
    pub async fn get(
        pool: &SqlitePool,
        organization_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            NodeSyncCursor,
            r#"
            SELECT
                organization_id AS "organization_id!: Uuid",
                last_synced_at  AS "last_synced_at!: DateTime<Utc>",
                sync_version    AS "sync_version!: i64"
            FROM node_sync_cursors
            WHERE organization_id = $1
            "#,
            organization_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Update the sync cursor
    pub async fn update(pool: &SqlitePool, organization_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            INSERT INTO node_sync_cursors (organization_id, last_synced_at, sync_version)
            VALUES ($1, datetime('now', 'subsec'), 1)
            ON CONFLICT(organization_id) DO UPDATE SET
                last_synced_at = datetime('now', 'subsec'),
                sync_version = node_sync_cursors.sync_version + 1
            "#,
            organization_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }
}
