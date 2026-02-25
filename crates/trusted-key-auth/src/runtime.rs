use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct TrustedKeyAuthRuntime {
    pake_enrollments: Arc<RwLock<HashMap<Uuid, PendingPakeEnrollment>>>,
    enrollment_code: Arc<RwLock<Option<String>>>,
    rate_limit_windows: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
}

#[derive(Debug, Clone)]
struct PendingPakeEnrollment {
    shared_key: Vec<u8>,
    created_at: Instant,
}

const PAKE_ENROLLMENT_TTL: Duration = Duration::from_secs(5 * 60);

impl TrustedKeyAuthRuntime {
    pub fn new() -> Self {
        Self::default()
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

    pub async fn allow_rate_limited_action(
        &self,
        bucket: &str,
        max_requests: usize,
        window: Duration,
    ) -> bool {
        let now = Instant::now();
        let mut windows = self.rate_limit_windows.write().await;
        let entry = windows.entry(bucket.to_string()).or_default();
        entry.retain(|timestamp| now.duration_since(*timestamp) <= window);

        if entry.len() >= max_requests {
            return false;
        }

        entry.push(now);
        true
    }
}
