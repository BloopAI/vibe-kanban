use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
pub use utils::api::organizations::InvitationStatus;
use uuid::Uuid;

use super::{
    identity_errors::IdentityError,
    organization_members::{MemberRole, assert_admin, ensure_member_metadata_with_role},
    organizations::Organization,
};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Invitation {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub invited_by_user_id: Option<Uuid>,
    pub email: String,
    pub role: MemberRole,
    pub status: InvitationStatus,
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct InvitationRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> InvitationRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_invitation(
        &self,
        organization_id: Uuid,
        invited_by_user_id: Uuid,
        email: &str,
        role: MemberRole,
        expires_at: DateTime<Utc>,
        token: &str,
    ) -> Result<Invitation, IdentityError> {
        assert_admin(self.pool, organization_id, invited_by_user_id).await?;

        let invitation = sqlx::query_as!(
            Invitation,
            r#"
            INSERT INTO organization_invitations (
                organization_id, invited_by_user_id, email, role, token, expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id AS "id!",
                organization_id AS "organization_id!: Uuid",
                invited_by_user_id AS "invited_by_user_id?: Uuid",
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
            if let Some(db_err) = e.as_database_error()
                && db_err.is_unique_violation()
            {
                return IdentityError::InvitationError(
                    "A pending invitation already exists for this email".to_string(),
                );
            }
            IdentityError::from(e)
        })?;

        Ok(invitation)
    }

    pub async fn list_invitations(
        &self,
        organization_id: Uuid,
        requesting_user_id: Uuid,
    ) -> Result<Vec<Invitation>, IdentityError> {
        assert_admin(self.pool, organization_id, requesting_user_id).await?;

        let invitations = sqlx::query_as!(
            Invitation,
            r#"
            SELECT
                id AS "id!",
                organization_id AS "organization_id!: Uuid",
                invited_by_user_id AS "invited_by_user_id?: Uuid",
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
                organization_id AS "organization_id!: Uuid",
                invited_by_user_id AS "invited_by_user_id?: Uuid",
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

    pub async fn revoke_invitation(
        &self,
        organization_id: Uuid,
        invitation_id: Uuid,
        requesting_user_id: Uuid,
    ) -> Result<(), IdentityError> {
        assert_admin(self.pool, organization_id, requesting_user_id).await?;

        let result = sqlx::query!(
            r#"
            DELETE FROM organization_invitations
            WHERE id = $1 AND organization_id = $2
            "#,
            invitation_id,
            organization_id
        )
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(IdentityError::NotFound);
        }

        Ok(())
    }

    pub async fn accept_invitation(
        &self,
        token: &str,
        user_id: Uuid,
    ) -> Result<(Organization, MemberRole), IdentityError> {
        let mut tx = self.pool.begin().await?;

        let invitation = sqlx::query_as!(
            Invitation,
            r#"
            SELECT
                id AS "id!",
                organization_id AS "organization_id!: Uuid",
                invited_by_user_id AS "invited_by_user_id?: Uuid",
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
            invitation.organization_id,
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
                id AS "id!: Uuid",
                name AS "name!",
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
