use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MigrationRequest {
    pub organization_id: Uuid,
    /// List of local project IDs to migrate.
    pub project_ids: Vec<Uuid>,
}

impl MigrationRequest {
    /// Returns the set of project IDs to migrate.
    pub fn project_id_set(&self) -> HashSet<Uuid> {
        self.project_ids.iter().copied().collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MigrationResponse {
    pub report: MigrationReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
pub struct MigrationReport {
    pub projects: EntityReport,
    pub tasks: EntityReport,
    pub pr_merges: EntityReport,
    pub workspaces: EntityReport,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
pub struct EntityReport {
    pub total: usize,
    pub migrated: usize,
    pub failed: usize,
    pub skipped: usize,
    pub errors: Vec<EntityError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct EntityError {
    pub local_id: Uuid,
    pub error: String,
}
