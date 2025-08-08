use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Structs compatable with props: https://github.com/MrWangJustToDo/git-diff-view

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffDetails {
    pub file_name: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Diff {
    pub old_file: Option<FileDiffDetails>,
    pub new_file: Option<FileDiffDetails>,
    pub hunks: Vec<String>,
}
