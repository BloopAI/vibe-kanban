use std::{sync::OnceLock, time::Duration};

use chrono::{Duration as ChronoDuration, NaiveTime, TimeZone, Utc};
use sqlx::{PgPool, error::DatabaseError};
use tokio::time::sleep;
use tracing::{error, info, warn};

const PRUNE_LOCK_KEY: &str = "vibe_kanban_activity_retention_v1";
static PROVISION_TIME: OnceLock<NaiveTime> = OnceLock::new();
static PRUNE_TIME: OnceLock<NaiveTime> = OnceLock::new();

fn provision_time() -> NaiveTime {
    *PROVISION_TIME.get_or_init(|| NaiveTime::from_hms_opt(0, 10, 0).expect("valid time"))
}

fn prune_time() -> NaiveTime {
    *PRUNE_TIME.get_or_init(|| NaiveTime::from_hms_opt(1, 30, 0).expect("valid time"))
}

pub fn spawn_activity_partition_maintenance(pool: PgPool) {
    let creation_pool = pool.clone();
    tokio::spawn(async move {
        if let Err(err) = ensure_future_partitions_with_pool(&creation_pool).await {
            error!(error = ?err, "initial activity partition provisioning failed");
        }

        loop {
            sleep(duration_until(provision_time())).await;
            if let Err(err) = ensure_future_partitions_with_pool(&creation_pool).await {
                error!(error = ?err, "scheduled partition provisioning failed");
            }
        }
    });

    tokio::spawn(async move {
        if let Err(err) = prune_old_partitions(&pool).await {
            error!(error = ?err, "initial activity partition pruning failed");
        }

        loop {
            sleep(duration_until(prune_time())).await;
            if let Err(err) = prune_old_partitions(&pool).await {
                error!(error = ?err, "scheduled partition pruning failed");
            }
        }
    });
}

fn duration_until(target_time: NaiveTime) -> Duration {
    let now = Utc::now();

    let today = now.date_naive();
    let mut next = today.and_time(target_time);

    if now.time() >= target_time {
        next = (today + ChronoDuration::days(1)).and_time(target_time);
    }

    let next_dt = Utc.from_utc_datetime(&next);
    (next_dt - now)
        .to_std()
        .unwrap_or_else(|_| Duration::from_secs(0))
}

async fn prune_old_partitions(pool: &PgPool) -> Result<(), sqlx::Error> {
    let mut conn = pool.acquire().await?;

    let lock_acquired = sqlx::query_scalar!(
        r#"
        SELECT pg_try_advisory_lock(hashtextextended($1, 0))
        "#,
        PRUNE_LOCK_KEY
    )
    .fetch_one(&mut *conn)
    .await?
    .unwrap_or(false);

    if !lock_acquired {
        warn!("skipping partition pruning because another worker holds the lock");
        return Ok(());
    }

    let result = async {
        let partitions = sqlx::query!(
            r#"
            SELECT format('%I.%I', n.nspname, c.relname) AS qualified_name,
                   split_part(
                       split_part(pg_get_expr(c.relpartbound, c.oid), ' TO (''', 2),
                       ''')', 1
                   )::timestamptz AS upper_bound
            FROM pg_partition_tree('activity') pt
            JOIN pg_class c ON c.oid = pt.relid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE pt.isleaf
              AND c.relname ~ '^activity_p_\d{8}$'
              AND split_part(
                    split_part(pg_get_expr(c.relpartbound, c.oid), ' TO (''', 2),
                    ''')', 1
                  )::timestamptz <= NOW() - INTERVAL '2 days'
            ORDER BY upper_bound
            "#
        )
        .fetch_all(&mut *conn)
        .await?;

        for partition in partitions {
            if let Some(name) = partition.qualified_name {
                let detach = format!("ALTER TABLE activity DETACH PARTITION {name} CONCURRENTLY");
                sqlx::query(&detach).execute(&mut *conn).await?;

                let drop = format!("DROP TABLE {name}");
                sqlx::query(&drop).execute(&mut *conn).await?;

                info!(partition = %name, "dropped activity partition");
            }
        }

        Ok(())
    }
    .await;

    let _ = sqlx::query_scalar!(
        r#"
        SELECT pg_advisory_unlock(hashtextextended($1, 0))
        "#,
        PRUNE_LOCK_KEY
    )
    .fetch_one(&mut *conn)
    .await;

    result
}

pub async fn ensure_future_partitions_with_pool(pool: &PgPool) -> Result<(), sqlx::Error> {
    let mut conn = pool.acquire().await?;
    ensure_future_partitions(&mut conn).await
}

pub async fn ensure_future_partitions(
    executor: &mut sqlx::PgConnection,
) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT ensure_activity_partition(NOW())")
        .execute(&mut *executor)
        .await?;
    sqlx::query("SELECT ensure_activity_partition(NOW() + INTERVAL '24 hours')")
        .execute(&mut *executor)
        .await?;
    sqlx::query("SELECT ensure_activity_partition(NOW() + INTERVAL '48 hours')")
        .execute(&mut *executor)
        .await?;
    Ok(())
}

pub fn is_partition_missing_error(err: &(dyn DatabaseError + Send + Sync + 'static)) -> bool {
    err.code()
        .as_deref()
        .is_some_and(|code| code.starts_with("23"))
        && err.message().contains("no partition of relation")
}
