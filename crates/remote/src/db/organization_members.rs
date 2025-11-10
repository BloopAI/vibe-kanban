use serde::{Deserialize, Serialize};
use sqlx::{Executor, PgPool, Postgres, Type};
use uuid::Uuid;

use super::identity_errors::IdentityError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[sqlx(type_name = "member_role", rename_all = "lowercase")]
pub enum MemberRole {
    Admin,
    Member,
}

pub(super) async fn ensure_member_metadata(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    ensure_member_metadata_with_role(pool, organization_id, user_id, MemberRole::Member).await
}

pub(super) async fn ensure_member_metadata_with_role<'a, E>(
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
        WHERE organization_id = $1 AND user_id = $2 AND status = 'active'
        "#,
        organization_id,
        user_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(result.map(|r| r.role))
}

pub(super) async fn assert_membership(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), IdentityError> {
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
    .fetch_one(pool)
    .await?;

    if exists {
        Ok(())
    } else {
        Err(IdentityError::NotFound)
    }
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
