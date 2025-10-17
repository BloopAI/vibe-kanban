use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

pub const APPROVAL_TIMEOUT_SECONDS: i64 = 3600; // 1 hour
pub const EXIT_PLAN_MODE_TOOL_NAME: &str = "ExitPlanMode";

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ApprovalRequest {
    pub id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub session_id: String,
    pub tool_call_id: Option<String>,
    pub execution_process_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub timeout_at: DateTime<Utc>,
}

impl ApprovalRequest {
    pub fn from_create(request: CreateApprovalRequest, execution_process_id: Uuid) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            tool_name: request.tool_name,
            tool_input: request.tool_input,
            session_id: request.session_id,
            tool_call_id: request.tool_call_id,
            execution_process_id,
            created_at: now,
            timeout_at: now + Duration::seconds(APPROVAL_TIMEOUT_SECONDS),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateApprovalRequest {
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub session_id: String,
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied {
        #[ts(optional)]
        reason: Option<String>,
    },
    TimedOut,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ApprovalResponse {
    pub execution_process_id: Uuid,
    pub status: ApprovalStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ApprovalPendingInfo {
    pub approval_id: String,
    pub execution_process_id: Uuid,
    pub tool_name: String,
    pub requested_at: DateTime<Utc>,
    pub timeout_at: DateTime<Utc>,
}
