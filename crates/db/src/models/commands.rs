use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SlashCommand {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: CommandCategory,
    pub examples: Option<Vec<String>>,
    pub source: String,
    pub namespace: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
#[ts(export)]
#[repr(u8)]
pub enum CommandCategory {
    #[ts(rename = "global")]
    Global = 0,
    #[ts(rename = "project")]
    Project = 1,
}