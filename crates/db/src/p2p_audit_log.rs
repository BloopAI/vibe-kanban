use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::DBService;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct P2pAuditEvent {
    pub id: String,
    pub event_type: String,
    pub host_id: Option<String>,
    pub ip_address: Option<String>,
    pub detail: Option<String>,
    pub created_at: DateTime<Utc>,
}

pub mod event {
    pub const PAIRING_CODE_REQUESTED: &str = "pairing_code_requested";
    pub const PAIRING_CODE_CONSUMED: &str = "pairing_code_consumed";
    pub const PAIRING_FAILED: &str = "pairing_failed";
    pub const SSH_PAIR_SUCCESS: &str = "ssh_pair_success";
    pub const SSH_PAIR_FAILED: &str = "ssh_pair_failed";
    pub const HOST_CONNECTED: &str = "host_connected";
    pub const HOST_DISCONNECTED: &str = "host_disconnected";
    pub const SESSION_ROTATED: &str = "session_rotated";
    pub const HOST_REVOKED: &str = "host_revoked";
    pub const AUTH_FAILED: &str = "auth_failed";
}

pub async fn log_event(
    db: &DBService,
    event_type: &str,
    host_id: Option<&str>,
    ip_address: Option<&str>,
    detail: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO p2p_audit_log (event_type, host_id, ip_address, detail)
           VALUES (?, ?, ?, ?)"#,
    )
    .bind(event_type)
    .bind(host_id)
    .bind(ip_address)
    .bind(detail)
    .execute(&db.pool)
    .await?;
    Ok(())
}

pub async fn list_host_events(
    db: &DBService,
    host_id: &str,
    limit: i64,
) -> Result<Vec<P2pAuditEvent>, sqlx::Error> {
    sqlx::query_as::<_, P2pAuditEvent>(
        r#"SELECT id, event_type, host_id, ip_address, detail, created_at
           FROM p2p_audit_log
           WHERE host_id = ?
           ORDER BY created_at DESC
           LIMIT ?"#,
    )
    .bind(host_id)
    .bind(limit)
    .fetch_all(&db.pool)
    .await
}
