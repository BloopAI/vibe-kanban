use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ApiResponseEnvelope<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
    #[serde(default)]
    pub error_data: Option<serde_json::Value>,
    #[serde(default)]
    pub error_kind: Option<String>,
}

pub mod cursor_bridge_server;
pub mod task_server;
