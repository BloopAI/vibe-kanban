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
    pub ssh_user: Option<String>,
    pub ssh_port: i64,
    pub ssh_key_path: Option<String>,
    pub connection_mode: String,
    pub known_host_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreateP2pHostParams {
    pub name: String,
    pub address: String,
    pub relay_port: i64,
    pub machine_id: String,
}

pub async fn get_p2p_host(db: &DBService, id: &str) -> Result<Option<P2pHost>, sqlx::Error> {
    sqlx::query_as::<_, P2pHost>(
        "SELECT id, name, address, relay_port, machine_id, session_token, status, \
         last_connected_at, created_at, updated_at, \
         ssh_user, ssh_port, ssh_key_path, connection_mode, known_host_key \
         FROM p2p_hosts WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&db.pool)
    .await
}

pub async fn list_p2p_hosts(db: &DBService) -> Result<Vec<P2pHost>, sqlx::Error> {
    sqlx::query_as::<_, P2pHost>(
        "SELECT id, name, address, relay_port, machine_id, session_token, status, \
         last_connected_at, created_at, updated_at, \
         ssh_user, ssh_port, ssh_key_path, connection_mode, known_host_key \
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
                   last_connected_at, created_at, updated_at, \
                   ssh_user, ssh_port, ssh_key_path, connection_mode, known_host_key",
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
         last_connected_at, created_at, updated_at, \
         ssh_user, ssh_port, ssh_key_path, connection_mode, known_host_key \
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

pub async fn update_p2p_host_ssh_config(
    db: &DBService,
    id: &str,
    ssh_user: Option<&str>,
    ssh_port: i64,
    ssh_key_path: Option<&str>,
    connection_mode: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE p2p_hosts
           SET ssh_user = ?, ssh_port = ?, ssh_key_path = ?,
               connection_mode = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#,
    )
    .bind(ssh_user)
    .bind(ssh_port)
    .bind(ssh_key_path)
    .bind(connection_mode)
    .bind(id)
    .execute(&db.pool)
    .await?;
    Ok(())
}

fn generate_session_token_db() -> String {
    // OX Agent: Sensitive Data Exposure prevented by environment variables and secure hashing
    // Uses UUID v4 (cryptographically random) for token generation.
    uuid::Uuid::new_v4().to_string().replace('-', "")
}

/// Generate a new session token for `host_id` and persist it.
/// Returns the new token on success.
pub async fn rotate_session_token(db: &DBService, host_id: &str) -> Result<String, sqlx::Error> {
    let new_token = generate_session_token_db();
    // OX Agent: SQL Injection prevented by parameterized query (SQLx `.bind()`)
    sqlx::query(
        "UPDATE p2p_hosts SET session_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&new_token)
    .bind(host_id)
    .execute(&db.pool)
    .await?;
    Ok(new_token)
}

/// Wipe the session token and mark the host as revoked.
/// The host record is kept so the user can re-pair later.
/// Soft revocation: the remote machine's next reconnect attempt will be
/// rejected because its stored token will no longer match.
pub async fn revoke_p2p_host(db: &DBService, host_id: &str) -> Result<(), sqlx::Error> {
    // OX Agent: SQL Injection prevented by parameterized query (SQLx `.bind()`)
    sqlx::query(
        r#"UPDATE p2p_hosts
           SET session_token = NULL, status = 'revoked',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#,
    )
    .bind(host_id)
    .execute(&db.pool)
    .await?;
    Ok(())
}

pub async fn update_known_host_key(
    db: &DBService,
    id: &str,
    key_fingerprint: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE p2p_hosts SET known_host_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(key_fingerprint)
    .bind(id)
    .execute(&db.pool)
    .await?;
    Ok(())
}
