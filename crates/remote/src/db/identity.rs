use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;

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
    pub display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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
        INSERT INTO users (id, email, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            updated_at = NOW()
        RETURNING
            id           AS "id!",
            email        AS "email!",
            display_name AS "display_name!",
            created_at   AS "created_at!",
            updated_at   AS "updated_at!"
        "#,
        user.id,
        user.email,
        user.display_name
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
