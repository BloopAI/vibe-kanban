use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, query_as};
use ts_rs::TS;
use uuid::Uuid;

use super::{Tx, identity_errors::IdentityError};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct UserData {
    pub user_id: Uuid,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpsertUser<'a> {
    pub id: Uuid,
    pub email: &'a str,
    pub first_name: Option<&'a str>,
    pub last_name: Option<&'a str>,
    pub username: Option<&'a str>,
}

pub struct UserRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> UserRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn upsert_user(&self, user: UpsertUser<'_>) -> Result<User, IdentityError> {
        upsert_user(self.pool, &user)
            .await
            .map_err(IdentityError::from)
    }

    pub async fn fetch_user(&self, user_id: Uuid) -> Result<User, IdentityError> {
        query_as!(
            User,
            r#"
            SELECT
                id           AS "id!: Uuid",
                email        AS "email!",
                first_name   AS "first_name?",
                last_name    AS "last_name?",
                username     AS "username?",
                created_at   AS "created_at!",
                updated_at   AS "updated_at!"
            FROM users
            WHERE id = $1
            "#,
            user_id
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(IdentityError::NotFound)
    }

    /// Fetch all assignees for a given project id.
    /// Returns Vec<UserData> containing all unique users assigned to tasks in the project.
    pub async fn fetch_assignees_by_project(
        &self,
        project_id: Uuid,
    ) -> Result<Vec<UserData>, IdentityError> {
        let rows = sqlx::query_as!(
            UserData,
            r#"
            SELECT DISTINCT
                u.id         as "user_id",
                u.first_name as "first_name",
                u.last_name  as "last_name",
                u.username   as "username"
            FROM shared_tasks st
            INNER JOIN users u ON u.id = st.assignee_user_id
            WHERE st.project_id = $1
            AND st.assignee_user_id IS NOT NULL
            "#,
            project_id
        )
        .fetch_all(self.pool)
        .await
        .map_err(IdentityError::from)?;

        Ok(rows)
    }
}

async fn upsert_user(pool: &PgPool, user: &UpsertUser<'_>) -> Result<User, sqlx::Error> {
    query_as!(
        User,
        r#"
        INSERT INTO users (id, email, first_name, last_name, username)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            username = EXCLUDED.username
        RETURNING
            id           AS "id!: Uuid",
            email        AS "email!",
            first_name   AS "first_name?",
            last_name    AS "last_name?",
            username     AS "username?",
            created_at   AS "created_at!",
            updated_at   AS "updated_at!"
        "#,
        user.id,
        user.email,
        user.first_name,
        user.last_name,
        user.username
    )
    .fetch_one(pool)
    .await
}

pub async fn fetch_user(tx: &mut Tx<'_>, user_id: Uuid) -> Result<Option<UserData>, IdentityError> {
    sqlx::query!(
        r#"
        SELECT
            id         AS "id!: Uuid",
            first_name AS "first_name?",
            last_name  AS "last_name?",
            username   AS "username?"
        FROM users
        WHERE id = $1
        "#,
        user_id
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(IdentityError::from)
    .map(|row_opt| {
        row_opt.map(|row| UserData {
            user_id: row.id,
            first_name: row.first_name,
            last_name: row.last_name,
            username: row.username,
        })
    })
}
