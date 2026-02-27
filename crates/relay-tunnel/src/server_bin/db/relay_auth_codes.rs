use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

const RELAY_AUTH_CODE_TTL_SECS: i64 = 30;

pub struct RelayAuthCodeRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> RelayAuthCodeRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Create a one-time relay auth code and return its plaintext value.
    pub async fn create(
        &self,
        host_id: Uuid,
        relay_cookie_value: &str,
    ) -> Result<String, sqlx::Error> {
        let code = Uuid::new_v4().to_string();
        let code_hash = hash_code(&code);
        let expires_at = Utc::now() + Duration::seconds(RELAY_AUTH_CODE_TTL_SECS);

        sqlx::query!(
            r#"
            INSERT INTO relay_auth_codes (code_hash, host_id, relay_cookie_value, expires_at)
            VALUES ($1, $2, $3, $4)
            "#,
            code_hash,
            host_id,
            relay_cookie_value,
            expires_at
        )
        .execute(self.pool)
        .await?;

        Ok(code)
    }

    /// Atomically redeem a code for the expected host.
    pub async fn redeem_for_host(
        &self,
        code: &str,
        expected_host_id: Uuid,
    ) -> Result<Option<String>, sqlx::Error> {
        let code_hash = hash_code(code);

        let redeemed = sqlx::query!(
            r#"
            UPDATE relay_auth_codes
            SET consumed_at = NOW()
            WHERE code_hash = $1
              AND host_id = $2
              AND consumed_at IS NULL
              AND expires_at > NOW()
            RETURNING relay_cookie_value
            "#,
            code_hash,
            expected_host_id
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(redeemed.map(|row| row.relay_cookie_value))
    }
}

fn hash_code(code: &str) -> String {
    let digest = Sha256::digest(code.as_bytes());
    format!("{:x}", digest)
}
