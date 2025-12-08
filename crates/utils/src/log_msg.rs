use axum::{extract::ws::Message, response::sse::Event};
use json_patch::Patch;
use serde::{Deserialize, Serialize};

pub const EV_STDOUT: &str = "stdout";
pub const EV_STDERR: &str = "stderr";
pub const EV_JSON_PATCH: &str = "json_patch";
pub const EV_SESSION_ID: &str = "session_id";
pub const EV_FINISHED: &str = "finished";
pub const EV_REFRESH_REQUIRED: &str = "refresh_required";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LogMsg {
    Stdout(String),
    Stderr(String),
    JsonPatch(Patch),
    SessionId(String),
    Finished,
    RefreshRequired { reason: String },
}

impl LogMsg {
    pub fn name(&self) -> &'static str {
        match self {
            LogMsg::Stdout(_) => EV_STDOUT,
            LogMsg::Stderr(_) => EV_STDERR,
            LogMsg::JsonPatch(_) => EV_JSON_PATCH,
            LogMsg::SessionId(_) => EV_SESSION_ID,
            LogMsg::Finished => EV_FINISHED,
            LogMsg::RefreshRequired { .. } => EV_REFRESH_REQUIRED,
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
            LogMsg::RefreshRequired { reason } => Event::default()
                .event(EV_REFRESH_REQUIRED)
                .data(reason.clone()),
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
        let json = match self {
            // Finished becomes JSON {finished: true}
            LogMsg::Finished => r#"{"finished":true}"#.to_string(),
            // RefreshRequired becomes JSON {refresh_required: true, reason: "..."}
            LogMsg::RefreshRequired { reason } => {
                format!(
                    r#"{{"refresh_required":true,"reason":"{}"}}"#,
                    reason.replace('"', "\\\"")
                )
            }
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
                let json_len = serde_json::to_string(patch).map(|s| s.len()).unwrap_or(2);
                EV_JSON_PATCH.len() + json_len + OVERHEAD
            }
            LogMsg::SessionId(s) => EV_SESSION_ID.len() + s.len() + OVERHEAD,
            LogMsg::Finished => EV_FINISHED.len() + OVERHEAD,
            LogMsg::RefreshRequired { reason } => {
                EV_REFRESH_REQUIRED.len() + reason.len() + OVERHEAD
            }
        }
    }
}
