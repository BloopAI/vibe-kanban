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
pub enum CommandCategory {
    #[ts(rename = "global")]
    Global,
    #[ts(rename = "project")]
    Project,
}