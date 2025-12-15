//! PR Review service for webhook-triggered code reviews.

use std::{fs::File, path::Path};

use flate2::{Compression, write::GzEncoder};
use reqwest::Client;
use sqlx::PgPool;
use tar::Builder;
use thiserror::Error;
use tracing::{debug, error, info};
use uuid::Uuid;

use super::service::{GitHubAppError, GitHubAppService};
use crate::{
    db::reviews::{CreateWebhookReviewParams, ReviewError, ReviewRepository},
    r2::{R2Error, R2Service},
};

/// Parameters extracted from webhook payload for PR review
#[derive(Debug, Clone)]
pub struct PrReviewParams {
    pub installation_id: i64,
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    pub pr_title: String,
    pub pr_body: String,
    pub head_sha: String,
    pub base_sha: String,
}

#[derive(Debug, Error)]
pub enum PrReviewError {
    #[error("GitHub error: {0}")]
    GitHub(#[from] GitHubAppError),
    #[error("R2 error: {0}")]
    R2(#[from] R2Error),
    #[error("Database error: {0}")]
    Database(#[from] ReviewError),
    #[error("Archive error: {0}")]
    Archive(String),
    #[error("Worker error: {0}")]
    Worker(String),
}

/// Service for processing webhook-triggered PR reviews
pub struct PrReviewService {
    github_app: GitHubAppService,
    r2: R2Service,
    http_client: Client,
    worker_base_url: String,
    server_base_url: String,
}

impl PrReviewService {
    pub fn new(
        github_app: GitHubAppService,
        r2: R2Service,
        http_client: Client,
        worker_base_url: String,
        server_base_url: String,
    ) -> Self {
        Self {
            github_app,
            r2,
            http_client,
            worker_base_url,
            server_base_url,
        }
    }

    /// Process a PR review from webhook.
    ///
    /// This will:
    /// 1. Clone the repository at the PR head commit
    /// 2. Create a tarball of the repository
    /// 3. Upload the tarball to R2
    /// 4. Create a review record in the database
    /// 5. Start the review worker
    ///
    /// Returns the review ID on success.
    pub async fn process_pr_review(
        &self,
        pool: &PgPool,
        params: PrReviewParams,
    ) -> Result<Uuid, PrReviewError> {
        let review_id = Uuid::new_v4();

        info!(
            review_id = %review_id,
            owner = %params.owner,
            repo = %params.repo,
            pr_number = params.pr_number,
            "Starting webhook PR review"
        );

        // 1. Clone the repository
        let temp_dir = self
            .github_app
            .clone_repo(
                params.installation_id,
                &params.owner,
                &params.repo,
                &params.head_sha,
            )
            .await?;

        debug!(review_id = %review_id, "Repository cloned");

        // 2. Create tarball
        let tarball =
            create_tarball(temp_dir.path()).map_err(|e| PrReviewError::Archive(e.to_string()))?;

        let tarball_size_mb = tarball.len() as f64 / 1_048_576.0;
        debug!(review_id = %review_id, size_mb = tarball_size_mb, "Tarball created");

        // 3. Upload to R2
        let r2_path = self.r2.upload_bytes(review_id, tarball).await?;
        debug!(review_id = %review_id, r2_path = %r2_path, "Uploaded to R2");

        // 4. Create review record in database
        let gh_pr_url = format!(
            "https://github.com/{}/{}/pull/{}",
            params.owner, params.repo, params.pr_number
        );

        let repo = ReviewRepository::new(pool);
        repo.create_webhook_review(CreateWebhookReviewParams {
            id: review_id,
            gh_pr_url: &gh_pr_url,
            r2_path: &r2_path,
            pr_title: &params.pr_title,
            github_installation_id: params.installation_id,
            pr_owner: &params.owner,
            pr_repo: &params.repo,
            pr_number: params.pr_number as i32,
        })
        .await?;

        debug!(review_id = %review_id, "Review record created");

        // 5. Start the review worker
        let codebase_url = format!(
            "{}/reviews/{}/payload.tar.gz",
            self.r2_public_url(),
            review_id
        );
        let callback_url = format!("{}/review/{}", self.server_base_url, review_id);

        let start_request = serde_json::json!({
            "id": review_id.to_string(),
            "title": params.pr_title,
            "description": params.pr_body,
            "org": params.owner,
            "repo": params.repo,
            "codebaseUrl": codebase_url,
            "baseCommit": params.base_sha,
            "callbackUrl": callback_url,
        });

        let response = self
            .http_client
            .post(format!("{}/review/start", self.worker_base_url))
            .json(&start_request)
            .send()
            .await
            .map_err(|e| PrReviewError::Worker(format!("Failed to call worker: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            error!(review_id = %review_id, status = %status, body = %body, "Worker returned error");
            return Err(PrReviewError::Worker(format!(
                "Worker returned {}: {}",
                status, body
            )));
        }

        info!(review_id = %review_id, "Review worker started successfully");

        Ok(review_id)
    }

    /// Get the public URL for R2 (used to construct codebase URLs for the worker).
    /// This assumes the R2 bucket has public read access configured.
    fn r2_public_url(&self) -> &str {
        // The worker needs to be able to fetch the tarball from R2.
        // This is typically configured via a public bucket URL or CDN.
        // For now, we'll use the worker base URL as a proxy assumption.
        // In production, this should be configured separately.
        &self.worker_base_url
    }
}

/// Create a tar.gz archive from a directory
fn create_tarball(source_dir: &Path) -> Result<Vec<u8>, std::io::Error> {
    debug!("Creating tarball from {}", source_dir.display());

    let mut buffer = Vec::new();

    {
        let encoder = GzEncoder::new(&mut buffer, Compression::default());
        let mut archive = Builder::new(encoder);

        add_directory_to_archive(&mut archive, source_dir, source_dir)?;

        let encoder = archive.into_inner()?;
        encoder.finish()?;
    }

    debug!("Created tarball: {} bytes", buffer.len());

    Ok(buffer)
}

fn add_directory_to_archive<W: std::io::Write>(
    archive: &mut Builder<W>,
    base_dir: &Path,
    current_dir: &Path,
) -> Result<(), std::io::Error> {
    let entries = std::fs::read_dir(current_dir)?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();

        let relative_path = path.strip_prefix(base_dir).map_err(std::io::Error::other)?;

        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            // Recursively add directory contents
            add_directory_to_archive(archive, base_dir, &path)?;
        } else if metadata.is_file() {
            // Add file to archive
            let mut file = File::open(&path)?;
            archive.append_file(relative_path, &mut file)?;
        }
        // Skip symlinks and other special files
    }

    Ok(())
}
