use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::DBService;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct P2pHost {
    pub id: String,
    pub name: String,
    pub address: String,
    pub relay_port: i64,
    pub machine_id: String,
    pub session_token: Option<String>,
    pub status: String,
    pub last_connected_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CreateP2pHostParams {
    pub name: String,
    pub address: String,
    pub relay_port: i64,
    pub machine_id: String,
}

pub async fn list_p2p_hosts(db: &DBService) -> Result<Vec<P2pHost>, sqlx::Error> {
    sqlx::query_as::<_, P2pHost>(
        "SELECT id, name, address, relay_port, machine_id, session_token, status, \
         last_connected_at, created_at, updated_at \
         FROM p2p_hosts ORDER BY created_at DESC",
    )
    .fetch_all(&db.pool)
    .await
}

pub async fn create_p2p_host(
    db: &DBService,
    p: CreateP2pHostParams,
) -> Result<P2pHost, sqlx::Error> {
    sqlx::query_as::<_, P2pHost>(
        "INSERT INTO p2p_hosts (name, address, relay_port, machine_id) \
         VALUES (?, ?, ?, ?) \
         RETURNING id, name, address, relay_port, machine_id, session_token, status, \
                   last_connected_at, created_at, updated_at",
    )
    .bind(&p.name)
    .bind(&p.address)
    .bind(p.relay_port)
    .bind(&p.machine_id)
    .fetch_one(&db.pool)
    .await
}

pub async fn delete_p2p_host(db: &DBService, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM p2p_hosts WHERE id = ?")
        .bind(id)
        .execute(&db.pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn update_p2p_host_paired(
    db: &DBService,
    id: &str,
    session_token: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE p2p_hosts \
         SET session_token = ?, status = 'paired', updated_at = datetime('now', 'subsec') \
         WHERE id = ?",
    )
    .bind(session_token)
    .bind(id)
    .execute(&db.pool)
    .await?;
    Ok(())
}

pub async fn list_paired_hosts(db: &DBService) -> Result<Vec<P2pHost>, sqlx::Error> {
    sqlx::query_as::<_, P2pHost>(
        "SELECT id, name, address, relay_port, machine_id, session_token, status, \
         last_connected_at, created_at, updated_at \
         FROM p2p_hosts WHERE status = 'paired' AND session_token IS NOT NULL ORDER BY created_at DESC",
    )
    .fetch_all(&db.pool)
    .await
}

/// Count pairing attempts from `ip` within the last `window_minutes` minutes.
/// The cutoff timestamp is computed in Rust and passed as a bound parameter,
/// so no dynamic SQL is generated.
pub async fn count_recent_pairing_attempts(
    db: &DBService,
    ip: &str,
    window_minutes: i64,
) -> Result<i64, sqlx::Error> {
    let cutoff: DateTime<Utc> = Utc::now() - Duration::minutes(window_minutes);
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM p2p_pairing_attempts \
         WHERE ip_address = ? AND attempted_at >= ?",
    )
    .bind(ip)
    .bind(cutoff)
    .fetch_one(&db.pool)
    .await?;
    Ok(row.0)
}

pub async fn record_pairing_attempt(
    db: &DBService,
    ip: &str,
    succeeded: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO p2p_pairing_attempts (ip_address, succeeded) VALUES (?, ?)")
        .bind(ip)
        .bind(succeeded as i64)
        .execute(&db.pool)
        .await?;
    Ok(())
}
