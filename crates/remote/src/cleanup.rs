use std::time::Duration;

use sqlx::PgPool;
use tokio::task::JoinHandle;
use tracing::{info, instrument, warn};

use crate::{
    azure_blob::AzureBlobService,
    db::attachments::AttachmentRepository,
    db::blobs::BlobRepository,
    db::pending_uploads::PendingUploadRepository,
};

const EXPIRED_BATCH_SIZE: i64 = 100;
const DEFAULT_INTERVAL: Duration = Duration::from_secs(3600);

/// Spawns a background task that periodically cleans up orphan attachments and
/// expired pending uploads. Call once during server startup.
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

    let (expired, pending) = tokio::join!(
        cleanup_expired_attachments(pool, azure),
        cleanup_expired_pending_uploads(pool, azure),
    );

    match expired {
        Ok(count) => info!(deleted = count, "Expired attachment cleanup complete"),
        Err(e) => warn!(error = %e, "Expired attachment cleanup failed"),
    }

    match pending {
        Ok(count) => info!(deleted = count, "Expired pending uploads cleanup complete"),
        Err(e) => warn!(error = %e, "Expired pending uploads cleanup failed"),
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

async fn cleanup_expired_pending_uploads(
    pool: &PgPool,
    azure: &AzureBlobService,
) -> anyhow::Result<u32> {
    let expired = PendingUploadRepository::delete_expired(pool).await?;
    let mut deleted_count: u32 = 0;

    for pending in expired {
        if let Err(e) = azure.delete_blob(&pending.blob_path).await {
            warn!(blob_path = %pending.blob_path, error = %e, "Failed to delete Azure blob for expired pending upload");
        }
        deleted_count += 1;
    }

    Ok(deleted_count)
}
