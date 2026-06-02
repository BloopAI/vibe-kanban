use axum::{extract::ws::Message, response::sse::Event};
use json_patch::{Patch, PatchOperation};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const EV_STDOUT: &str = "stdout";
pub const EV_STDERR: &str = "stderr";
pub const EV_JSON_PATCH: &str = "json_patch";
pub const EV_SESSION_ID: &str = "session_id";
pub const EV_MESSAGE_ID: &str = "message_id";
pub const EV_READY: &str = "ready";
pub const EV_FINISHED: &str = "finished";

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
            LogMsg::JsonPatch(patch) => EV_JSON_PATCH.len() + patch_approx_bytes(patch) + OVERHEAD,
            LogMsg::SessionId(s) => EV_SESSION_ID.len() + s.len() + OVERHEAD,
            LogMsg::MessageId(s) => EV_MESSAGE_ID.len() + s.len() + OVERHEAD,
            LogMsg::Ready => EV_READY.len() + OVERHEAD,
            LogMsg::Finished => EV_FINISHED.len() + OVERHEAD,
        }
    }

    pub fn json_patch_approx_bytes(patch: &Patch) -> usize {
        patch_approx_bytes(patch)
    }
}

fn patch_approx_bytes(patch: &Patch) -> usize {
    patch.0.iter().map(patch_op_approx_bytes).sum::<usize>() + 2
}

fn patch_op_approx_bytes(op: &PatchOperation) -> usize {
    const OP_OVERHEAD: usize = 32;
    match op {
        PatchOperation::Add(add) => OP_OVERHEAD + add.path.len() + value_approx_bytes(&add.value),
        PatchOperation::Remove(remove) => OP_OVERHEAD + remove.path.len(),
        PatchOperation::Replace(replace) => {
            OP_OVERHEAD + replace.path.len() + value_approx_bytes(&replace.value)
        }
        PatchOperation::Move(move_op) => OP_OVERHEAD + move_op.path.len() + move_op.from.len(),
        PatchOperation::Copy(copy) => OP_OVERHEAD + copy.path.len() + copy.from.len(),
        PatchOperation::Test(test) => {
            OP_OVERHEAD + test.path.len() + value_approx_bytes(&test.value)
        }
    }
}

fn value_approx_bytes(value: &Value) -> usize {
    match value {
        Value::Null => 4,
        Value::Bool(_) => 5,
        Value::Number(n) => n.to_string().len(),
        Value::String(s) => s.len() + 2,
        Value::Array(items) => {
            items.iter().map(value_approx_bytes).sum::<usize>() + items.len() + 2
        }
        Value::Object(map) => {
            map.iter()
                .map(|(key, value)| key.len() + value_approx_bytes(value) + 4)
                .sum::<usize>()
                + map.len()
                + 2
        }
    }
}
