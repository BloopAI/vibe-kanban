use sqlx::{Executor, PgPool, Postgres, query_as};
pub use utils::api::organizations::{MemberRole, Organization, OrganizationWithRole};
use uuid::Uuid;

use super::{
    identity_errors::IdentityError,
    organization_members::{
        add_member, assert_admin as check_admin, assert_membership as check_membership,
        check_user_role as get_user_role,
    },
    projects::ProjectRepository,
};

pub struct OrganizationRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> OrganizationRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn assert_membership(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), IdentityError> {
        check_membership(self.pool, organization_id, user_id).await
    }

    pub async fn fetch_organization(
        &self,
        organization_id: Uuid,
    ) -> Result<Organization, IdentityError> {
        query_as!(
            Organization,
            r#"
            SELECT
                id           AS "id!: Uuid",
                name         AS "name!",
                slug         AS "slug!",
                is_personal  AS "is_personal!",
                issue_prefix AS "issue_prefix!",
                created_at   AS "created_at!",
                updated_at   AS "updated_at!"
            FROM organizations
            WHERE id = $1
            "#,
            organization_id
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(IdentityError::NotFound)
    }

    pub async fn is_personal(&self, organization_id: Uuid) -> Result<bool, IdentityError> {
        let result = sqlx::query_scalar!(
            r#"
            SELECT is_personal
            FROM organizations
            WHERE id = $1
            "#,
            organization_id
        )
        .fetch_optional(self.pool)
        .await?;

        result.ok_or(IdentityError::NotFound)
    }

    pub async fn ensure_personal_org_and_admin_membership(
        &self,
        user_id: Uuid,
        display_name_hint: Option<&str>,
    ) -> Result<Organization, IdentityError> {
        let name = personal_org_name(display_name_hint, user_id);
        let slug = personal_org_slug(user_id);

        // Try to find existing personal org by slug
        let existing_org = find_organization_by_slug(self.pool, &slug).await?;

        let org = match existing_org {
            Some(org) => org,
            None => {
                // Create new personal org WITH initial project in a transaction
                let mut tx = self.pool.begin().await?;

                let org = create_personal_org_tx(&mut *tx, &name, &slug).await?;

                // Create initial project with default tags and statuses
                ProjectRepository::create_initial_project_tx(&mut tx, org.id)
                    .await
                    .map_err(|e| {
                        IdentityError::Database(sqlx::Error::Protocol(format!(
                            "Failed to create initial project: {e}"
                        )))
                    })?;

                tx.commit().await?;
                org
            }
        };

        add_member(self.pool, org.id, user_id, MemberRole::Admin).await?;
        Ok(org)
    }

    pub async fn check_user_role(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<MemberRole>, IdentityError> {
        get_user_role(self.pool, organization_id, user_id).await
    }

    pub async fn assert_admin(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), IdentityError> {
        check_admin(self.pool, organization_id, user_id).await
    }

    pub async fn create_organization(
        &self,
        name: &str,
        slug: &str,
        creator_user_id: Uuid,
    ) -> Result<OrganizationWithRole, IdentityError> {
        let mut tx = self.pool.begin().await?;

        let issue_prefix = derive_issue_prefix(name);
        let org = sqlx::query_as!(
            Organization,
            r#"
            INSERT INTO organizations (name, slug, issue_prefix)
            VALUES ($1, $2, $3)
            RETURNING
                id           AS "id!: Uuid",
                name         AS "name!",
                slug         AS "slug!",
                is_personal  AS "is_personal!",
                issue_prefix AS "issue_prefix!",
                created_at   AS "created_at!",
                updated_at   AS "updated_at!"
            "#,
            name,
            slug,
            issue_prefix
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            if let Some(db_err) = e.as_database_error()
                && db_err.is_unique_violation()
            {
                return IdentityError::OrganizationConflict(
                    "An organization with this slug already exists".to_string(),
                );
            }
            IdentityError::from(e)
        })?;

        add_member(&mut *tx, org.id, creator_user_id, MemberRole::Admin).await?;

        tx.commit().await?;

        Ok(OrganizationWithRole {
            id: org.id,
            name: org.name,
            slug: org.slug,
            is_personal: org.is_personal,
            issue_prefix: org.issue_prefix,
            created_at: org.created_at,
            updated_at: org.updated_at,
            user_role: MemberRole::Admin,
        })
    }

    pub async fn list_user_organizations(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<OrganizationWithRole>, IdentityError> {
        let orgs = sqlx::query_as!(
            OrganizationWithRole,
            r#"
            SELECT
                o.id           AS "id!: Uuid",
                o.name         AS "name!",
                o.slug         AS "slug!",
                o.is_personal  AS "is_personal!",
                o.issue_prefix AS "issue_prefix!",
                o.created_at   AS "created_at!",
                o.updated_at   AS "updated_at!",
                m.role         AS "user_role!: MemberRole"
            FROM organizations o
            JOIN organization_member_metadata m ON m.organization_id = o.id
            WHERE m.user_id = $1
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
        org_id: Uuid,
        user_id: Uuid,
        new_name: &str,
    ) -> Result<Organization, IdentityError> {
        self.assert_admin(org_id, user_id).await?;

        let org = sqlx::query_as!(
            Organization,
            r#"
            UPDATE organizations
            SET name = $2
            WHERE id = $1
            RETURNING
                id           AS "id!: Uuid",
                name         AS "name!",
                slug         AS "slug!",
                is_personal  AS "is_personal!",
                issue_prefix AS "issue_prefix!",
                created_at   AS "created_at!",
                updated_at   AS "updated_at!"
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
        org_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), IdentityError> {
        // First fetch the org to check if it's a personal org
        let org = self.fetch_organization(org_id).await?;

        // Check if this is a personal org by flag
        if org.is_personal {
            return Err(IdentityError::CannotDeleteOrganization(
                "Cannot delete personal organizations".to_string(),
            ));
        }

        let result = sqlx::query!(
            r#"
            WITH s AS (
                SELECT
                    BOOL_OR(user_id = $2 AND role = 'admin') AS is_admin
                FROM organization_member_metadata
                WHERE organization_id = $1
            )
            DELETE FROM organizations o
            USING s
            WHERE o.id = $1
              AND s.is_admin = true
            RETURNING o.id
            "#,
            org_id,
            user_id
        )
        .fetch_optional(self.pool)
        .await?;

        if result.is_none() {
            return Err(IdentityError::PermissionDenied);
        }

        Ok(())
    }
}

async fn find_organization_by_slug(
    pool: &PgPool,
    slug: &str,
) -> Result<Option<Organization>, sqlx::Error> {
    query_as!(
        Organization,
        r#"
        SELECT
            id           AS "id!: Uuid",
            name         AS "name!",
            slug         AS "slug!",
            is_personal  AS "is_personal!",
            issue_prefix AS "issue_prefix!",
            created_at   AS "created_at!",
            updated_at   AS "updated_at!"
        FROM organizations
        WHERE slug = $1
        "#,
        slug
    )
    .fetch_optional(pool)
    .await
}

async fn create_personal_org_tx<'e, E>(
    executor: E,
    name: &str,
    slug: &str,
) -> Result<Organization, sqlx::Error>
where
    E: Executor<'e, Database = Postgres>,
{
    let issue_prefix = derive_issue_prefix(name);
    query_as!(
        Organization,
        r#"
        INSERT INTO organizations (name, slug, is_personal, issue_prefix)
        VALUES ($1, $2, TRUE, $3)
        RETURNING
            id           AS "id!: Uuid",
            name         AS "name!",
            slug         AS "slug!",
            is_personal  AS "is_personal!",
            issue_prefix AS "issue_prefix!",
            created_at   AS "created_at!",
            updated_at   AS "updated_at!"
        "#,
        name,
        slug,
        issue_prefix
    )
    .fetch_one(executor)
    .await
}

fn personal_org_name(hint: Option<&str>, user_id: Uuid) -> String {
    let user_id_str = user_id.to_string();
    let display_name = hint.unwrap_or(&user_id_str);
    format!("{display_name}'s Org")
}

fn personal_org_slug(user_id: Uuid) -> String {
    // Use a deterministic slug pattern so we can find personal orgs
    format!("personal-{user_id}")
}

/// Derive an issue prefix from an organization name.
/// Takes the first 3 uppercase letters from the name.
/// Examples: "Bloop" -> "BLO", "My Project" -> "MYP"
fn derive_issue_prefix(name: &str) -> String {
    let letters: String = name.chars().filter(|c| c.is_ascii_alphabetic()).collect();
    let prefix: String = letters.chars().take(3).collect::<String>().to_uppercase();
    if prefix.is_empty() {
        "ISS".to_string()
    } else {
        prefix
    }
}
