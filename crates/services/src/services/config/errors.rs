use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use super::versions::v2::EditorType;

#[derive(Debug, Clone, Serialize, Deserialize, TS, Error)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case", export)]
pub enum OpenEditorError {
    #[error("IDE CLI command '{cli_command}' not found")]
    IdeCliNotFound {
        editor_type: EditorType,
        cli_command: String,
    },
    #[error("Invalid editor configuration: {message}")]
    InvalidConfig { message: String },
    #[error("IO error: {message}")]
    Io { message: String },
}
