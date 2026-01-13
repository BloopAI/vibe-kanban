use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum UserError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("User not found")]
    UserNotFound,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct User {
    pub id: Uuid,
    pub github_id: i64,
    pub username: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Data from GitHub OAuth profile
#[derive(Debug, Clone, Deserialize)]
pub struct GitHubUserProfile {
    pub id: i64,
    pub login: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

impl User {
    /// Find a user by their internal ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"SELECT id as "id!: Uuid",
                      github_id,
                      username,
                      email,
                      display_name,
                      avatar_url,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM users
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find a user by their GitHub ID
    pub async fn find_by_github_id(
        pool: &SqlitePool,
        github_id: i64,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"SELECT id as "id!: Uuid",
                      github_id,
                      username,
                      email,
                      display_name,
                      avatar_url,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM users
               WHERE github_id = $1"#,
            github_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find all users
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"SELECT id as "id!: Uuid",
                      github_id,
                      username,
                      email,
                      display_name,
                      avatar_url,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM users
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    /// Create or update a user from GitHub OAuth profile.
    /// If the user already exists (by github_id), update their profile.
    /// If not, create a new user.
    pub async fn upsert_from_github(
        pool: &SqlitePool,
        profile: &GitHubUserProfile,
    ) -> Result<Self, sqlx::Error> {
        let user_id = Uuid::new_v4();

        sqlx::query_as!(
            User,
            r#"INSERT INTO users (id, github_id, username, email, display_name, avatar_url)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT(github_id) DO UPDATE SET
                   username = excluded.username,
                   email = excluded.email,
                   display_name = excluded.display_name,
                   avatar_url = excluded.avatar_url,
                   updated_at = datetime('now', 'subsec')
               RETURNING id as "id!: Uuid",
                         github_id,
                         username,
                         email,
                         display_name,
                         avatar_url,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            user_id,
            profile.id,
            profile.login,
            profile.email,
            profile.name,
            profile.avatar_url,
        )
        .fetch_one(pool)
        .await
    }
}
