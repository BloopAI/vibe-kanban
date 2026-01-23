use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, PgPool, Postgres};
use ts_rs::TS;
pub use utils::api::organizations::MemberRole;
use uuid::Uuid;

use super::identity_errors::IdentityError;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct OrganizationMember {
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub role: MemberRole,
    pub joined_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
}

pub(super) async fn add_member<'a, E>(
    executor: E,
    organization_id: Uuid,
    user_id: Uuid,
    role: MemberRole,
) -> Result<(), sqlx::Error>
where
    E: Executor<'a, Database = Postgres>,
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

pub(super) async fn check_user_role(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<Option<MemberRole>, IdentityError> {
    let result = sqlx::query!(
        r#"
        SELECT role AS "role!: MemberRole"
        FROM organization_member_metadata
        WHERE organization_id = $1 AND user_id = $2
        "#,
        organization_id,
        user_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(result.map(|r| r.role))
}

pub async fn is_member<'a, E>(
    executor: E,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<bool, IdentityError>
where
    E: Executor<'a, Database = Postgres>,
{
    let exists = sqlx::query_scalar!(
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
    .fetch_one(executor)
    .await?;

    Ok(exists)
}

pub(crate) async fn assert_membership(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), IdentityError> {
    let exists = is_member(pool, organization_id, user_id).await?;

    if exists {
        Ok(())
    } else {
        Err(IdentityError::NotFound)
    }
}

pub(crate) async fn assert_issue_access(
    pool: &PgPool,
    issue_id: Uuid,
    user_id: Uuid,
) -> Result<(), IdentityError> {
    let org_id = sqlx::query_scalar!(
        r#"
        SELECT p.organization_id
        FROM issues i
        JOIN projects p ON i.project_id = p.id
        WHERE i.id = $1
        "#,
        issue_id
    )
    .fetch_optional(pool)
    .await?
    .ok_or(IdentityError::NotFound)?;

    assert_membership(pool, org_id, user_id).await
}

pub(crate) async fn assert_project_access(
    pool: &PgPool,
    project_id: Uuid,
    user_id: Uuid,
) -> Result<(), IdentityError> {
    let org_id = sqlx::query_scalar!(
        r#"SELECT organization_id FROM projects WHERE id = $1"#,
        project_id
    )
    .fetch_optional(pool)
    .await?
    .ok_or(IdentityError::NotFound)?;

    assert_membership(pool, org_id, user_id).await
}

pub(super) async fn assert_admin(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), IdentityError> {
    let role = check_user_role(pool, organization_id, user_id).await?;
    match role {
        Some(MemberRole::Admin) => Ok(()),
        _ => Err(IdentityError::PermissionDenied),
    }
}
