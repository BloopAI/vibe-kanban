use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    error::TrustedKeyAuthError,
    trusted_keys::{
        TrustedRelayClient, list_trusted_clients, remove_trusted_client, upsert_trusted_client,
    },
};

#[derive(Clone)]
pub struct TrustedKeyAuthRuntime {
    trusted_keys_path: PathBuf,
    pake_enrollments: Arc<RwLock<HashMap<Uuid, PendingPakeEnrollment>>>,
    enrollment_code: Arc<RwLock<Option<String>>>,
    rate_limit_windows: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
    refresh_nonces: Arc<RwLock<HashMap<String, Instant>>>,
}

#[derive(Debug, Clone)]
struct PendingPakeEnrollment {
    shared_key: Vec<u8>,
    created_at: Instant,
}

const PAKE_ENROLLMENT_TTL: Duration = Duration::from_secs(5 * 60);
const REFRESH_NONCE_TTL: Duration = Duration::from_secs(2 * 60);

impl TrustedKeyAuthRuntime {
    pub fn new(trusted_keys_path: PathBuf) -> Self {
        Self {
            trusted_keys_path,
            pake_enrollments: Default::default(),
            enrollment_code: Default::default(),
            rate_limit_windows: Default::default(),
            refresh_nonces: Default::default(),
        }
    }

    pub async fn persist_trusted_client(
        &self,
        client: TrustedRelayClient,
    ) -> Result<bool, TrustedKeyAuthError> {
        upsert_trusted_client(&self.trusted_keys_path, client).await
    }

    pub async fn list_trusted_clients(
        &self,
    ) -> Result<Vec<TrustedRelayClient>, TrustedKeyAuthError> {
        list_trusted_clients(&self.trusted_keys_path).await
    }

    pub async fn remove_trusted_client(
        &self,
        client_id: Uuid,
    ) -> Result<bool, TrustedKeyAuthError> {
        remove_trusted_client(&self.trusted_keys_path, client_id).await
    }

    pub async fn find_trusted_client(
        &self,
        client_id: Uuid,
    ) -> Result<Option<TrustedRelayClient>, TrustedKeyAuthError> {
        let clients = list_trusted_clients(&self.trusted_keys_path).await?;
        Ok(clients
            .into_iter()
            .find(|client| client.client_id == client_id))
    }

    pub async fn store_pake_enrollment(&self, enrollment_id: Uuid, shared_key: Vec<u8>) {
        self.pake_enrollments.write().await.insert(
            enrollment_id,
            PendingPakeEnrollment {
                shared_key,
                created_at: Instant::now(),
            },
        );
    }

    pub async fn take_pake_enrollment(&self, enrollment_id: &Uuid) -> Option<Vec<u8>> {
        let mut enrollments = self.pake_enrollments.write().await;
        let enrollment = enrollments.remove(enrollment_id)?;
        if enrollment.created_at.elapsed() > PAKE_ENROLLMENT_TTL {
            return None;
        }
        Some(enrollment.shared_key)
    }

    pub async fn get_or_set_enrollment_code(&self, new_code: String) -> String {
        let mut enrollment_code = self.enrollment_code.write().await;
        if let Some(existing_code) = enrollment_code.as_ref() {
            return existing_code.clone();
        }

        *enrollment_code = Some(new_code.clone());
        new_code
    }

    pub async fn consume_enrollment_code(&self, enrollment_code: &str) -> bool {
        let mut stored_code = self.enrollment_code.write().await;
        if stored_code.as_deref() != Some(enrollment_code) {
            return false;
        }

        *stored_code = None;
        true
    }

    pub async fn enforce_rate_limit(
        &self,
        bucket: &str,
        max_requests: usize,
        window: Duration,
    ) -> Result<(), TrustedKeyAuthError> {
        let now = Instant::now();
        let mut windows = self.rate_limit_windows.write().await;
        let entry = windows.entry(bucket.to_string()).or_default();
        entry.retain(|timestamp| now.duration_since(*timestamp) <= window);

        if entry.len() >= max_requests {
            return Err(TrustedKeyAuthError::TooManyRequests(
                "Too many requests. Please wait and try again.".to_string(),
            ));
        }

        entry.push(now);
        Ok(())
    }

    pub async fn claim_refresh_nonce(&self, nonce: &str) -> Result<(), TrustedKeyAuthError> {
        let normalized = nonce.trim();
        if normalized.is_empty() || normalized.len() > 128 {
            return Err(TrustedKeyAuthError::Unauthorized);
        }

        let now = Instant::now();
        let mut seen = self.refresh_nonces.write().await;
        seen.retain(|_, inserted_at| now.duration_since(*inserted_at) <= REFRESH_NONCE_TTL);
        if seen.contains_key(normalized) {
            return Err(TrustedKeyAuthError::Unauthorized);
        }

        seen.insert(normalized.to_string(), now);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn claim_refresh_nonce_rejects_replay() {
        let runtime = TrustedKeyAuthRuntime::new(PathBuf::from("/tmp/unused-trusted-keys.json"));
        runtime.claim_refresh_nonce("nonce-1").await.unwrap();

        assert!(runtime.claim_refresh_nonce("nonce-1").await.is_err());
    }

    #[tokio::test]
    async fn claim_refresh_nonce_rejects_blank_values() {
        let runtime = TrustedKeyAuthRuntime::new(PathBuf::from("/tmp/unused-trusted-keys.json"));
        assert!(runtime.claim_refresh_nonce("   ").await.is_err());
    }
}
