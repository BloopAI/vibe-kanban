use chrono::{DateTime, Utc};
use sqlx::{PgPool, query_as};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthorizationStatus {
    Pending,
    Success,
    Error,
    Expired,
}

impl AuthorizationStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Success => "success",
            Self::Error => "error",
            Self::Expired => "expired",
        }
    }

    pub fn from_str(input: &str) -> Option<Self> {
        match input {
            "pending" => Some(Self::Pending),
            "success" => Some(Self::Success),
            "error" => Some(Self::Error),
            "expired" => Some(Self::Expired),
            _ => None,
        }
    }
}

#[derive(Debug, Error)]
pub enum DeviceAuthorizationError {
    #[error("device authorization not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DeviceAuthorization {
    pub id: Uuid,
    pub provider: String,
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub polling_interval: i32,
    pub last_polled_at: Option<DateTime<Utc>>,
    pub status: String,
    pub error_code: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub user_id: Option<String>,
    pub session_id: Option<Uuid>,
}

impl DeviceAuthorization {
    pub fn status(&self) -> Option<AuthorizationStatus> {
        AuthorizationStatus::from_str(&self.status)
    }
}

pub struct DeviceAuthorizationRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> DeviceAuthorizationRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        provider: &str,
        device_code: &str,
        user_code: &str,
        verification_uri: &str,
        verification_uri_complete: Option<&str>,
        expires_at: DateTime<Utc>,
        polling_interval: i32,
    ) -> Result<DeviceAuthorization, DeviceAuthorizationError> {
        query_as!(
            DeviceAuthorization,
            r#"
            INSERT INTO oauth_device_authorizations (
                provider,
                device_code,
                user_code,
                verification_uri,
                verification_uri_complete,
                expires_at,
                polling_interval
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
                id                      AS "id!",
                provider                AS "provider!",
                device_code             AS "device_code!",
                user_code               AS "user_code!",
                verification_uri        AS "verification_uri!",
                verification_uri_complete AS "verification_uri_complete?",
                expires_at              AS "expires_at!",
                polling_interval        AS "polling_interval!",
                last_polled_at          AS "last_polled_at?",
                status                  AS "status!",
                error_code              AS "error_code?",
                created_at              AS "created_at!",
                updated_at              AS "updated_at!",
                completed_at            AS "completed_at?",
                user_id                 AS "user_id?",
                session_id              AS "session_id?"
            "#,
            provider,
            device_code,
            user_code,
            verification_uri,
            verification_uri_complete,
            expires_at,
            polling_interval
        )
        .fetch_one(self.pool)
        .await
        .map_err(DeviceAuthorizationError::from)
    }

    pub async fn get(&self, id: Uuid) -> Result<DeviceAuthorization, DeviceAuthorizationError> {
        query_as!(
            DeviceAuthorization,
            r#"
            SELECT
                id                      AS "id!",
                provider                AS "provider!",
                device_code             AS "device_code!",
                user_code               AS "user_code!",
                verification_uri        AS "verification_uri!",
                verification_uri_complete AS "verification_uri_complete?",
                expires_at              AS "expires_at!",
                polling_interval        AS "polling_interval!",
                last_polled_at          AS "last_polled_at?",
                status                  AS "status!",
                error_code              AS "error_code?",
                created_at              AS "created_at!",
                updated_at              AS "updated_at!",
                completed_at            AS "completed_at?",
                user_id                 AS "user_id?",
                session_id              AS "session_id?"
            FROM oauth_device_authorizations
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(DeviceAuthorizationError::NotFound)
    }

    pub async fn set_status(
        &self,
        id: Uuid,
        status: AuthorizationStatus,
        error_code: Option<&str>,
    ) -> Result<(), DeviceAuthorizationError> {
        sqlx::query!(
            r#"
            UPDATE oauth_device_authorizations
            SET
                status = $2,
                error_code = $3,
                updated_at = NOW()
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

    pub async fn mark_completed(
        &self,
        id: Uuid,
        user_id: &str,
        session_id: Uuid,
    ) -> Result<(), DeviceAuthorizationError> {
        sqlx::query!(
            r#"
            UPDATE oauth_device_authorizations
            SET
                status = 'success',
                user_id = $2,
                session_id = $3,
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            "#,
            id,
            user_id,
            session_id
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn record_poll(&self, id: Uuid) -> Result<(), DeviceAuthorizationError> {
        sqlx::query!(
            r#"
            UPDATE oauth_device_authorizations
            SET last_polled_at = NOW(), updated_at = NOW()
            WHERE id = $1
            "#,
            id
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_interval(
        &self,
        id: Uuid,
        interval: i32,
    ) -> Result<(), DeviceAuthorizationError> {
        sqlx::query!(
            r#"
            UPDATE oauth_device_authorizations
            SET polling_interval = $2, updated_at = NOW()
            WHERE id = $1
            "#,
            id,
            interval
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }
}
