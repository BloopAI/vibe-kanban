use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

pub const APPROVAL_TIMEOUT_SECONDS: i64 = 36000; // 10 hours

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ApprovalRequest {
    pub id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub tool_call_id: String,
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
            tool_call_id: request.tool_call_id,
            execution_process_id,
            created_at: now,
            timeout_at: now + Duration::seconds(APPROVAL_TIMEOUT_SECONDS),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateApprovalRequest {
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub tool_call_id: String,
}

/// Status of a tool permission request (approve/deny for tool execution).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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

/// A question–answer pair. `answer` holds one or more selected labels/values.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct QuestionAnswer {
    pub question: String,
    pub answer: Vec<String>,
}

/// Status of a question answer request.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum QuestionStatus {
    Answered { answers: Vec<QuestionAnswer> },
    TimedOut,
}

// Tracks both approval and question answers requests
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ApprovalOutcome {
    Approved,
    Denied {
        #[ts(optional)]
        reason: Option<String>,
    },
    Answered {
        answers: Vec<QuestionAnswer>,
    },
    TimedOut,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ApprovalResponse {
    pub execution_process_id: Uuid,
    pub status: ApprovalOutcome,
}
