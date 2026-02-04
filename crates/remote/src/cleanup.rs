use std::time::Duration;

use sqlx::PgPool;
use time::OffsetDateTime;
use tokio::task::JoinHandle;
use tracing::{info, instrument, warn};

use crate::{
    azure_blob::AzureBlobService,
    db::attachments::AttachmentRepository,
    db::blobs::BlobRepository,
};

const EXPIRED_BATCH_SIZE: i64 = 100;
const STAGING_MAX_AGE: Duration = Duration::from_secs(3600);
const DEFAULT_INTERVAL: Duration = Duration::from_secs(3600);

/// Spawns a background task that periodically cleans up orphan attachments and
/// staging blobs. Call once during server startup.
pub fn spawn_cleanup_task(pool: PgPool, azure: AzureBlobService) -> JoinHandle<()> {
    let interval = std::env::var("ATTACHMENT_CLEANUP_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or(DEFAULT_INTERVAL);

    info!(
        interval_secs = interval.as_secs(),
        "Starting attachment cleanup background task"
    );

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        // Skip the immediate first tick so the server can finish starting up.
        ticker.tick().await;

        loop {
            ticker.tick().await;
            run_sweep(&pool, &azure).await;
        }
    })
}

#[instrument(name = "attachment_cleanup.sweep", skip_all)]
async fn run_sweep(pool: &PgPool, azure: &AzureBlobService) {
    info!("Starting attachment cleanup sweep");

    let (expired, staging) = tokio::join!(
        cleanup_expired_attachments(pool, azure),
        cleanup_orphan_staging_blobs(azure),
    );

    match expired {
        Ok(count) => info!(deleted = count, "Expired attachment cleanup complete"),
        Err(e) => warn!(error = %e, "Expired attachment cleanup failed"),
    }

    match staging {
        Ok(count) => info!(deleted = count, "Staging blob cleanup complete"),
        Err(e) => warn!(error = %e, "Staging blob cleanup failed"),
    }
}

async fn cleanup_expired_attachments(
    pool: &PgPool,
    azure: &AzureBlobService,
) -> anyhow::Result<u32> {
    let expired = AttachmentRepository::find_expired(pool, EXPIRED_BATCH_SIZE).await?;
    let mut deleted_count: u32 = 0;

    for attachment in expired {
        let attachment_id = attachment.id;
        let blob_id = attachment.blob_id;

        if let Err(e) = AttachmentRepository::delete(pool, attachment_id).await {
            warn!(%attachment_id, error = %e, "Failed to delete expired attachment");
            continue;
        }

        match AttachmentRepository::count_by_blob_id(pool, blob_id).await {
            Ok(0) => {
                if let Ok(Some(blob)) = BlobRepository::delete(pool, blob_id).await {
                    if let Err(e) = azure.delete_blob(&blob.blob_path).await {
                        warn!(blob_path = %blob.blob_path, error = %e, "Failed to delete Azure blob");
                    }
                    if let Some(thumb_path) = &blob.thumbnail_blob_path {
                        if let Err(e) = azure.delete_blob(thumb_path).await {
                            warn!(blob_path = %thumb_path, error = %e, "Failed to delete Azure thumbnail");
                        }
                    }
                }
            }
            Ok(_) => {} // blob still referenced by other attachments
            Err(e) => {
                warn!(%blob_id, error = %e, "Failed to count blob references");
            }
        }

        deleted_count += 1;
    }

    Ok(deleted_count)
}

async fn cleanup_orphan_staging_blobs(azure: &AzureBlobService) -> anyhow::Result<u32> {
    let cutoff = OffsetDateTime::now_utc() - STAGING_MAX_AGE;
    let staging_blobs = azure.list_blobs_with_prefix("staging/").await?;
    let mut deleted_count: u32 = 0;

    for blob in staging_blobs {
        if blob.last_modified.is_some_and(|t| t < cutoff) {
            if let Err(e) = azure.delete_blob(&blob.name).await {
                warn!(blob_name = %blob.name, error = %e, "Failed to delete orphan staging blob");
            } else {
                deleted_count += 1;
            }
        }
    }

    Ok(deleted_count)
}
