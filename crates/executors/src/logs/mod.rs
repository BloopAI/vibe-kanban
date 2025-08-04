use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub mod plain_text_processor;
pub mod stderr_processor;
pub mod utils;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NormalizedConversation {
    pub entries: Vec<NormalizedEntry>,
    pub session_id: Option<String>,
    pub executor_type: String,
    pub prompt: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NormalizedEntryType {
    UserMessage,
    AssistantMessage,
    ToolUse {
        tool_name: String,
        action_type: ActionType,
    },
    SystemMessage,
    ErrorMessage,
    Thinking,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NormalizedEntry {
    pub timestamp: Option<String>,
    pub entry_type: NormalizedEntryType,
    pub content: String,
    #[ts(skip)]
    pub metadata: Option<serde_json::Value>,
}

/// Types of tool actions that can be performed
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ActionType {
    FileRead { path: String },
    FileWrite { path: String },
    CommandRun { command: String },
    Search { query: String },
    WebFetch { url: String },
    TaskCreate { description: String },
    PlanPresentation { plan: String },
    Other { description: String },
}
