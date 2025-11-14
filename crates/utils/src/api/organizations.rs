use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Type;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[sqlx(type_name = "member_role", rename_all = "lowercase")]
#[ts(export)]
#[ts(use_ts_enum)]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MemberRole {
    Admin,
    Member,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[sqlx(type_name = "invitation_status", rename_all = "lowercase")]
#[ts(use_ts_enum)]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InvitationStatus {
    Pending,
    Accepted,
    Declined,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub is_personal: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct OrganizationWithRole {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub is_personal: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub user_role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ListOrganizationsResponse {
    pub organizations: Vec<OrganizationWithRole>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GetOrganizationResponse {
    pub organization: Organization,
    pub user_role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateOrganizationRequest {
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateOrganizationResponse {
    pub organization: OrganizationWithRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateOrganizationRequest {
    pub name: String,
}

// Invitation types

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Invitation {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub invited_by_user_id: Option<Uuid>,
    pub email: String,
    pub role: MemberRole,
    pub status: InvitationStatus,
    pub token: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateInvitationRequest {
    pub email: String,
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateInvitationResponse {
    pub invitation: Invitation,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ListInvitationsResponse {
    pub invitations: Vec<Invitation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GetInvitationResponse {
    pub id: Uuid,
    pub organization_slug: String,
    pub role: MemberRole,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AcceptInvitationResponse {
    pub organization_id: String,
    pub organization_slug: String,
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RevokeInvitationRequest {
    pub invitation_id: Uuid,
}

// Member types

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct OrganizationMember {
    pub user_id: Uuid,
    pub role: MemberRole,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct OrganizationMemberWithProfile {
    pub user_id: Uuid,
    pub role: MemberRole,
    pub joined_at: DateTime<Utc>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ListMembersResponse {
    pub members: Vec<OrganizationMemberWithProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateMemberRoleRequest {
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateMemberRoleResponse {
    pub user_id: Uuid,
    pub role: MemberRole,
}
