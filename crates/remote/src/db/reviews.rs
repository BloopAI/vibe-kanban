use std::net::IpAddr;

use chrono::{DateTime, Utc};
use ipnetwork::IpNetwork;
use serde::Serialize;
use sqlx::PgPool;
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
    // Organization tracking
    pub organization_id: Option<Uuid>,
}

/// A lightweight review item for list responses
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct ReviewListItem {
    pub id: Uuid,
    pub gh_pr_url: String,
    pub pr_title: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
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
    pub organization_id: Uuid,
}

/// Parameters for creating a manually-triggered review (no webhook)
pub struct CreateManualReviewParams<'a> {
    pub id: Uuid,
    pub gh_pr_url: &'a str,
    pub r2_path: &'a str,
    pub pr_title: &'a str,
    pub pr_owner: &'a str,
    pub pr_repo: &'a str,
    pub pr_number: i32,
    pub organization_id: Uuid,
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

        sqlx::query_as::<_, Review>(
            r#"
            INSERT INTO reviews (id, gh_pr_url, claude_code_session_id, ip_address, r2_path, email, pr_title)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(params.id)
        .bind(params.gh_pr_url)
        .bind(params.claude_code_session_id)
        .bind(ip_network)
        .bind(params.r2_path)
        .bind(params.email)
        .bind(params.pr_title)
        .fetch_one(self.pool)
        .await
        .map_err(ReviewError::from)
    }

    /// Create a webhook-triggered review (no email/IP)
    pub async fn create_webhook_review(
        &self,
        params: CreateWebhookReviewParams<'_>,
    ) -> Result<Review, ReviewError> {
        sqlx::query_as::<_, Review>(
            r#"
            INSERT INTO reviews (id, gh_pr_url, r2_path, pr_title, github_installation_id, pr_owner, pr_repo, pr_number, organization_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            "#,
        )
        .bind(params.id)
        .bind(params.gh_pr_url)
        .bind(params.r2_path)
        .bind(params.pr_title)
        .bind(params.github_installation_id)
        .bind(params.pr_owner)
        .bind(params.pr_repo)
        .bind(params.pr_number)
        .bind(params.organization_id)
        .fetch_one(self.pool)
        .await
        .map_err(ReviewError::from)
    }

    /// Create a manually-triggered review (no webhook, no email/IP)
    pub async fn create_manual_review(
        &self,
        params: CreateManualReviewParams<'_>,
    ) -> Result<Review, ReviewError> {
        sqlx::query_as::<_, Review>(
            r#"
            INSERT INTO reviews (id, gh_pr_url, r2_path, pr_title, pr_owner, pr_repo, pr_number, organization_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#,
        )
        .bind(params.id)
        .bind(params.gh_pr_url)
        .bind(params.r2_path)
        .bind(params.pr_title)
        .bind(params.pr_owner)
        .bind(params.pr_repo)
        .bind(params.pr_number)
        .bind(params.organization_id)
        .fetch_one(self.pool)
        .await
        .map_err(ReviewError::from)
    }

    /// Get a review by its ID.
    /// Returns NotFound if the review doesn't exist or has been deleted.
    pub async fn get_by_id(&self, id: Uuid) -> Result<Review, ReviewError> {
        sqlx::query_as::<_, Review>(
            r#"
            SELECT *
            FROM reviews
            WHERE id = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?
        .ok_or(ReviewError::NotFound)
    }

    /// List reviews for an organization, ordered by created_at descending
    pub async fn list_by_organization(
        &self,
        organization_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ReviewListItem>, ReviewError> {
        let reviews = sqlx::query_as::<_, ReviewListItem>(
            r#"
            SELECT
                id,
                gh_pr_url,
                pr_title,
                status,
                created_at
            FROM reviews
            WHERE organization_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(organization_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(self.pool)
        .await?;

        Ok(reviews)
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
}
