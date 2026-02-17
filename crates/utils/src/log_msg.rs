use axum::{extract::ws::Message, response::sse::Event};
use json_patch::Patch;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const EV_STDOUT: &str = "stdout";
pub const EV_STDERR: &str = "stderr";
pub const EV_JSON_PATCH: &str = "json_patch";
pub const EV_SESSION_ID: &str = "session_id";
pub const EV_MESSAGE_ID: &str = "message_id";
pub const EV_READY: &str = "ready";
pub const EV_FINISHED: &str = "finished";

/// Estimate the serialized JSON byte length of a `serde_json::Value` by
/// walking the tree. No allocation, no serde — just arithmetic.
fn value_json_len(v: &Value) -> usize {
    match v {
        Value::Null => 4,                           // null
        Value::Bool(true) => 4,                     // true
        Value::Bool(false) => 5,                    // false
        Value::Number(_) => 20, // i64 ≤ 20 digits, f64 via ryu ≤ 24; 20 is close enough
        Value::String(s) => {
            // 2 for quotes + content length. JSON escaping can only make it
            // longer, so this is a lower bound — good enough for budget sizing.
            2 + s.len()
        }
        Value::Array(arr) => {
            // [elem,elem,...] → 2 brackets + separating commas
            let inner: usize = arr.iter().map(value_json_len).sum();
            let commas = arr.len().saturating_sub(1);
            2 + inner + commas
        }
        Value::Object(map) => {
            // {"key":val,"key":val} → 2 braces + per-entry: 2 key quotes + colon + comma
            let inner: usize = map
                .iter()
                .map(|(k, v)| k.len() + 2 + 1 + value_json_len(v)) // "key":value
                .sum();
            let commas = map.len().saturating_sub(1);
            2 + inner + commas
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LogMsg {
    Stdout(String),
    Stderr(String),
    JsonPatch(Patch),
    SessionId(String),
    MessageId(String),
    Ready,
    Finished,
}

impl LogMsg {
    pub fn name(&self) -> &'static str {
        match self {
            LogMsg::Stdout(_) => EV_STDOUT,
            LogMsg::Stderr(_) => EV_STDERR,
            LogMsg::JsonPatch(_) => EV_JSON_PATCH,
            LogMsg::SessionId(_) => EV_SESSION_ID,
            LogMsg::MessageId(_) => EV_MESSAGE_ID,
            LogMsg::Ready => EV_READY,
            LogMsg::Finished => EV_FINISHED,
        }
    }

    pub fn to_sse_event(&self) -> Event {
        match self {
            LogMsg::Stdout(s) => Event::default().event(EV_STDOUT).data(s.clone()),
            LogMsg::Stderr(s) => Event::default().event(EV_STDERR).data(s.clone()),
            LogMsg::JsonPatch(patch) => {
                let data = serde_json::to_string(patch).unwrap_or_else(|_| "[]".to_string());
                Event::default().event(EV_JSON_PATCH).data(data)
            }
            LogMsg::SessionId(s) => Event::default().event(EV_SESSION_ID).data(s.clone()),
            LogMsg::MessageId(s) => Event::default().event(EV_MESSAGE_ID).data(s.clone()),
            LogMsg::Ready => Event::default().event(EV_READY).data(""),
            LogMsg::Finished => Event::default().event(EV_FINISHED).data(""),
        }
    }

    /// Convert LogMsg to WebSocket message with proper error handling
    pub fn to_ws_message(&self) -> Result<Message, serde_json::Error> {
        let json = serde_json::to_string(self)?;
        Ok(Message::Text(json.into()))
    }

    /// Convert LogMsg to WebSocket message with fallback error handling
    ///
    /// This method mirrors the behavior of the original logmsg_to_ws function
    /// but with better error handling than unwrap().
    pub fn to_ws_message_unchecked(&self) -> Message {
        // Finished and Ready use special JSON formats for frontend compatibility
        let json = match self {
            LogMsg::Ready => r#"{"Ready":true}"#.to_string(),
            LogMsg::Finished => r#"{"finished":true}"#.to_string(),
            _ => serde_json::to_string(self)
                .unwrap_or_else(|_| r#"{"error":"serialization_failed"}"#.to_string()),
        };

        Message::Text(json.into())
    }

    /// Rough size accounting for your byte‑budgeted history.
    pub fn approx_bytes(&self) -> usize {
        const OVERHEAD: usize = 8;
        match self {
            LogMsg::Stdout(s) => EV_STDOUT.len() + s.len() + OVERHEAD,
            LogMsg::Stderr(s) => EV_STDERR.len() + s.len() + OVERHEAD,
            LogMsg::JsonPatch(patch) => {
                // Walk the Value tree in each op to estimate size without serializing.
                // Per-op overhead: {"op":"add","path":"/entries/N","value":} ≈ 50 bytes.
                let ops_bytes: usize = patch.0.iter().map(|op| {
                    let val_len = match op {
                        json_patch::PatchOperation::Add(o) => value_json_len(&o.value),
                        json_patch::PatchOperation::Replace(o) => value_json_len(&o.value),
                        json_patch::PatchOperation::Remove(_) => 0,
                        json_patch::PatchOperation::Move(_) => 0,
                        json_patch::PatchOperation::Copy(_) => 0,
                        json_patch::PatchOperation::Test(o) => value_json_len(&o.value),
                    };
                    50 + val_len
                }).sum();
                EV_JSON_PATCH.len() + ops_bytes.max(2) + OVERHEAD
            }
            LogMsg::SessionId(s) => EV_SESSION_ID.len() + s.len() + OVERHEAD,
            LogMsg::MessageId(s) => EV_MESSAGE_ID.len() + s.len() + OVERHEAD,
            LogMsg::Ready => EV_READY.len() + OVERHEAD,
            LogMsg::Finished => EV_FINISHED.len() + OVERHEAD,
        }
    }
}
