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
    pub ip_address: Option<IpNetwork>,
    pub review_cache: Option<serde_json::Value>,
    pub last_viewed_at: Option<DateTime<Utc>>,
    pub r2_path: String,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub email: Option<String>,
    pub pr_title: String,
    pub status: String,
    // Webhook-specific fields
    pub github_installation_id: Option<i64>,
    pub pr_owner: Option<String>,
    pub pr_repo: Option<String>,
    pub pr_number: Option<i32>,
}

impl Review {
    /// Returns true if this review was triggered by a GitHub webhook
    pub fn is_webhook_review(&self) -> bool {
        self.github_installation_id.is_some()
    }
}

/// Parameters for creating a new review (CLI-triggered)
pub struct CreateReviewParams<'a> {
    pub id: Uuid,
    pub gh_pr_url: &'a str,
    pub claude_code_session_id: Option<&'a str>,
    pub ip_address: IpAddr,
    pub r2_path: &'a str,
    pub email: &'a str,
    pub pr_title: &'a str,
}

/// Parameters for creating a webhook-triggered review
pub struct CreateWebhookReviewParams<'a> {
    pub id: Uuid,
    pub gh_pr_url: &'a str,
    pub r2_path: &'a str,
    pub pr_title: &'a str,
    pub github_installation_id: i64,
    pub pr_owner: &'a str,
    pub pr_repo: &'a str,
    pub pr_number: i32,
}

pub struct ReviewRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> ReviewRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, params: CreateReviewParams<'_>) -> Result<Review, ReviewError> {
        let ip_network = IpNetwork::from(params.ip_address);

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
                pr_title,
                status,
                github_installation_id,
                pr_owner,
                pr_repo,
                pr_number
            "#,
            params.id,
            params.gh_pr_url,
            params.claude_code_session_id,
            ip_network,
            params.r2_path,
            params.email,
            params.pr_title
        )
        .fetch_one(self.pool)
        .await
        .map_err(ReviewError::from)
    }

    /// Create a webhook-triggered review (no email/IP)
    pub async fn create_webhook_review(
        &self,
        params: CreateWebhookReviewParams<'_>,
    ) -> Result<Review, ReviewError> {
        query_as!(
            Review,
            r#"
            INSERT INTO reviews (id, gh_pr_url, r2_path, pr_title, github_installation_id, pr_owner, pr_repo, pr_number)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
                pr_title,
                status,
                github_installation_id,
                pr_owner,
                pr_repo,
                pr_number
            "#,
            params.id,
            params.gh_pr_url,
            params.r2_path,
            params.pr_title,
            params.github_installation_id,
            params.pr_owner,
            params.pr_repo,
            params.pr_number
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
                pr_title,
                status,
                github_installation_id,
                pr_owner,
                pr_repo,
                pr_number
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

    /// Mark a review as completed
    pub async fn mark_completed(&self, id: Uuid) -> Result<(), ReviewError> {
        sqlx::query!(
            r#"
            UPDATE reviews
            SET status = 'completed'
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            id
        )
        .execute(self.pool)
        .await
        .map_err(ReviewError::from)?;

        Ok(())
    }

    /// Mark a review as failed
    pub async fn mark_failed(&self, id: Uuid) -> Result<(), ReviewError> {
        sqlx::query!(
            r#"
            UPDATE reviews
            SET status = 'failed'
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            id
        )
        .execute(self.pool)
        .await
        .map_err(ReviewError::from)?;

        Ok(())
    }

    /// Check if there's a pending review for a specific PR
    pub async fn has_pending_review_for_pr(
        &self,
        pr_owner: &str,
        pr_repo: &str,
        pr_number: i32,
    ) -> Result<bool, ReviewError> {
        let result = sqlx::query!(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM reviews
                WHERE pr_owner = $1
                  AND pr_repo = $2
                  AND pr_number = $3
                  AND status = 'pending'
                  AND deleted_at IS NULL
            ) as "exists!"
            "#,
            pr_owner,
            pr_repo,
            pr_number
        )
        .fetch_one(self.pool)
        .await?;

        Ok(result.exists)
    }
}
