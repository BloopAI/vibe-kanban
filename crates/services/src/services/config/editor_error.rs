use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, Error)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum EditorOpenError {
    #[error("Editor executable '{executable}' not found in PATH")]
    ExecutableNotFound {
        executable: String,
        editor_type: String,
    },
}
