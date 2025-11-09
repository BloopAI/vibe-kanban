use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

pub const QUESTION_TIMEOUT_SECONDS: i64 = 3600; // 1 hour

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UserQuestionRequest {
    pub id: String,
    pub question: String,
    pub options: Vec<String>,
    pub allow_multiple: bool,
    pub allow_other: bool,
    pub execution_process_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub timeout_at: DateTime<Utc>,
}

impl UserQuestionRequest {
    pub fn new(
        question: String,
        options: Vec<String>,
        allow_multiple: bool,
        allow_other: bool,
        execution_process_id: Uuid,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            question,
            options,
            allow_multiple,
            allow_other,
            execution_process_id,
            created_at: now,
            timeout_at: now + Duration::seconds(QUESTION_TIMEOUT_SECONDS),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum QuestionResponseStatus {
    Pending,
    Answered {
        selected_options: Vec<String>,
        #[ts(optional)]
        other_text: Option<String>,
    },
    TimedOut,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct QuestionResponse {
    pub execution_process_id: Uuid,
    pub status: QuestionResponseStatus,
}
