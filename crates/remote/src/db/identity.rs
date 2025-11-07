use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, query_as, query_scalar};
use thiserror::Error;

use super::Tx;

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error("identity record not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Organization {
    pub id: String,
    pub slug: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserData {
    pub id: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpsertUser<'a> {
    pub id: &'a str,
    pub email: &'a str,
    pub first_name: Option<&'a str>,
    pub last_name: Option<&'a str>,
    pub username: Option<&'a str>,
}

pub struct IdentityRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> IdentityRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn upsert_user(&self, user: UpsertUser<'_>) -> Result<User, IdentityError> {
        upsert_user(self.pool, &user)
            .await
            .map_err(IdentityError::from)
    }

    pub async fn ensure_personal_organization(
        &self,
        organization_id: &str,
        slug: &str,
    ) -> Result<Organization, IdentityError> {
        upsert_organization(self.pool, organization_id, slug)
            .await
            .map_err(IdentityError::from)
    }

    pub async fn ensure_membership(
        &self,
        organization_id: &str,
        user_id: &str,
    ) -> Result<(), IdentityError> {
        ensure_member_metadata(self.pool, organization_id, user_id)
            .await
            .map_err(IdentityError::from)
    }

    pub async fn assert_membership(
        &self,
        organization_id: &str,
        user_id: &str,
    ) -> Result<(), IdentityError> {
        let exists = query_scalar!(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM organization_member_metadata
                WHERE organization_id = $1 AND user_id = $2
            ) AS "exists!"
            "#,
            organization_id,
            user_id
        )
        .fetch_one(self.pool)
        .await?;

        if exists {
            Ok(())
        } else {
            Err(IdentityError::NotFound)
        }
    }

    pub async fn fetch_user(&self, user_id: &str) -> Result<User, IdentityError> {
        query_as!(
            User,
            r#"
            SELECT
                id           AS "id!",
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

    pub async fn fetch_organization(
        &self,
        organization_id: &str,
    ) -> Result<Organization, IdentityError> {
        query_as!(
            Organization,
            r#"
            SELECT
                id          AS "id!",
                slug        AS "slug!",
                created_at  AS "created_at!",
                updated_at  AS "updated_at!"
            FROM organizations
            WHERE id = $1
            "#,
            organization_id
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(IdentityError::NotFound)
    }

    pub async fn find_user_by_email(&self, email: &str) -> Result<Option<User>, IdentityError> {
        sqlx::query_as!(
            User,
            r#"
            SELECT
                id           AS "id!",
                email        AS "email!",
                first_name   AS "first_name?",
                last_name    AS "last_name?",
                username     AS "username?",
                created_at   AS "created_at!",
                updated_at   AS "updated_at!"
            FROM users
            WHERE lower(email) = lower($1)
            "#,
            email
        )
        .fetch_optional(self.pool)
        .await
        .map_err(IdentityError::from)
    }
}

async fn upsert_organization(
    pool: &PgPool,
    organization_id: &str,
    slug: &str,
) -> Result<Organization, sqlx::Error> {
    query_as!(
        Organization,
        r#"
        INSERT INTO organizations (id, slug)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE
        SET slug = EXCLUDED.slug,
            updated_at = NOW()
        RETURNING
            id          AS "id!",
            slug        AS "slug!",
            created_at  AS "created_at!",
            updated_at  AS "updated_at!"
        "#,
        organization_id,
        slug
    )
    .fetch_one(pool)
    .await
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
            username = EXCLUDED.username,
            updated_at = NOW()
        RETURNING
            id           AS "id!",
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

async fn ensure_member_metadata(
    pool: &PgPool,
    organization_id: &str,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO organization_member_metadata (organization_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (organization_id, user_id) DO NOTHING
        "#,
        organization_id,
        user_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn fetch_user(tx: &mut Tx<'_>, user_id: &str) -> Result<Option<UserData>, IdentityError> {
    sqlx::query!(
        r#"
        SELECT
            id         AS "id!",
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
            id: row.id,
            first_name: row.first_name,
            last_name: row.last_name,
            username: row.username,
        })
    })
}
