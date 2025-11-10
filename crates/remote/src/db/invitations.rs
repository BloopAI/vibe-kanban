use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Type};
use uuid::Uuid;

use super::{
    identity_errors::IdentityError,
    organizations::{MemberRole, Organization},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "invitation_status", rename_all = "lowercase")]
pub enum InvitationStatus {
    Pending,
    Accepted,
    Declined,
    Expired,
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

pub struct InvitationRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> InvitationRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
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
        use super::organizations::OrganizationRepository;

        let org_repo = OrganizationRepository::new(self.pool);
        org_repo
            .assert_admin(organization_id, invited_by_user_id)
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
        organization_id: &str,
        requesting_user_id: &str,
    ) -> Result<Vec<Invitation>, IdentityError> {
        use super::organizations::OrganizationRepository;

        let org_repo = OrganizationRepository::new(self.pool);
        org_repo
            .assert_admin(organization_id, requesting_user_id)
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
        use super::organizations::ensure_member_metadata_with_role;

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
