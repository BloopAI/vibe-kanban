use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Structs compatable with props: https://github.com/MrWangJustToDo/git-diff-view

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct FileDiffDetails {
    file_name: Option<String>,
    file_lang: Option<String>,
    content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Diff {
    old_file: Option<FileDiffDetails>,
    new_file: Option<FileDiffDetails>,
    hunks: Vec<String>,
}
