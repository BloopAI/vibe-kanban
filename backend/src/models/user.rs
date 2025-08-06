use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS, ToSchema)]
#[ts(export)]
pub struct User {
    pub id: Uuid,
    pub github_id: i64,
    pub username: String,
    pub email: String,
    pub github_token: Option<String>,
    #[ts(type = "Date")]
    #[schema(value_type = String, format = DateTime)]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS, ToSchema)]
#[ts(export)]
pub struct CreateUser {
    pub github_id: i64,
    pub username: String,
    pub email: String,
    pub github_token: Option<String>,
}

#[derive(Debug, Deserialize, TS, ToSchema)]
#[ts(export)]
pub struct UpdateUser {
    pub username: Option<String>,
    pub email: Option<String>,
    pub github_token: Option<String>,
}

impl User {
    /// Find user by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"SELECT id as "id!: Uuid", github_id, username, email, github_token, created_at as "created_at!: DateTime<Utc>" 
               FROM users 
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find user by GitHub ID
    pub async fn find_by_github_id(pool: &SqlitePool, github_id: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"SELECT id as "id!: Uuid", github_id, username, email, github_token, created_at as "created_at!: DateTime<Utc>" 
               FROM users 
               WHERE github_id = $1"#,
            github_id
        )
        .fetch_optional(pool)
        .await
    }

    /// List all users
    pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"SELECT id as "id!: Uuid", github_id, username, email, github_token, created_at as "created_at!: DateTime<Utc>" 
               FROM users 
               ORDER BY username ASC"#
        )
        .fetch_all(pool)
        .await
    }

    /// Create a new user
    pub async fn create(
        pool: &SqlitePool,
        data: &CreateUser,
        user_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"INSERT INTO users (id, github_id, username, email, github_token) 
               VALUES ($1, $2, $3, $4, $5) 
               RETURNING id as "id!: Uuid", github_id, username, email, github_token, created_at as "created_at!: DateTime<Utc>""#,
            user_id,
            data.github_id,
            data.username,
            data.email,
            data.github_token
        )
        .fetch_one(pool)
        .await
    }

    /// Update user information
    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateUser,
    ) -> Result<Option<Self>, sqlx::Error> {
        // Get current user to preserve unchanged fields
        let current_user = Self::find_by_id(pool, id).await?;
        if let Some(user) = current_user {
            let username = data.username.as_ref().unwrap_or(&user.username);
            let email = data.email.as_ref().unwrap_or(&user.email);
            let github_token = data.github_token.as_ref().or(user.github_token.as_ref());

            sqlx::query_as!(
                User,
                r#"UPDATE users 
                   SET username = $2, email = $3, github_token = $4
                   WHERE id = $1 
                   RETURNING id as "id!: Uuid", github_id, username, email, github_token, created_at as "created_at!: DateTime<Utc>""#,
                id,
                username,
                email,
                github_token
            )
            .fetch_optional(pool)
            .await
        } else {
            Ok(None)
        }
    }

    /// Create or update user from GitHub OAuth (upsert)
    pub async fn create_or_update_from_github(
        pool: &SqlitePool,
        github_id: i64,
        username: String,
        email: String,
        github_token: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        // Try to find existing user by GitHub ID
        if let Some(existing_user) = Self::find_by_github_id(pool, github_id).await? {
            // Update existing user
            let update_data = UpdateUser {
                username: Some(username),
                email: Some(email),
                github_token,
            };
            Self::update(pool, existing_user.id, &update_data)
                .await?
                .ok_or_else(|| sqlx::Error::RowNotFound)
        } else {
            // Create new user
            let create_data = CreateUser {
                github_id,
                username,
                email,
                github_token,
            };
            Self::create(pool, &create_data, Uuid::new_v4()).await
        }
    }
}