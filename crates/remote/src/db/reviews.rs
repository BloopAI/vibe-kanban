use std::net::IpAddr;

use chrono::{DateTime, Utc};
use ipnetwork::IpNetwork;
use serde::Serialize;
use sqlx::{PgPool, query_as};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ReviewError {
    #[error("review not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct Review {
    pub id: Uuid,
    pub gh_pr_url: String,
    pub claude_code_session_id: Option<String>,
    pub ip_address: IpNetwork,
    pub review_cache: Option<serde_json::Value>,
    pub last_viewed_at: Option<DateTime<Utc>>,
    pub r2_path: String,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub email: String,
    pub pr_title: String,
}

pub struct ReviewRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> ReviewRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        id: Uuid,
        gh_pr_url: &str,
        claude_code_session_id: Option<&str>,
        ip_address: IpAddr,
        r2_path: &str,
        email: &str,
        pr_title: &str,
    ) -> Result<Review, ReviewError> {
        let ip_network = IpNetwork::from(ip_address);

        query_as!(
            Review,
            r#"
            INSERT INTO reviews (id, gh_pr_url, claude_code_session_id, ip_address, r2_path, email, pr_title)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
                id,
                gh_pr_url,
                claude_code_session_id,
                ip_address AS "ip_address: IpNetwork",
                review_cache,
                last_viewed_at,
                r2_path,
                deleted_at,
                created_at,
                email,
                pr_title
            "#,
            id,
            gh_pr_url,
            claude_code_session_id,
            ip_network,
            r2_path,
            email,
            pr_title
        )
        .fetch_one(self.pool)
        .await
        .map_err(ReviewError::from)
    }

    /// Get a review by its ID.
    /// Returns NotFound if the review doesn't exist or has been deleted.
    pub async fn get_by_id(&self, id: Uuid) -> Result<Review, ReviewError> {
        query_as!(
            Review,
            r#"
            SELECT
                id,
                gh_pr_url,
                claude_code_session_id,
                ip_address AS "ip_address: IpNetwork",
                review_cache,
                last_viewed_at,
                r2_path,
                deleted_at,
                created_at,
                email,
                pr_title
            FROM reviews
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            id
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(ReviewError::NotFound)
    }

    /// Count reviews from an IP address since a given timestamp.
    /// Used for rate limiting.
    pub async fn count_since(
        &self,
        ip_address: IpAddr,
        since: DateTime<Utc>,
    ) -> Result<i64, ReviewError> {
        let ip_network = IpNetwork::from(ip_address);

        let result = sqlx::query!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM reviews
            WHERE ip_address = $1
              AND created_at > $2
              AND deleted_at IS NULL
            "#,
            ip_network,
            since
        )
        .fetch_one(self.pool)
        .await
        .map_err(ReviewError::from)?;

        Ok(result.count)
    }
}
