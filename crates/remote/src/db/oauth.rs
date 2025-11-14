use std::str::FromStr;

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthorizationStatus {
    Pending,
    Authorized,
    Redeemed,
    Error,
    Expired,
}

impl AuthorizationStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Authorized => "authorized",
            Self::Redeemed => "redeemed",
            Self::Error => "error",
            Self::Expired => "expired",
        }
    }
}

impl FromStr for AuthorizationStatus {
    type Err = ();

    fn from_str(input: &str) -> Result<Self, Self::Err> {
        match input {
            "pending" => Ok(Self::Pending),
            "authorized" => Ok(Self::Authorized),
            "redeemed" => Ok(Self::Redeemed),
            "error" => Ok(Self::Error),
            "expired" => Ok(Self::Expired),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Error)]
pub enum OAuthHandoffError {
    #[error("oauth handoff not found")]
    NotFound,
    #[error("oauth handoff is not authorized")]
    NotAuthorized,
    #[error("oauth handoff already redeemed or not in authorized state")]
    AlreadyRedeemed,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OAuthHandoff {
    pub id: Uuid,
    pub provider: String,
    pub state: String,
    pub return_to: String,
    pub app_challenge: String,
    pub app_code_hash: Option<String>,
    pub status: String,
    pub error_code: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub authorized_at: Option<DateTime<Utc>>,
    pub redeemed_at: Option<DateTime<Utc>>,
    pub user_id: Option<Uuid>,
    pub session_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl OAuthHandoff {
    pub fn status(&self) -> Option<AuthorizationStatus> {
        AuthorizationStatus::from_str(&self.status).ok()
    }
}

#[derive(Debug, Clone)]
pub struct CreateOAuthHandoff<'a> {
    pub provider: &'a str,
    pub state: &'a str,
    pub return_to: &'a str,
    pub app_challenge: &'a str,
    pub expires_at: DateTime<Utc>,
}

pub struct OAuthHandoffRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> OAuthHandoffRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        data: CreateOAuthHandoff<'_>,
    ) -> Result<OAuthHandoff, OAuthHandoffError> {
        sqlx::query_as!(
            OAuthHandoff,
            r#"
            INSERT INTO oauth_handoffs (
                provider,
                state,
                return_to,
                app_challenge,
                expires_at
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id              AS "id!",
                provider        AS "provider!",
                state           AS "state!",
                return_to       AS "return_to!",
                app_challenge   AS "app_challenge!",
                app_code_hash   AS "app_code_hash?",
                status          AS "status!",
                error_code      AS "error_code?",
                expires_at      AS "expires_at!",
                authorized_at   AS "authorized_at?",
                redeemed_at     AS "redeemed_at?",
                user_id         AS "user_id?",
                session_id      AS "session_id?",
                created_at      AS "created_at!",
                updated_at      AS "updated_at!"
            "#,
            data.provider,
            data.state,
            data.return_to,
            data.app_challenge,
            data.expires_at,
        )
        .fetch_one(self.pool)
        .await
        .map_err(OAuthHandoffError::from)
    }

    pub async fn get(&self, id: Uuid) -> Result<OAuthHandoff, OAuthHandoffError> {
        sqlx::query_as!(
            OAuthHandoff,
            r#"
            SELECT
                id              AS "id!",
                provider        AS "provider!",
                state           AS "state!",
                return_to       AS "return_to!",
                app_challenge   AS "app_challenge!",
                app_code_hash   AS "app_code_hash?",
                status          AS "status!",
                error_code      AS "error_code?",
                expires_at      AS "expires_at!",
                authorized_at   AS "authorized_at?",
                redeemed_at     AS "redeemed_at?",
                user_id         AS "user_id?",
                session_id      AS "session_id?",
                created_at      AS "created_at!",
                updated_at      AS "updated_at!"
            FROM oauth_handoffs
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(OAuthHandoffError::NotFound)
    }

    pub async fn get_by_state(&self, state: &str) -> Result<OAuthHandoff, OAuthHandoffError> {
        sqlx::query_as!(
            OAuthHandoff,
            r#"
            SELECT
                id              AS "id!",
                provider        AS "provider!",
                state           AS "state!",
                return_to       AS "return_to!",
                app_challenge   AS "app_challenge!",
                app_code_hash   AS "app_code_hash?",
                status          AS "status!",
                error_code      AS "error_code?",
                expires_at      AS "expires_at!",
                authorized_at   AS "authorized_at?",
                redeemed_at     AS "redeemed_at?",
                user_id         AS "user_id?",
                session_id      AS "session_id?",
                created_at      AS "created_at!",
                updated_at      AS "updated_at!"
            FROM oauth_handoffs
            WHERE state = $1
            "#,
            state
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(OAuthHandoffError::NotFound)
    }

    pub async fn set_status(
        &self,
        id: Uuid,
        status: AuthorizationStatus,
        error_code: Option<&str>,
    ) -> Result<(), OAuthHandoffError> {
        sqlx::query!(
            r#"
            UPDATE oauth_handoffs
            SET
                status = $2,
                error_code = $3
            WHERE id = $1
            "#,
            id,
            status.as_str(),
            error_code
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn mark_authorized(
        &self,
        id: Uuid,
        user_id: Uuid,
        session_id: Uuid,
        app_code_hash: &str,
    ) -> Result<(), OAuthHandoffError> {
        sqlx::query!(
            r#"
            UPDATE oauth_handoffs
            SET
                status = 'authorized',
                error_code = NULL,
                user_id = $2,
                session_id = $3,
                app_code_hash = $4,
                authorized_at = NOW()
            WHERE id = $1
            "#,
            id,
            user_id,
            session_id,
            app_code_hash
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn mark_redeemed(&self, id: Uuid) -> Result<(), OAuthHandoffError> {
        let result = sqlx::query!(
            r#"
            UPDATE oauth_handoffs
            SET
                status = 'redeemed',
                redeemed_at = NOW()
            WHERE id = $1
              AND status = 'authorized'
            "#,
            id
        )
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(OAuthHandoffError::AlreadyRedeemed);
        }

        Ok(())
    }

    pub async fn ensure_redeemable(&self, id: Uuid) -> Result<(), OAuthHandoffError> {
        let handoff = self.get(id).await?;

        match handoff.status() {
            Some(AuthorizationStatus::Authorized) => Ok(()),
            Some(AuthorizationStatus::Pending) => Err(OAuthHandoffError::NotAuthorized),
            _ => Err(OAuthHandoffError::AlreadyRedeemed),
        }
    }
}
