use serde::{Deserialize, Serialize};

use crate::activity::ActivityEvent;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ClientMessage {
    #[serde(rename = "ack")]
    Ack { cursor: i64 },
    #[serde(rename = "auth-token")]
    AuthToken { token: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ServerMessage {
    #[serde(rename = "activity")]
    Activity(ActivityEvent),
    #[serde(rename = "error")]
    Error { message: String },
}
