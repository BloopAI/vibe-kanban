use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct AuthSession {
    pub id: Uuid,
    pub user_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub refresh_token_id: Option<Uuid>,
    pub refresh_token_issued_at: Option<DateTime<Utc>>,
}

impl AuthSession {
    pub fn last_activity_at(&self) -> DateTime<Utc> {
        self.last_used_at.unwrap_or(self.created_at)
    }

    pub fn inactivity_duration(&self, now: DateTime<Utc>) -> Duration {
        now.signed_duration_since(self.last_activity_at())
    }
}
