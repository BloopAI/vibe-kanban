use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;

use super::Tx;
use crate::auth::{ClerkService, ClerkServiceError, ClerkUser};

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error(transparent)]
    Clerk(#[from] ClerkServiceError),
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

pub struct IdentityRepository<'a> {
    pool: &'a PgPool,
    clerk: &'a ClerkService,
}

impl<'a> IdentityRepository<'a> {
    pub fn new(pool: &'a PgPool, clerk: &'a ClerkService) -> Self {
        Self { pool, clerk }
    }

    pub async fn ensure_organization(
        &self,
        organization_id: &str,
        slug: Option<&str>,
    ) -> Result<Organization, IdentityError> {
        let slug = slug.unwrap_or(organization_id);
        upsert_organization(self.pool, organization_id, slug)
            .await
            .map_err(IdentityError::from)
    }

    pub async fn ensure_user(
        &self,
        organization_id: &str,
        user_id: &str,
    ) -> Result<User, IdentityError> {
        let user = self.clerk.get_user(user_id).await?;
        // Check if user is a member of the organization
        let memberships = self.clerk.get_user_memberships(user_id).await?;
        let is_member = memberships
            .iter()
            .any(|membership| membership.id == organization_id);
        if !is_member {
            return Err(IdentityError::Clerk(ClerkServiceError::NotFound(format!(
                "User {user_id} is not a member of organization {organization_id}"
            ))));
        }
        let record = upsert_user(self.pool, &user).await?;
        ensure_member_metadata(self.pool, organization_id, &record.id).await?;
        Ok(record)
    }
}

async fn upsert_organization(
    pool: &PgPool,
    organization_id: &str,
    slug: &str,
) -> Result<Organization, sqlx::Error> {
    sqlx::query_as!(
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

async fn upsert_user(pool: &PgPool, user: &ClerkUser) -> Result<User, sqlx::Error> {
    sqlx::query_as!(
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
        user.first_name.as_deref(),
        user.last_name.as_deref(),
        user.username.as_deref()
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
