use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

pub const APPROVAL_TIMEOUT_SECONDS: i64 = 3600; // 1 hour

/// Individual option within a question for AskUserQuestion
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct QuestionOption {
    pub label: String,
    pub description: String,
}

/// Single question with header, options, and multiSelect flag for AskUserQuestion
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Question {
    pub question: String,
    pub header: String,
    #[serde(rename = "multiSelect")]
    pub multi_select: bool,
    pub options: Vec<QuestionOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ApprovalRequest {
    pub id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub tool_call_id: String,
    pub execution_process_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub timeout_at: DateTime<Utc>,
    /// Optional questions for AskUserQuestion requests
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub questions: Option<Vec<Question>>,
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
            questions: None,
        }
    }

    /// Create an approval request for AskUserQuestion with questions
    pub fn from_questions(
        questions: Vec<Question>,
        tool_call_id: String,
        execution_process_id: Uuid,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            tool_name: "AskUserQuestion".to_string(),
            tool_input: serde_json::json!({ "questions": questions }),
            tool_call_id,
            execution_process_id,
            created_at: now,
            timeout_at: now + Duration::seconds(APPROVAL_TIMEOUT_SECONDS),
            questions: Some(questions),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateApprovalRequest {
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub tool_call_id: String,
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
    /// Optional answers for AskUserQuestion responses (header -> answer)
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answers: Option<HashMap<String, String>>,
}
