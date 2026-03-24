//! Background service that periodically syncs new Linear issues into vibe-kanban
//! for all active connections. This ensures issues created in Linear are imported
//! even when no webhook is registered (e.g. local dev).

use std::time::Duration;

use sqlx::PgPool;
use tokio::time::interval;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::linear::{crypto, db, import};

const POLL_INTERVAL_SECS: u64 = 60;

pub fn spawn(pool: PgPool, http_client: reqwest::Client, encryption_key_hex: Option<String>) {
    let key_hex = match encryption_key_hex {
        Some(k) if !k.is_empty() => k,
        _ => {
            warn!("Linear sync service disabled: no encryption key configured");
            return;
        }
    };

    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(POLL_INTERVAL_SECS));
        ticker.tick().await; // skip immediate first tick

        loop {
            ticker.tick().await;
            run_once(&pool, &http_client, &key_hex).await;
        }
    });
}

async fn run_once(pool: &PgPool, http_client: &reqwest::Client, key_hex: &str) {
    let connections = match db::list_all_active_connections(pool).await {
        Ok(c) => c,
        Err(e) => {
            warn!(?e, "Failed to list active Linear connections for sync");
            return;
        }
    };

    if connections.is_empty() {
        debug!("No active Linear connections to sync");
        return;
    }

    debug!("{} active Linear connection(s) to sync", connections.len());

    for conn in connections {
        let api_key = match crypto::decrypt(key_hex, &conn.encrypted_api_key) {
            Ok(k) => k,
            Err(e) => {
                warn!(?e, connection_id = %conn.id, "Failed to decrypt Linear API key");
                continue;
            }
        };

        let fallback_status_id = match db::fetch_fallback_status_id(pool, conn.project_id)
            .await
            .ok()
            .flatten()
        {
            Some(id) => id,
            None => {
                warn!(connection_id = %conn.id, "No fallback status for project, skipping sync");
                continue;
            }
        };

        let creator_user_id = match sqlx::query_scalar!(
            r#"SELECT om.user_id AS "user_id!: Uuid"
            FROM projects p
            JOIN organization_member_metadata om ON om.organization_id = p.organization_id
            WHERE p.id = $1
            LIMIT 1"#,
            conn.project_id
        )
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        {
            Some(id) => id,
            None => {
                warn!(connection_id = %conn.id, "No org member found for project, skipping sync");
                continue;
            }
        };

        let ctx = import::ImportContext {
            pool: pool.clone(),
            http_client: http_client.clone(),
            connection_id: conn.id,
            project_id: conn.project_id,
            linear_team_id: conn.linear_team_id.clone(),
            linear_project_id: conn.linear_project_id.clone(),
            api_key: api_key.clone(),
            fallback_status_id,
            creator_user_id,
        };

        match import::run_initial_import(ctx).await {
            Ok(()) => {
                info!(connection_id = %conn.id, "Linear periodic sync complete");
            }
            Err(e) => {
                error!(?e, connection_id = %conn.id, "Linear periodic sync failed");
            }
        }
    }
}
