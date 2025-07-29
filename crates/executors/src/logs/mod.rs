use std::{path::PathBuf, sync::Arc};

use async_trait::async_trait;
use enum_dispatch::enum_dispatch;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::msg_store::MsgStore;

use self::{amp::AmpLogNormalizer, gemini::GeminiLogNormalizer};

pub mod amp;
pub mod gemini;
pub mod patch;

#[enum_dispatch]
#[derive(Clone)]
pub enum LogNormalizers {
    AmpLogNormalizer,
    GeminiLogNormalizer,
}

#[enum_dispatch(LogNormalizers)]
pub trait LogNormalizer {
    fn normalize_logs(&self, _raw_logs_event_store: Arc<MsgStore>, _worktree_path: &PathBuf);
}

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
