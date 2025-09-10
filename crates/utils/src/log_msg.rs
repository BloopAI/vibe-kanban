use axum::response::sse::Event;
use json_patch::Patch;
use serde::{Deserialize, Serialize};

pub const EV_STDOUT: &str = "stdout";
pub const EV_STDERR: &str = "stderr";
pub const EV_JSON_PATCH: &str = "json_patch";
pub const EV_SESSION_ID: &str = "session_id";
pub const EV_FINISHED: &str = "finished";
pub const EV_APPROVAL_REQUEST: &str = "approval_request";
pub const EV_APPROVAL_RESPONSE: &str = "approval_response";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LogMsg {
    Stdout(String),
    Stderr(String),
    JsonPatch(Patch),
    SessionId(String),
    Finished,
    ApprovalRequest(serde_json::Value),
    ApprovalResponse(serde_json::Value),
}

impl LogMsg {
    pub fn name(&self) -> &'static str {
        match self {
            LogMsg::Stdout(_) => EV_STDOUT,
            LogMsg::Stderr(_) => EV_STDERR,
            LogMsg::JsonPatch(_) => EV_JSON_PATCH,
            LogMsg::SessionId(_) => EV_SESSION_ID,
            LogMsg::Finished => EV_FINISHED,
            LogMsg::ApprovalRequest(_) => EV_APPROVAL_REQUEST,
            LogMsg::ApprovalResponse(_) => EV_APPROVAL_RESPONSE,
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
            LogMsg::Finished => Event::default().event(EV_FINISHED).data(""),
            LogMsg::ApprovalRequest(req) => {
                let data = serde_json::to_string(req).unwrap_or_else(|_| "{}".to_string());
                Event::default().event(EV_APPROVAL_REQUEST).data(data)
            }
            LogMsg::ApprovalResponse(resp) => {
                let data = serde_json::to_string(resp).unwrap_or_else(|_| "{}".to_string());
                Event::default().event(EV_APPROVAL_RESPONSE).data(data)
            }
        }
    }

    /// Rough size accounting for your byte‑budgeted history.
    pub fn approx_bytes(&self) -> usize {
        const OVERHEAD: usize = 8;
        match self {
            LogMsg::Stdout(s) => EV_STDOUT.len() + s.len() + OVERHEAD,
            LogMsg::Stderr(s) => EV_STDERR.len() + s.len() + OVERHEAD,
            LogMsg::JsonPatch(patch) => {
                let json_len = serde_json::to_string(patch).map(|s| s.len()).unwrap_or(2);
                EV_JSON_PATCH.len() + json_len + OVERHEAD
            }
            LogMsg::SessionId(s) => EV_SESSION_ID.len() + s.len() + OVERHEAD,
            LogMsg::Finished => EV_FINISHED.len() + OVERHEAD,
            LogMsg::ApprovalRequest(req) => {
                let json_len = serde_json::to_string(req).map(|s| s.len()).unwrap_or(2);
                EV_APPROVAL_REQUEST.len() + json_len + OVERHEAD
            }
            LogMsg::ApprovalResponse(resp) => {
                let json_len = serde_json::to_string(resp).map(|s| s.len()).unwrap_or(2);
                EV_APPROVAL_RESPONSE.len() + json_len + OVERHEAD
            }
        }
    }
}
