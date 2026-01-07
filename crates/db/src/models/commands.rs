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
    pub namespace: Option<String>,
}

// Internal version with source field for server-side use only
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InternalSlashCommand {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: CommandCategory,
    pub examples: Option<Vec<String>>,
    pub source: String,
    pub namespace: Option<String>,
}

impl From<InternalSlashCommand> for SlashCommand {
    fn from(internal: InternalSlashCommand) -> Self {
        SlashCommand {
            id: internal.id,
            name: internal.name,
            description: internal.description,
            category: internal.category,
            examples: internal.examples,
            namespace: internal.namespace,
        }
    }
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
