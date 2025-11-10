use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Type, query_as, query_scalar};
use uuid::Uuid;


use super::identity_errors::IdentityError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "member_role", rename_all = "lowercase")]
pub enum MemberRole {
    Admin,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Organization {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrganizationWithRole {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub user_role: MemberRole,
}

pub struct OrganizationRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> OrganizationRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
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

    pub async fn fetch_organization(
        &self,
        organization_id: &str,
    ) -> Result<Organization, IdentityError> {
        query_as!(
            Organization,
            r#"
            SELECT
                id          AS "id!",
                name        AS "name!",
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

    pub async fn ensure_personal_org_and_admin_membership(
        &self,
        user_id: &str,
        display_name_hint: Option<&str>,
    ) -> Result<Organization, IdentityError> {
        let org_id = personal_org_id(user_id);
        let name = personal_org_name(display_name_hint, user_id);
        let slug = personal_org_slug(display_name_hint, user_id);
        let org = upsert_organization(self.pool, &org_id, &name, &slug).await?;
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

    pub async fn create_organization(
        &self,
        name: &str,
        slug: &str,
        creator_user_id: &str,
    ) -> Result<OrganizationWithRole, IdentityError> {
        let mut tx = self.pool.begin().await?;

        let org_id = format!("org-custom-{}", Uuid::new_v4());

        let org = sqlx::query_as!(
            Organization,
            r#"
            INSERT INTO organizations (id, name, slug)
            VALUES ($1, $2, $3)
            RETURNING
                id AS "id!",
                name AS "name!",
                slug AS "slug!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            "#,
            org_id,
            name,
            slug
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            if let Some(db_err) = e.as_database_error() {
                if db_err.is_unique_violation() {
                    return IdentityError::OrganizationConflict(
                        "An organization with this slug already exists".to_string(),
                    );
                }
            }
            IdentityError::from(e)
        })?;

        ensure_member_metadata_with_role(&mut *tx, &org_id, creator_user_id, MemberRole::Admin)
            .await?;

        tx.commit().await?;

        Ok(OrganizationWithRole {
            id: org.id,
            name: org.name,
            slug: org.slug,
            created_at: org.created_at,
            updated_at: org.updated_at,
            user_role: MemberRole::Admin,
        })
    }

    pub async fn list_user_organizations(
        &self,
        user_id: &str,
    ) -> Result<Vec<OrganizationWithRole>, IdentityError> {
        let orgs = sqlx::query_as!(
            OrganizationWithRole,
            r#"
            SELECT
                o.id AS "id!",
                o.name AS "name!",
                o.slug AS "slug!",
                o.created_at AS "created_at!",
                o.updated_at AS "updated_at!",
                m.role AS "user_role!: MemberRole"
            FROM organizations o
            JOIN organization_member_metadata m ON m.organization_id = o.id
            WHERE m.user_id = $1 AND m.status = 'active'
            ORDER BY o.created_at DESC
            "#,
            user_id
        )
        .fetch_all(self.pool)
        .await?;

        Ok(orgs)
    }

    pub async fn update_organization_name(
        &self,
        org_id: &str,
        user_id: &str,
        new_name: &str,
    ) -> Result<Organization, IdentityError> {
        self.assert_admin(org_id, user_id).await?;

        let org = sqlx::query_as!(
            Organization,
            r#"
            UPDATE organizations
            SET name = $2, updated_at = NOW()
            WHERE id = $1
            RETURNING
                id AS "id!",
                name AS "name!",
                slug AS "slug!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            "#,
            org_id,
            new_name
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(IdentityError::NotFound)?;

        Ok(org)
    }

    pub async fn delete_organization(
        &self,
        org_id: &str,
        user_id: &str,
    ) -> Result<(), IdentityError> {
        let result = sqlx::query!(
            r#"
            WITH s AS (
                SELECT
                    COUNT(*) FILTER (WHERE role = 'admin' AND status = 'active') AS admin_count,
                    BOOL_OR(user_id = $2 AND role = 'admin' AND status = 'active') AS is_admin
                FROM organization_member_metadata
                WHERE organization_id = $1
            )
            DELETE FROM organizations o
            USING s
            WHERE o.id = $1
              AND s.is_admin = true
              AND s.admin_count > 1
              AND o.id NOT LIKE 'org-%'
            RETURNING o.id
            "#,
            org_id,
            user_id
        )
        .fetch_optional(self.pool)
        .await?;

        if result.is_none() {
            let role = self.check_user_role(org_id, user_id).await?;
            match role {
                None | Some(MemberRole::Member) => {
                    return Err(IdentityError::PermissionDenied);
                }
                Some(MemberRole::Admin) => {
                    if org_id.starts_with("org-") {
                        return Err(IdentityError::CannotDeleteOrganization(
                            "Cannot delete personal organizations".to_string(),
                        ));
                    }
                    return Err(IdentityError::CannotDeleteOrganization(
                        "Cannot delete organization: you are the only admin".to_string(),
                    ));
                }
            }
        }

        Ok(())
    }
}

async fn upsert_organization(
    pool: &PgPool,
    organization_id: &str,
    name: &str,
    slug: &str,
) -> Result<Organization, sqlx::Error> {
    query_as!(
        Organization,
        r#"
        INSERT INTO organizations (id, name, slug)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            updated_at = NOW()
        RETURNING
            id          AS "id!",
            name        AS "name!",
            slug        AS "slug!",
            created_at  AS "created_at!",
            updated_at  AS "updated_at!"
        "#,
        organization_id,
        name,
        slug
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

pub(super) async fn ensure_member_metadata_with_role<'a, E>(
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

fn personal_org_name(hint: Option<&str>, user_id: &str) -> String {
    let display_name = hint.unwrap_or(user_id);
    format!("{}'s Org", display_name)
}

fn personal_org_slug(hint: Option<&str>, user_id: &str) -> String {
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
