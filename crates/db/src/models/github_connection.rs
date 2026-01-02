use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct GitHubConnection {
    pub id: Uuid,
    pub team_id: Uuid,
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
    pub async fn find_by_team_id(
        pool: &SqlitePool,
        team_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubConnection,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
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

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubConnection,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
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

    pub async fn create(
        pool: &SqlitePool,
        team_id: Uuid,
        data: &CreateGitHubConnection,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            GitHubConnection,
            r#"INSERT INTO github_connections (id, team_id, access_token)
               VALUES ($1, $2, $3)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
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
        pool: &SqlitePool,
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
               SET access_token = $2, github_username = $3, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
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

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM github_connections WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_by_team_id(pool: &SqlitePool, team_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM github_connections WHERE team_id = $1", team_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

impl GitHubRepository {
    pub async fn find_by_connection_id(
        pool: &SqlitePool,
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
                      linked_at as "linked_at!: DateTime<Utc>"
               FROM github_repositories
               WHERE connection_id = $1
               ORDER BY repo_full_name ASC"#,
            connection_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn link(
        pool: &SqlitePool,
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
                         linked_at as "linked_at!: DateTime<Utc>""#,
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

    pub async fn unlink(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM github_repositories WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn unlink_by_full_name(
        pool: &SqlitePool,
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
