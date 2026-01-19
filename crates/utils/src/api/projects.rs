use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::organizations::OrganizationMemberWithProfile;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RemoteProject {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub color: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListProjectsResponse {
    pub projects: Vec<RemoteProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RemoteProjectMembersResponse {
    pub organization_id: Uuid,
    pub members: Vec<OrganizationMemberWithProfile>,
}
