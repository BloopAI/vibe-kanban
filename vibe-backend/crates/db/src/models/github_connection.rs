use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct GitHubConnection {
    pub id: Uuid,
    /// Team ID - NULL for workspace-level connection
    pub team_id: Option<Uuid>,
    pub access_token: String,
    pub github_username: Option<String>,
    #[ts(type = "Date")]
    pub connected_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct GitHubRepository {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub repo_full_name: String,
    pub repo_name: String,
    pub repo_owner: String,
    pub repo_url: String,
    pub default_branch: Option<String>,
    pub is_private: bool,
    #[ts(type = "Date")]
    pub linked_at: DateTime<Utc>,
    /// Path in the repo where documents are synced (e.g., "docs/team-notes")
    pub sync_path: Option<String>,
    /// The folder ID in vibe-kanban that syncs to this repo
    pub sync_folder_id: Option<String>,
    /// Last sync timestamp
    #[ts(type = "Date | null")]
    pub last_synced_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateGitHubConnection {
    pub access_token: String,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateGitHubConnection {
    pub access_token: Option<String>,
    pub github_username: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct LinkGitHubRepository {
    pub repo_full_name: String,
    pub repo_name: String,
    pub repo_owner: String,
    pub repo_url: String,
    pub default_branch: Option<String>,
    pub is_private: bool,
}

/// Response type for GitHub connection with repositories
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubConnectionWithRepos {
    #[serde(flatten)]
    pub connection: GitHubConnection,
    pub repositories: Vec<GitHubRepository>,
}

impl GitHubConnection {
    /// Find workspace-level connection (team_id IS NULL)
    pub async fn find_workspace_connection(pool: &PgPool) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubConnection,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id: Uuid",
                      access_token,
                      github_username,
                      connected_at as "connected_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM github_connections
               WHERE team_id IS NULL"#
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_team_id(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubConnection,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id: Uuid",
                      access_token,
                      github_username,
                      connected_at as "connected_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM github_connections
               WHERE team_id = $1"#,
            team_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubConnection,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id: Uuid",
                      access_token,
                      github_username,
                      connected_at as "connected_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM github_connections
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a workspace-level connection (no team_id)
    pub async fn create_workspace_connection(
        pool: &PgPool,
        data: &CreateGitHubConnection,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            GitHubConnection,
            r#"INSERT INTO github_connections (id, team_id, access_token)
               VALUES ($1, NULL, $2)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id: Uuid",
                         access_token,
                         github_username,
                         connected_at as "connected_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.access_token
        )
        .fetch_one(pool)
        .await
    }

    pub async fn create(
        pool: &PgPool,
        team_id: Uuid,
        data: &CreateGitHubConnection,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            GitHubConnection,
            r#"INSERT INTO github_connections (id, team_id, access_token)
               VALUES ($1, $2, $3)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id: Uuid",
                         access_token,
                         github_username,
                         connected_at as "connected_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            team_id,
            data.access_token
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: &UpdateGitHubConnection,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let access_token = data.access_token.as_ref().unwrap_or(&existing.access_token);
        let github_username = data.github_username.clone().or(existing.github_username);

        sqlx::query_as!(
            GitHubConnection,
            r#"UPDATE github_connections
               SET access_token = $2, github_username = $3, updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         team_id as "team_id: Uuid",
                         access_token,
                         github_username,
                         connected_at as "connected_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            access_token,
            github_username
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM github_connections WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Delete workspace-level connection
    pub async fn delete_workspace_connection(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM github_connections WHERE team_id IS NULL")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_by_team_id(pool: &PgPool, team_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM github_connections WHERE team_id = $1", team_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

/// Sync configuration for a specific folder to a GitHub repository
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct GitHubRepoSyncConfig {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub folder_id: String,
    /// Path in repo where folder syncs. If None, uses folder name.
    pub github_path: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateRepoSyncConfig {
    pub folder_id: String,
    pub github_path: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct ConfigureMultiFolderSync {
    pub folder_configs: Vec<CreateRepoSyncConfig>,
}

impl GitHubRepoSyncConfig {
    pub async fn find_by_repo_id(
        pool: &PgPool,
        repo_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubRepoSyncConfig,
            r#"SELECT id as "id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      folder_id,
                      github_path,
                      created_at as "created_at!: DateTime<Utc>"
               FROM github_repo_sync_configs
               WHERE repo_id = $1
               ORDER BY folder_id ASC"#,
            repo_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn upsert(
        pool: &PgPool,
        repo_id: Uuid,
        folder_id: &str,
        github_path: Option<&str>,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            GitHubRepoSyncConfig,
            r#"INSERT INTO github_repo_sync_configs (id, repo_id, folder_id, github_path)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (repo_id, folder_id) DO UPDATE SET github_path = $4
               RETURNING id as "id!: Uuid",
                         repo_id as "repo_id!: Uuid",
                         folder_id,
                         github_path,
                         created_at as "created_at!: DateTime<Utc>""#,
            id,
            repo_id,
            folder_id,
            github_path
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete_by_repo_id(pool: &PgPool, repo_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM github_repo_sync_configs WHERE repo_id = $1", repo_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete(pool: &PgPool, repo_id: Uuid, folder_id: &str) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM github_repo_sync_configs WHERE repo_id = $1 AND folder_id = $2",
            repo_id,
            folder_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}

impl GitHubRepository {
    pub async fn find_by_connection_id(
        pool: &PgPool,
        connection_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubRepository,
            r#"SELECT id as "id!: Uuid",
                      connection_id as "connection_id!: Uuid",
                      repo_full_name,
                      repo_name,
                      repo_owner,
                      repo_url,
                      default_branch,
                      is_private as "is_private!: bool",
                      linked_at as "linked_at!: DateTime<Utc>",
                      sync_path,
                      sync_folder_id,
                      last_synced_at as "last_synced_at: DateTime<Utc>"
               FROM github_repositories
               WHERE connection_id = $1
               ORDER BY repo_full_name ASC"#,
            connection_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubRepository,
            r#"SELECT id as "id!: Uuid",
                      connection_id as "connection_id!: Uuid",
                      repo_full_name,
                      repo_name,
                      repo_owner,
                      repo_url,
                      default_branch,
                      is_private as "is_private!: bool",
                      linked_at as "linked_at!: DateTime<Utc>",
                      sync_path,
                      sync_folder_id,
                      last_synced_at as "last_synced_at: DateTime<Utc>"
               FROM github_repositories
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_sync_folder(
        pool: &PgPool,
        sync_folder_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubRepository,
            r#"SELECT id as "id!: Uuid",
                      connection_id as "connection_id!: Uuid",
                      repo_full_name,
                      repo_name,
                      repo_owner,
                      repo_url,
                      default_branch,
                      is_private as "is_private!: bool",
                      linked_at as "linked_at!: DateTime<Utc>",
                      sync_path,
                      sync_folder_id,
                      last_synced_at as "last_synced_at: DateTime<Utc>"
               FROM github_repositories
               WHERE sync_folder_id = $1"#,
            sync_folder_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn link(
        pool: &PgPool,
        connection_id: Uuid,
        data: &LinkGitHubRepository,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            GitHubRepository,
            r#"INSERT INTO github_repositories (id, connection_id, repo_full_name, repo_name, repo_owner, repo_url, default_branch, is_private)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (connection_id, repo_full_name) DO UPDATE SET
                   repo_name = $4, repo_owner = $5, repo_url = $6, default_branch = $7, is_private = $8
               RETURNING id as "id!: Uuid",
                         connection_id as "connection_id!: Uuid",
                         repo_full_name,
                         repo_name,
                         repo_owner,
                         repo_url,
                         default_branch,
                         is_private as "is_private!: bool",
                         linked_at as "linked_at!: DateTime<Utc>",
                         sync_path,
                         sync_folder_id,
                         last_synced_at as "last_synced_at: DateTime<Utc>""#,
            id,
            connection_id,
            data.repo_full_name,
            data.repo_name,
            data.repo_owner,
            data.repo_url,
            data.default_branch,
            data.is_private
        )
        .fetch_one(pool)
        .await
    }

    /// Configure sync settings for a repository
    pub async fn configure_sync(
        pool: &PgPool,
        id: Uuid,
        sync_path: &str,
        sync_folder_id: &str,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            GitHubRepository,
            r#"UPDATE github_repositories
               SET sync_path = $2, sync_folder_id = $3
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         connection_id as "connection_id!: Uuid",
                         repo_full_name,
                         repo_name,
                         repo_owner,
                         repo_url,
                         default_branch,
                         is_private as "is_private!: bool",
                         linked_at as "linked_at!: DateTime<Utc>",
                         sync_path,
                         sync_folder_id,
                         last_synced_at as "last_synced_at: DateTime<Utc>""#,
            id,
            sync_path,
            sync_folder_id
        )
        .fetch_one(pool)
        .await
    }

    /// Update last synced timestamp
    pub async fn update_last_synced(pool: &PgPool, id: Uuid) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            GitHubRepository,
            r#"UPDATE github_repositories
               SET last_synced_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         connection_id as "connection_id!: Uuid",
                         repo_full_name,
                         repo_name,
                         repo_owner,
                         repo_url,
                         default_branch,
                         is_private as "is_private!: bool",
                         linked_at as "linked_at!: DateTime<Utc>",
                         sync_path,
                         sync_folder_id,
                         last_synced_at as "last_synced_at: DateTime<Utc>""#,
            id
        )
        .fetch_one(pool)
        .await
    }

    /// Clear sync configuration for a repository
    pub async fn clear_sync(pool: &PgPool, id: Uuid) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            GitHubRepository,
            r#"UPDATE github_repositories
               SET sync_path = NULL, sync_folder_id = NULL, last_synced_at = NULL
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         connection_id as "connection_id!: Uuid",
                         repo_full_name,
                         repo_name,
                         repo_owner,
                         repo_url,
                         default_branch,
                         is_private as "is_private!: bool",
                         linked_at as "linked_at!: DateTime<Utc>",
                         sync_path,
                         sync_folder_id,
                         last_synced_at as "last_synced_at: DateTime<Utc>""#,
            id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn unlink(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM github_repositories WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn unlink_by_full_name(
        pool: &PgPool,
        connection_id: Uuid,
        repo_full_name: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM github_repositories WHERE connection_id = $1 AND repo_full_name = $2",
            connection_id,
            repo_full_name
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
