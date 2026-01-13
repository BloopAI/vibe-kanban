use std::path::{Path, PathBuf};

use anyhow::Context;
use futures_util::{StreamExt, TryStreamExt};
use sqlx::{FromRow, QueryBuilder, Sqlite, SqlitePool};
use tokio::{io::AsyncWriteExt, sync::Semaphore};
use utils::execution_logs::{ExecutionLogWriter, process_log_file_path, read_execution_log_file};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ExecutionLogLocation {
    pub project_id: Uuid,
    pub session_id: Uuid,
    pub path: PathBuf,
}

pub async fn resolve_execution_log_location(
    pool: &SqlitePool,
    execution_id: Uuid,
) -> Result<Option<ExecutionLogLocation>, sqlx::Error> {
    #[derive(Debug, FromRow)]
    struct ContextRow {
        project_id: Uuid,
        session_id: Uuid,
    }

    let rec = sqlx::query_as::<_, ContextRow>(
        r#"SELECT
                t.project_id as project_id,
                ep.session_id as session_id
           FROM execution_processes ep
           JOIN sessions s ON s.id = ep.session_id
           JOIN workspaces w ON w.id = s.workspace_id
           JOIN tasks t ON t.id = w.task_id
          WHERE ep.id = ?
          LIMIT 1"#,
    )
    .bind(execution_id)
    .fetch_optional(pool)
    .await?;

    Ok(rec.map(|r| ExecutionLogLocation {
        project_id: r.project_id,
        session_id: r.session_id,
        path: process_log_file_path(r.project_id, r.session_id, execution_id),
    }))
}

pub async fn create_execution_log_writer_for_execution(
    pool: &SqlitePool,
    execution_id: Uuid,
) -> anyhow::Result<Option<ExecutionLogWriter>> {
    let Some(loc) = resolve_execution_log_location(pool, execution_id).await? else {
        return Ok(None);
    };
    let writer = ExecutionLogWriter::new(loc.path)
        .await
        .with_context(|| format!("create log writer for execution {execution_id}"))?;
    Ok(Some(writer))
}

pub async fn read_execution_logs_for_execution(
    pool: &SqlitePool,
    execution_id: Uuid,
) -> anyhow::Result<Option<String>> {
    let Some(loc) = resolve_execution_log_location(pool, execution_id).await? else {
        return Ok(None);
    };

    match tokio::fs::metadata(&loc.path).await {
        Ok(_) => Ok(Some(
            read_execution_log_file(&loc.path)
                .await
                .with_context(|| format!("read execution log file for execution {execution_id}"))?,
        )),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e).with_context(|| {
            format!(
                "check execution log file exists for execution {execution_id} at {}",
                loc.path.display()
            )
        }),
    }
}

pub async fn append_execution_log_line_for_execution(
    pool: &SqlitePool,
    execution_id: Uuid,
    jsonl_line: &str,
) -> anyhow::Result<()> {
    let Some(writer) = create_execution_log_writer_for_execution(pool, execution_id).await? else {
        anyhow::bail!("execution process not found for {}", execution_id);
    };
    writer
        .append_jsonl_line(jsonl_line)
        .await
        .with_context(|| format!("append execution log line for execution {execution_id}"))?;
    Ok(())
}

pub async fn remove_session_process_logs(project_id: Uuid, session_id: Uuid) -> anyhow::Result<()> {
    let dir = utils::execution_logs::process_logs_session_dir(project_id, session_id);
    match tokio::fs::remove_dir_all(&dir).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => {
            Err(e).with_context(|| format!("remove session process logs at {}", dir.display()))
        }
    }
}

pub async fn remove_project_execution_logs(project_id: Uuid) -> anyhow::Result<()> {
    let dir = utils::execution_logs::process_logs_project_dir(project_id);
    match tokio::fs::remove_dir_all(&dir).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => {
            Err(e).with_context(|| format!("remove project execution logs at {}", dir.display()))
        }
    }
}

pub async fn remove_execution_log_file(path: &Path) -> anyhow::Result<()> {
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => {
            Err(e).with_context(|| format!("remove execution log file at {}", path.display()))
        }
    }
}

async fn replace_file_atomic(path: &Path, tmp_path: &Path) -> std::io::Result<()> {
    // Best-effort atomic replace:
    // - If the destination exists, move it aside first (Windows can't overwrite on rename).
    // - Then move tmp into place.
    if tokio::fs::metadata(path).await.is_ok() {
        let backup_path = path.with_extension("bak");
        let _ = tokio::fs::remove_file(&backup_path).await;

        tokio::fs::rename(path, &backup_path).await?;
        match tokio::fs::rename(tmp_path, path).await {
            Ok(()) => {
                let _ = tokio::fs::remove_file(&backup_path).await;
                Ok(())
            }
            Err(e) => {
                let _ = tokio::fs::rename(&backup_path, path).await;
                Err(e)
            }
        }
    } else {
        tokio::fs::rename(tmp_path, path).await
    }
}

pub async fn migrate_execution_process_logs_to_files(pool: &SqlitePool) -> anyhow::Result<()> {
    const MIGRATION_CONCURRENCY: usize = 6;
    const DB_CONCURRENCY: usize = 2;
    const MIB: f64 = 1024.0 * 1024.0;

    let table_exists = sqlx::query_scalar::<_, String>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='execution_process_logs' LIMIT 1",
    )
    .fetch_optional(pool)
    .await?
    .is_some();

    if !table_exists {
        return Ok(());
    }

    // Migrate oldest → newest to minimize disruption for users browsing logs
    // (older processes first; newest remain in DB until later).
    let execution_ids = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT execution_id
             FROM execution_process_logs
         GROUP BY execution_id
         ORDER BY MIN(inserted_at) ASC"#,
    )
    .fetch_all(pool)
    .await?;

    if execution_ids.is_empty() {
        tracing::info!("execution_process_logs is empty; dropping table...");
        match sqlx::query("DROP TABLE execution_process_logs")
            .execute(pool)
            .await
        {
            Ok(_) => {
                tracing::info!("Dropped execution_process_logs");
                if let Err(e) = sqlx::query("VACUUM").execute(pool).await {
                    tracing::warn!(
                        "SQLite VACUUM failed (db may still reuse freed pages): {}",
                        e
                    );
                } else {
                    tracing::info!("SQLite VACUUM completed");
                }
            }
            Err(e) => {
                tracing::warn!("Failed to drop execution_process_logs: {}", e);
            }
        }
        return Ok(());
    }

    let total = execution_ids.len();
    let started_at = std::time::Instant::now();
    tracing::info!(
        "Migrating execution process logs from DB to filesystem ({} executions)...",
        total
    );

    let deletable_ids: std::sync::Arc<std::sync::Mutex<Vec<Uuid>>> =
        std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));

    let migrated_or_detected = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let skipped = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let bytes_migrated = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let db_semaphore = std::sync::Arc::new(Semaphore::new(DB_CONCURRENCY));
    let last_logged_progress_bucket = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));

    let worker_pool = pool.clone();
    let migrated_or_detected_for_workers = migrated_or_detected.clone();
    let skipped_for_workers = skipped.clone();
    let bytes_migrated_for_workers = bytes_migrated.clone();
    let db_semaphore_for_workers = db_semaphore.clone();
    let last_logged_progress_bucket_for_workers = last_logged_progress_bucket.clone();
    let deletable_ids_for_workers = deletable_ids.clone();

    let results: Vec<anyhow::Result<()>> = futures_util::stream::iter(execution_ids)
        .map(|execution_id| {
            let pool = worker_pool.clone();
            let deletable_ids = deletable_ids_for_workers.clone();
            let migrated_or_detected = migrated_or_detected_for_workers.clone();
            let skipped = skipped_for_workers.clone();
            let bytes_migrated = bytes_migrated_for_workers.clone();
            let db_semaphore = db_semaphore_for_workers.clone();
            let last_logged_progress_bucket = last_logged_progress_bucket_for_workers.clone();
            async move {
                let Some(loc) = resolve_execution_log_location(&pool, execution_id).await? else {
                    tracing::warn!(
                        "Skipping log migration for execution {}: missing workspace/project context",
                        execution_id
                    );
                    skipped.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    return Ok(());
                };

                // Already migrated (or created by the new filesystem logger). Drain DB rows and move on.
                if tokio::fs::metadata(&loc.path).await.is_ok() {
                    if let Ok(mut ids) = deletable_ids.lock() {
                        ids.push(execution_id);
                    }
                    migrated_or_detected.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    return Ok(());
                }

                let _permit = db_semaphore
                    .clone()
                    .acquire_owned()
                    .await
                    .expect("db semaphore closed");

                // Export DB logs into a temporary file, then atomically move into place.
                // This avoids producing a partial final file if the process crashes mid-migration.
                if let Some(parent) = loc.path.parent() {
                    tokio::fs::create_dir_all(parent).await?;
                }

                let tmp_path = loc.path.with_extension("tmp");
                let _ = tokio::fs::remove_file(&tmp_path).await;
                let mut tmp_file = tokio::fs::File::create(&tmp_path).await?;

                let mut rows = sqlx::query_scalar::<_, String>(
                    "SELECT logs FROM execution_process_logs WHERE execution_id = ? ORDER BY inserted_at ASC",
                )
                .bind(execution_id)
                .fetch(&pool);

                let mut bytes_for_process: u64 = 0;
                while let Some(logs) = rows.try_next().await? {
                    bytes_for_process += logs.len() as u64;
                    tmp_file.write_all(logs.as_bytes()).await?;
                }

                drop(rows);
                drop(_permit);

                tmp_file.flush().await?;
                drop(tmp_file);

                replace_file_atomic(&loc.path, &tmp_path).await?;

                // Only enqueue DB drain after the file is safely in place.
                if let Ok(mut ids) = deletable_ids.lock() {
                    ids.push(execution_id);
                }
                bytes_migrated.fetch_add(bytes_for_process, std::sync::atomic::Ordering::Relaxed);
                migrated_or_detected.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

                let done = migrated_or_detected.load(std::sync::atomic::Ordering::Relaxed);
                let percent = done.saturating_mul(100) / total.max(1);
                let bucket = (percent / 5) * 5;
                if bucket >= 5 {
                    let prev = last_logged_progress_bucket.load(std::sync::atomic::Ordering::Relaxed);
                    if bucket > prev
                        && last_logged_progress_bucket
                            .compare_exchange(
                                prev,
                                bucket,
                                std::sync::atomic::Ordering::Relaxed,
                                std::sync::atomic::Ordering::Relaxed,
                            )
                            .is_ok()
                    {
                    let elapsed = started_at.elapsed().as_secs_f64().max(0.001);
                    let bytes = bytes_migrated.load(std::sync::atomic::Ordering::Relaxed);
                    let mib = bytes as f64 / MIB;
                    let mib_per_sec = mib / elapsed;
                    tracing::info!(
                        "Process log migration progress: {}% ({}/{}, skipped={}, {:.1} MiB, {:.1} MiB/s)",
                        percent,
                        done,
                        total,
                        skipped.load(std::sync::atomic::Ordering::Relaxed),
                        mib,
                        mib_per_sec
                    );
                    }
                }

                Ok(())
            }
        })
        .buffer_unordered(MIGRATION_CONCURRENCY)
        .collect()
        .await;

    for r in results {
        r?;
    }

    let mut deletable_ids: Vec<Uuid> = {
        let mut guard = deletable_ids.lock().unwrap_or_else(|e| e.into_inner());
        std::mem::take(&mut *guard)
    };

    let migrated_or_detected = migrated_or_detected.load(std::sync::atomic::Ordering::Relaxed);
    let skipped = skipped.load(std::sync::atomic::Ordering::Relaxed);
    let elapsed = started_at.elapsed().as_secs_f64().max(0.001);
    let bytes = bytes_migrated.load(std::sync::atomic::Ordering::Relaxed);
    let mib = bytes as f64 / MIB;
    let mib_per_sec = mib / elapsed;
    tracing::info!(
        "Process log migration finished: migrated_or_detected={}/{} (skipped={}) in {:.1}s ({:.1} MiB/s, {:.1} MiB)",
        migrated_or_detected,
        total,
        skipped,
        elapsed,
        mib_per_sec,
        mib
    );

    let mut deleted_rows: u64 = 0;
    let mut dropped_table = false;
    if !deletable_ids.is_empty() {
        const DELETE_BATCH_SIZE: usize = 100;
        deletable_ids.sort_unstable();
        deletable_ids.dedup();
        tracing::info!(
            "Draining execution_process_logs for {} processes (batch_size={})...",
            deletable_ids.len(),
            DELETE_BATCH_SIZE
        );

        for chunk in deletable_ids.chunks(DELETE_BATCH_SIZE) {
            let mut qb: QueryBuilder<Sqlite> =
                QueryBuilder::new("DELETE FROM execution_process_logs WHERE execution_id IN (");
            let mut separated = qb.separated(", ");
            for id in chunk {
                separated.push_bind(*id);
            }
            qb.push(")");

            let result = qb.build().execute(pool).await?;
            deleted_rows += result.rows_affected();

            tokio::task::yield_now().await;
        }
        tracing::info!(
            "Drained execution_process_logs rows: deleted_rows={}",
            deleted_rows
        );
    }

    let remaining_rows = sqlx::query_scalar::<_, i64>("SELECT 1 FROM execution_process_logs LIMIT 1")
        .fetch_optional(pool)
        .await?;
    if remaining_rows.is_none() {
        tracing::info!("execution_process_logs drained; dropping table...");
        match sqlx::query("DROP TABLE execution_process_logs")
            .execute(pool)
            .await
        {
            Ok(_) => {
                dropped_table = true;
                tracing::info!("Dropped execution_process_logs");
            }
            Err(e) => {
                tracing::warn!("Failed to drop execution_process_logs: {}", e);
            }
        }
    }

    if deleted_rows > 0 || dropped_table {
        tracing::info!(
            "Running SQLite VACUUM to release disk space (deleted_rows={}, dropped_table={})...",
            deleted_rows,
            dropped_table
        );
        if let Err(e) = sqlx::query("VACUUM").execute(pool).await {
            tracing::warn!(
                "SQLite VACUUM failed (db may still reuse freed pages): {}",
                e
            );
        } else {
            tracing::info!("SQLite VACUUM completed");
        }
    }

    Ok(())
}
