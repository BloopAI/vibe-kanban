use chrono::Utc;
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use crate::nodes::NodeProject;

#[derive(Debug, Error)]
pub enum NodeProjectError {
    #[error("node project link not found")]
    NotFound,
    #[error("project already linked to a node")]
    ProjectAlreadyLinked,
    #[error("local project already linked on this node")]
    LocalProjectAlreadyLinked,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct NodeProjectRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> NodeProjectRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Link a project to a node
    pub async fn create(
        &self,
        node_id: Uuid,
        project_id: Uuid,
        local_project_id: Uuid,
        git_repo_path: &str,
        default_branch: &str,
    ) -> Result<NodeProject, NodeProjectError> {
        let link = sqlx::query_as::<_, NodeProject>(
            r#"
            INSERT INTO node_projects (node_id, project_id, local_project_id, git_repo_path, default_branch)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id,
                node_id,
                project_id,
                local_project_id,
                git_repo_path,
                default_branch,
                sync_status,
                last_synced_at,
                created_at
            "#,
        )
        .bind(node_id)
        .bind(project_id)
        .bind(local_project_id)
        .bind(git_repo_path)
        .bind(default_branch)
        .fetch_one(self.pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(ref db_err) = e {
                if db_err.constraint() == Some("node_projects_project_id_key") {
                    return NodeProjectError::ProjectAlreadyLinked;
                }
                if db_err.constraint() == Some("node_projects_node_id_local_project_id_key") {
                    return NodeProjectError::LocalProjectAlreadyLinked;
                }
            }
            NodeProjectError::Database(e)
        })?;

        Ok(link)
    }

    /// Find a node project link by ID
    pub async fn find_by_id(&self, link_id: Uuid) -> Result<Option<NodeProject>, NodeProjectError> {
        let link = sqlx::query_as::<_, NodeProject>(
            r#"
            SELECT
                id,
                node_id,
                project_id,
                local_project_id,
                git_repo_path,
                default_branch,
                sync_status,
                last_synced_at,
                created_at
            FROM node_projects
            WHERE id = $1
            "#,
        )
        .bind(link_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(link)
    }

    /// Find a node project link by project ID
    pub async fn find_by_project(&self, project_id: Uuid) -> Result<Option<NodeProject>, NodeProjectError> {
        let link = sqlx::query_as::<_, NodeProject>(
            r#"
            SELECT
                id,
                node_id,
                project_id,
                local_project_id,
                git_repo_path,
                default_branch,
                sync_status,
                last_synced_at,
                created_at
            FROM node_projects
            WHERE project_id = $1
            "#,
        )
        .bind(project_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(link)
    }

    /// List all project links for a node
    pub async fn list_by_node(&self, node_id: Uuid) -> Result<Vec<NodeProject>, NodeProjectError> {
        let links = sqlx::query_as::<_, NodeProject>(
            r#"
            SELECT
                id,
                node_id,
                project_id,
                local_project_id,
                git_repo_path,
                default_branch,
                sync_status,
                last_synced_at,
                created_at
            FROM node_projects
            WHERE node_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(node_id)
        .fetch_all(self.pool)
        .await?;

        Ok(links)
    }

    /// Update sync status
    pub async fn update_sync_status(
        &self,
        link_id: Uuid,
        sync_status: &str,
    ) -> Result<(), NodeProjectError> {
        let result = sqlx::query(
            r#"
            UPDATE node_projects
            SET sync_status = $2,
                last_synced_at = $3
            WHERE id = $1
            "#,
        )
        .bind(link_id)
        .bind(sync_status)
        .bind(Utc::now())
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(NodeProjectError::NotFound);
        }

        Ok(())
    }

    /// Delete a project link
    pub async fn delete(&self, link_id: Uuid) -> Result<(), NodeProjectError> {
        let result = sqlx::query(
            r#"
            DELETE FROM node_projects
            WHERE id = $1
            "#,
        )
        .bind(link_id)
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(NodeProjectError::NotFound);
        }

        Ok(())
    }

    /// Delete a project link by project ID
    pub async fn delete_by_project(&self, project_id: Uuid) -> Result<(), NodeProjectError> {
        sqlx::query(
            r#"
            DELETE FROM node_projects
            WHERE project_id = $1
            "#,
        )
        .bind(project_id)
        .execute(self.pool)
        .await?;

        Ok(())
    }
}
