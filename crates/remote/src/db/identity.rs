use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Type, query_as, query_scalar};
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error("identity record not found")]
    NotFound,
    #[error("permission denied: admin access required")]
    PermissionDenied,
    #[error("invitation error: {0}")]
    InvitationError(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "member_role", rename_all = "lowercase")]
pub enum MemberRole {
    Admin,
    Member,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "invitation_status", rename_all = "lowercase")]
pub enum InvitationStatus {
    Pending,
    Accepted,
    Declined,
    Expired,
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

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Invitation {
    pub id: Uuid,
    pub organization_id: String,
    pub invited_by_user_id: Option<String>,
    pub email: String,
    pub role: MemberRole,
    pub status: InvitationStatus,
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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

    pub async fn ensure_personal_org_and_admin_membership(
        &self,
        user_id: &str,
        username_hint: Option<&str>,
    ) -> Result<Organization, IdentityError> {
        let org_id = personal_org_id(user_id);
        let slug = personal_org_slug(user_id, username_hint);
        let org = upsert_organization(self.pool, &org_id, &slug).await?;
        ensure_member_metadata_with_role(self.pool, &org_id, user_id, MemberRole::Admin).await?;
        Ok(org)
    }

    pub async fn check_user_role(
        &self,
        organization_id: &str,
        user_id: &str,
    ) -> Result<Option<MemberRole>, IdentityError> {
        let result = sqlx::query!(
            r#"
            SELECT role AS "role!: MemberRole"
            FROM organization_member_metadata
            WHERE organization_id = $1 AND user_id = $2 AND status = 'active'
            "#,
            organization_id,
            user_id
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(result.map(|r| r.role))
    }

    pub async fn assert_admin(
        &self,
        organization_id: &str,
        user_id: &str,
    ) -> Result<(), IdentityError> {
        let role = self.check_user_role(organization_id, user_id).await?;
        match role {
            Some(MemberRole::Admin) => Ok(()),
            _ => Err(IdentityError::PermissionDenied),
        }
    }

    pub async fn create_invitation(
        &self,
        organization_id: &str,
        invited_by_user_id: &str,
        email: &str,
        role: MemberRole,
        expires_at: DateTime<Utc>,
        token: &str,
    ) -> Result<Invitation, IdentityError> {
        self.assert_admin(organization_id, invited_by_user_id)
            .await?;

        let invitation = sqlx::query_as!(
            Invitation,
            r#"
            INSERT INTO organization_invitations (
                organization_id, invited_by_user_id, email, role, token, expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id AS "id!",
                organization_id AS "organization_id!",
                invited_by_user_id AS "invited_by_user_id?",
                email AS "email!",
                role AS "role!: MemberRole",
                status AS "status!: InvitationStatus",
                token AS "token!",
                expires_at AS "expires_at!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            "#,
            organization_id,
            invited_by_user_id,
            email,
            role as MemberRole,
            token,
            expires_at
        )
        .fetch_one(self.pool)
        .await
        .map_err(|e| {
            if let Some(db_err) = e.as_database_error() {
                if db_err.is_unique_violation() {
                    return IdentityError::InvitationError(
                        "A pending invitation already exists for this email".to_string(),
                    );
                }
            }
            IdentityError::from(e)
        })?;

        Ok(invitation)
    }

    pub async fn list_invitations(
        &self,
        organization_id: &str,
        requesting_user_id: &str,
    ) -> Result<Vec<Invitation>, IdentityError> {
        self.assert_admin(organization_id, requesting_user_id)
            .await?;

        let invitations = sqlx::query_as!(
            Invitation,
            r#"
            SELECT
                id AS "id!",
                organization_id AS "organization_id!",
                invited_by_user_id AS "invited_by_user_id?",
                email AS "email!",
                role AS "role!: MemberRole",
                status AS "status!: InvitationStatus",
                token AS "token!",
                expires_at AS "expires_at!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            FROM organization_invitations
            WHERE organization_id = $1
            ORDER BY created_at DESC
            "#,
            organization_id
        )
        .fetch_all(self.pool)
        .await?;

        Ok(invitations)
    }

    pub async fn get_invitation_by_token(&self, token: &str) -> Result<Invitation, IdentityError> {
        sqlx::query_as!(
            Invitation,
            r#"
            SELECT
                id AS "id!",
                organization_id AS "organization_id!",
                invited_by_user_id AS "invited_by_user_id?",
                email AS "email!",
                role AS "role!: MemberRole",
                status AS "status!: InvitationStatus",
                token AS "token!",
                expires_at AS "expires_at!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            FROM organization_invitations
            WHERE token = $1
            "#,
            token
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(IdentityError::NotFound)
    }

    pub async fn accept_invitation(
        &self,
        token: &str,
        user_id: &str,
    ) -> Result<(Organization, MemberRole), IdentityError> {
        let mut tx = self.pool.begin().await?;

        let invitation = sqlx::query_as!(
            Invitation,
            r#"
            SELECT
                id AS "id!",
                organization_id AS "organization_id!",
                invited_by_user_id AS "invited_by_user_id?",
                email AS "email!",
                role AS "role!: MemberRole",
                status AS "status!: InvitationStatus",
                token AS "token!",
                expires_at AS "expires_at!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            FROM organization_invitations
            WHERE token = $1 AND status = 'pending'
            FOR UPDATE
            "#,
            token
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| {
            IdentityError::InvitationError("Invitation not found or already used".to_string())
        })?;

        if invitation.expires_at < Utc::now() {
            sqlx::query!(
                r#"
                UPDATE organization_invitations
                SET status = 'expired', updated_at = NOW()
                WHERE id = $1
                "#,
                invitation.id
            )
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;
            return Err(IdentityError::InvitationError(
                "Invitation has expired".to_string(),
            ));
        }

        ensure_member_metadata_with_role(
            &mut *tx,
            &invitation.organization_id,
            user_id,
            invitation.role,
        )
        .await?;

        sqlx::query!(
            r#"
            UPDATE organization_invitations
            SET status = 'accepted', updated_at = NOW()
            WHERE id = $1
            "#,
            invitation.id
        )
        .execute(&mut *tx)
        .await?;

        let org = sqlx::query_as!(
            Organization,
            r#"
            SELECT
                id AS "id!",
                slug AS "slug!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            FROM organizations
            WHERE id = $1
            "#,
            invitation.organization_id
        )
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok((org, invitation.role))
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
    ensure_member_metadata_with_role(pool, organization_id, user_id, MemberRole::Member).await
}

async fn ensure_member_metadata_with_role<'a, E>(
    executor: E,
    organization_id: &str,
    user_id: &str,
    role: MemberRole,
) -> Result<(), sqlx::Error>
where
    E: sqlx::Executor<'a, Database = sqlx::Postgres>,
{
    sqlx::query!(
        r#"
        INSERT INTO organization_member_metadata (organization_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (organization_id, user_id) DO UPDATE
        SET role = EXCLUDED.role
        "#,
        organization_id,
        user_id,
        role as MemberRole
    )
    .execute(executor)
    .await?;

    Ok(())
}

fn personal_org_id(user_id: &str) -> String {
    format!("org-{user_id}")
}

fn personal_org_slug(user_id: &str, hint: Option<&str>) -> String {
    let candidate = hint
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .unwrap_or(user_id);
    slugify_org_name(candidate)
}

fn slugify_org_name(name: &str) -> String {
    name.chars()
        .filter_map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                Some(c.to_ascii_lowercase())
            } else if c.is_whitespace() {
                Some('-')
            } else {
                None
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
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
