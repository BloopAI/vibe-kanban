use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use std::str::FromStr;
use ts_rs::TS;
use uuid::Uuid;

/// Team member roles with increasing permissions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum TeamMemberRole {
    /// Can view issues and documents
    Viewer,
    /// Can create/edit issues, comment, update status
    Contributor,
    /// Can manage issues, docs, assign tasks
    Maintainer,
    /// Full control: manage roles, invite/remove members, team settings
    Owner,
}

impl Default for TeamMemberRole {
    fn default() -> Self {
        Self::Contributor
    }
}

impl std::fmt::Display for TeamMemberRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Viewer => write!(f, "viewer"),
            Self::Contributor => write!(f, "contributor"),
            Self::Maintainer => write!(f, "maintainer"),
            Self::Owner => write!(f, "owner"),
        }
    }
}

impl FromStr for TeamMemberRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "viewer" => Ok(Self::Viewer),
            "contributor" => Ok(Self::Contributor),
            "maintainer" => Ok(Self::Maintainer),
            "owner" => Ok(Self::Owner),
            _ => Err(format!("Unknown role: {}", s)),
        }
    }
}

/// Invitation status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum TeamInvitationStatus {
    Pending,
    Accepted,
    Declined,
    Expired,
}

impl Default for TeamInvitationStatus {
    fn default() -> Self {
        Self::Pending
    }
}

impl std::fmt::Display for TeamInvitationStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Accepted => write!(f, "accepted"),
            Self::Declined => write!(f, "declined"),
            Self::Expired => write!(f, "expired"),
        }
    }
}

impl FromStr for TeamInvitationStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "pending" => Ok(Self::Pending),
            "accepted" => Ok(Self::Accepted),
            "declined" => Ok(Self::Declined),
            "expired" => Ok(Self::Expired),
            _ => Err(format!("Unknown status: {}", s)),
        }
    }
}

/// A team member with their role
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TeamMember {
    pub id: Uuid,
    pub team_id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub role: TeamMemberRole,
    pub invited_by: Option<Uuid>,
    /// Clerk user ID for integration
    pub clerk_user_id: Option<String>,
    /// Avatar URL from Clerk
    pub avatar_url: Option<String>,
    /// Number of tasks assigned to this member
    #[serde(default)]
    pub assigned_task_count: i32,
    #[ts(type = "Date")]
    pub joined_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Request to create a team member directly (without invitation)
#[derive(Debug, Deserialize, TS)]
pub struct CreateTeamMember {
    pub email: String,
    pub display_name: Option<String>,
    pub role: Option<TeamMemberRole>,
    pub clerk_user_id: Option<String>,
    pub avatar_url: Option<String>,
}

/// Request to sync a Clerk user as team member
#[derive(Debug, Deserialize, TS)]
pub struct SyncClerkMember {
    pub clerk_user_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

/// Request to update a team member's role
#[derive(Debug, Deserialize, TS)]
pub struct UpdateTeamMemberRole {
    pub role: TeamMemberRole,
}

/// A pending team invitation
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TeamInvitation {
    pub id: Uuid,
    pub team_id: Uuid,
    pub email: String,
    pub role: TeamMemberRole,
    pub status: TeamInvitationStatus,
    pub invited_by: Option<Uuid>,
    /// Unique token for shareable invite link
    pub token: Option<String>,
    #[ts(type = "Date")]
    pub expires_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

/// Invitation with team name for display
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TeamInvitationWithTeam {
    #[serde(flatten)]
    pub invitation: TeamInvitation,
    pub team_name: String,
}

/// Request to create a team invitation
#[derive(Debug, Deserialize, TS)]
pub struct CreateTeamInvitation {
    pub email: String,
    pub role: Option<TeamMemberRole>,
}

/// Request to update a team invitation's role
#[derive(Debug, Deserialize, TS)]
pub struct UpdateTeamInvitation {
    pub role: TeamMemberRole,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct TeamMemberRow {
    id: Uuid,
    team_id: Uuid,
    email: String,
    display_name: Option<String>,
    role: String,
    invited_by: Option<Uuid>,
    clerk_user_id: Option<String>,
    avatar_url: Option<String>,
    joined_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

// Helper struct for rows with task count
#[derive(FromRow)]
struct TeamMemberWithCountRow {
    id: Uuid,
    team_id: Uuid,
    email: String,
    display_name: Option<String>,
    role: String,
    invited_by: Option<Uuid>,
    clerk_user_id: Option<String>,
    avatar_url: Option<String>,
    assigned_task_count: i32,
    joined_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<TeamMemberRow> for TeamMember {
    fn from(row: TeamMemberRow) -> Self {
        Self {
            id: row.id,
            team_id: row.team_id,
            email: row.email,
            display_name: row.display_name,
            role: TeamMemberRole::from_str(&row.role).unwrap_or_default(),
            invited_by: row.invited_by,
            clerk_user_id: row.clerk_user_id,
            avatar_url: row.avatar_url,
            assigned_task_count: 0,
            joined_at: row.joined_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl From<TeamMemberWithCountRow> for TeamMember {
    fn from(row: TeamMemberWithCountRow) -> Self {
        Self {
            id: row.id,
            team_id: row.team_id,
            email: row.email,
            display_name: row.display_name,
            role: TeamMemberRole::from_str(&row.role).unwrap_or_default(),
            invited_by: row.invited_by,
            clerk_user_id: row.clerk_user_id,
            avatar_url: row.avatar_url,
            assigned_task_count: row.assigned_task_count,
            joined_at: row.joined_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(FromRow)]
struct TeamInvitationRow {
    id: Uuid,
    team_id: Uuid,
    email: String,
    role: String,
    status: String,
    invited_by: Option<Uuid>,
    token: Option<String>,
    expires_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
}

impl From<TeamInvitationRow> for TeamInvitation {
    fn from(row: TeamInvitationRow) -> Self {
        Self {
            id: row.id,
            team_id: row.team_id,
            email: row.email,
            role: TeamMemberRole::from_str(&row.role).unwrap_or_default(),
            status: TeamInvitationStatus::from_str(&row.status).unwrap_or_default(),
            invited_by: row.invited_by,
            token: row.token,
            expires_at: row.expires_at,
            created_at: row.created_at,
        }
    }
}

impl TeamMember {
    /// Get all members of a team with task counts
    pub async fn find_by_team(pool: &PgPool, team_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            TeamMemberWithCountRow,
            r#"SELECT m.id as "id!: Uuid",
                      m.team_id as "team_id!: Uuid",
                      m.email,
                      m.display_name,
                      m.role,
                      m.invited_by as "invited_by: Uuid",
                      m.clerk_user_id,
                      m.avatar_url,
                      COALESCE(COUNT(t.id), 0) as "assigned_task_count!: i32",
                      m.joined_at as "joined_at!: DateTime<Utc>",
                      m.created_at as "created_at!: DateTime<Utc>",
                      m.updated_at as "updated_at!: DateTime<Utc>"
               FROM team_members m
               LEFT JOIN tasks t ON t.assignee_id = m.id
               WHERE m.team_id = $1
               GROUP BY m.id
               ORDER BY
                   CASE m.role
                       WHEN 'owner' THEN 1
                       WHEN 'maintainer' THEN 2
                       WHEN 'contributor' THEN 3
                       WHEN 'viewer' THEN 4
                   END,
                   m.display_name ASC, m.email ASC"#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Find a member by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            TeamMemberRow,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      email,
                      display_name,
                      role,
                      invited_by as "invited_by: Uuid",
                      clerk_user_id,
                      avatar_url,
                      joined_at as "joined_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM team_members
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find a member by team and email
    pub async fn find_by_team_and_email(
        pool: &PgPool,
        team_id: Uuid,
        email: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            TeamMemberRow,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      email,
                      display_name,
                      role,
                      invited_by as "invited_by: Uuid",
                      clerk_user_id,
                      avatar_url,
                      joined_at as "joined_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM team_members
               WHERE team_id = $1 AND email = $2"#,
            team_id,
            email
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Create a new team member
    pub async fn create(
        pool: &PgPool,
        team_id: Uuid,
        data: &CreateTeamMember,
        invited_by: Option<Uuid>,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let role = data.role.unwrap_or_default().to_string();

        let row = sqlx::query_as!(
            TeamMemberRow,
            r#"INSERT INTO team_members (id, team_id, email, display_name, role, invited_by, clerk_user_id, avatar_url)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         email,
                         display_name,
                         role,
                         invited_by as "invited_by: Uuid",
                         clerk_user_id,
                         avatar_url,
                         joined_at as "joined_at!: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            team_id,
            data.email,
            data.display_name,
            role,
            invited_by,
            data.clerk_user_id,
            data.avatar_url
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Update a member's role
    pub async fn update_role(
        pool: &PgPool,
        id: Uuid,
        new_role: TeamMemberRole,
    ) -> Result<Self, sqlx::Error> {
        let role_str = new_role.to_string();

        let row = sqlx::query_as!(
            TeamMemberRow,
            r#"UPDATE team_members
               SET role = $2, updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         email,
                         display_name,
                         role,
                         invited_by as "invited_by: Uuid",
                         clerk_user_id,
                         avatar_url,
                         joined_at as "joined_at!: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            role_str
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Find a member by Clerk user ID
    pub async fn find_by_clerk_id(
        pool: &PgPool,
        team_id: Uuid,
        clerk_user_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            TeamMemberRow,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      email,
                      display_name,
                      role,
                      invited_by as "invited_by: Uuid",
                      clerk_user_id,
                      avatar_url,
                      joined_at as "joined_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM team_members
               WHERE team_id = $1 AND clerk_user_id = $2"#,
            team_id,
            clerk_user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Upsert a member from Clerk user data
    /// If member exists (by clerk_user_id or email), update their data
    /// If not, create a new member
    pub async fn upsert_from_clerk(
        pool: &PgPool,
        team_id: Uuid,
        data: &SyncClerkMember,
    ) -> Result<Self, sqlx::Error> {
        // First try to find by clerk_user_id
        if let Some(existing) = Self::find_by_clerk_id(pool, team_id, &data.clerk_user_id).await? {
            // Update existing member with latest Clerk data
            let row = sqlx::query_as!(
                TeamMemberRow,
                r#"UPDATE team_members
                   SET display_name = $2, avatar_url = $3, email = $4, updated_at = NOW()
                   WHERE id = $1
                   RETURNING id as "id!: Uuid",
                             team_id as "team_id!: Uuid",
                             email,
                             display_name,
                             role,
                             invited_by as "invited_by: Uuid",
                             clerk_user_id,
                             avatar_url,
                             joined_at as "joined_at!: DateTime<Utc>",
                             created_at as "created_at!: DateTime<Utc>",
                             updated_at as "updated_at!: DateTime<Utc>""#,
                existing.id,
                data.display_name,
                data.avatar_url,
                data.email
            )
            .fetch_one(pool)
            .await?;
            return Ok(row.into());
        }

        // Try to find by email (user might have been invited before signing up)
        if let Some(existing) = Self::find_by_team_and_email(pool, team_id, &data.email).await? {
            // Link existing member to Clerk account
            let row = sqlx::query_as!(
                TeamMemberRow,
                r#"UPDATE team_members
                   SET clerk_user_id = $2, display_name = $3, avatar_url = $4, updated_at = NOW()
                   WHERE id = $1
                   RETURNING id as "id!: Uuid",
                             team_id as "team_id!: Uuid",
                             email,
                             display_name,
                             role,
                             invited_by as "invited_by: Uuid",
                             clerk_user_id,
                             avatar_url,
                             joined_at as "joined_at!: DateTime<Utc>",
                             created_at as "created_at!: DateTime<Utc>",
                             updated_at as "updated_at!: DateTime<Utc>""#,
                existing.id,
                data.clerk_user_id,
                data.display_name,
                data.avatar_url
            )
            .fetch_one(pool)
            .await?;
            return Ok(row.into());
        }

        // Create new member
        let create_data = CreateTeamMember {
            email: data.email.clone(),
            display_name: data.display_name.clone(),
            role: Some(TeamMemberRole::Contributor), // Default role for new members
            clerk_user_id: Some(data.clerk_user_id.clone()),
            avatar_url: data.avatar_url.clone(),
        };
        Self::create(pool, team_id, &create_data, None).await
    }

    /// Delete a team member
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM team_members WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Check if user has at least the given role
    pub fn has_permission(&self, required_role: TeamMemberRole) -> bool {
        match (self.role, required_role) {
            (TeamMemberRole::Owner, _) => true,
            (TeamMemberRole::Maintainer, TeamMemberRole::Owner) => false,
            (TeamMemberRole::Maintainer, _) => true,
            (TeamMemberRole::Contributor, TeamMemberRole::Owner | TeamMemberRole::Maintainer) => {
                false
            }
            (TeamMemberRole::Contributor, _) => true,
            (TeamMemberRole::Viewer, TeamMemberRole::Viewer) => true,
            (TeamMemberRole::Viewer, _) => false,
        }
    }
}

impl TeamInvitation {
    /// Get all pending invitations for a team
    pub async fn find_pending_by_team(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            TeamInvitationRow,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      email,
                      role,
                      status,
                      invited_by as "invited_by: Uuid",
                      token,
                      expires_at as "expires_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>"
               FROM team_invitations
               WHERE team_id = $1 AND status = 'pending'
               ORDER BY created_at DESC"#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Get all invitations for a team (all statuses)
    pub async fn find_all_by_team(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            TeamInvitationRow,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      email,
                      role,
                      status,
                      invited_by as "invited_by: Uuid",
                      token,
                      expires_at as "expires_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>"
               FROM team_invitations
               WHERE team_id = $1
               ORDER BY
                   CASE status
                       WHEN 'pending' THEN 1
                       WHEN 'accepted' THEN 2
                       WHEN 'declined' THEN 3
                       WHEN 'expired' THEN 4
                   END,
                   created_at DESC"#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Get all pending invitations for an email
    pub async fn find_pending_by_email(
        pool: &PgPool,
        email: &str,
    ) -> Result<Vec<TeamInvitationWithTeam>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT ti.id as "id!: Uuid",
                      ti.team_id as "team_id!: Uuid",
                      ti.email,
                      ti.role,
                      ti.status,
                      ti.invited_by as "invited_by: Uuid",
                      ti.token,
                      ti.expires_at as "expires_at!: DateTime<Utc>",
                      ti.created_at as "created_at!: DateTime<Utc>",
                      t.name as team_name
               FROM team_invitations ti
               INNER JOIN teams t ON ti.team_id = t.id
               WHERE ti.email = $1 AND ti.status = 'pending'
               ORDER BY ti.created_at DESC"#,
            email
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| TeamInvitationWithTeam {
                invitation: TeamInvitation {
                    id: row.id,
                    team_id: row.team_id,
                    email: row.email,
                    role: TeamMemberRole::from_str(&row.role).unwrap_or_default(),
                    status: TeamInvitationStatus::from_str(&row.status).unwrap_or_default(),
                    invited_by: row.invited_by,
                    token: row.token,
                    expires_at: row.expires_at,
                    created_at: row.created_at,
                },
                team_name: row.team_name,
            })
            .collect())
    }

    /// Find an invitation by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            TeamInvitationRow,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      email,
                      role,
                      status,
                      invited_by as "invited_by: Uuid",
                      token,
                      expires_at as "expires_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>"
               FROM team_invitations
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find an invitation by token (for shareable links)
    pub async fn find_by_token(pool: &PgPool, token: &str) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            TeamInvitationRow,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      email,
                      role,
                      status,
                      invited_by as "invited_by: Uuid",
                      token,
                      expires_at as "expires_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>"
               FROM team_invitations
               WHERE token = $1"#,
            token
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Create a new invitation
    pub async fn create(
        pool: &PgPool,
        team_id: Uuid,
        data: &CreateTeamInvitation,
        invited_by: Option<Uuid>,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let role = data.role.unwrap_or_default().to_string();
        let status = TeamInvitationStatus::Pending.to_string();
        // Invitations expire in 7 days
        let expires_at = Utc::now() + Duration::days(7);
        // Generate unique token for shareable invite link
        let token = Uuid::new_v4().to_string().replace("-", "");

        let row = sqlx::query_as!(
            TeamInvitationRow,
            r#"INSERT INTO team_invitations (id, team_id, email, role, status, invited_by, token, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         email,
                         role,
                         status,
                         invited_by as "invited_by: Uuid",
                         token,
                         expires_at as "expires_at!: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>""#,
            id,
            team_id,
            data.email,
            role,
            status,
            invited_by,
            token,
            expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Accept an invitation - creates team member and marks invitation as accepted
    pub async fn accept(pool: &PgPool, id: Uuid) -> Result<TeamMember, sqlx::Error> {
        // Get the invitation
        let invitation = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // Check if expired
        if invitation.expires_at < Utc::now() {
            // Mark as expired
            sqlx::query!(
                "UPDATE team_invitations SET status = 'expired' WHERE id = $1",
                id
            )
            .execute(pool)
            .await?;
            return Err(sqlx::Error::RowNotFound);
        }

        // Check if already not pending
        if invitation.status != TeamInvitationStatus::Pending {
            return Err(sqlx::Error::RowNotFound);
        }

        // Create the team member
        let member = TeamMember::create(
            pool,
            invitation.team_id,
            &CreateTeamMember {
                email: invitation.email.clone(),
                display_name: None,
                role: Some(invitation.role),
                clerk_user_id: None,
                avatar_url: None,
            },
            invitation.invited_by,
        )
        .await?;

        // Mark invitation as accepted
        sqlx::query!(
            "UPDATE team_invitations SET status = 'accepted' WHERE id = $1",
            id
        )
        .execute(pool)
        .await?;

        Ok(member)
    }

    /// Decline an invitation
    pub async fn decline(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE team_invitations SET status = 'declined' WHERE id = $1 AND status = 'pending'",
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Cancel/delete an invitation
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM team_invitations WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Update an invitation's role (only for pending invitations)
    pub async fn update_role(
        pool: &PgPool,
        id: Uuid,
        new_role: TeamMemberRole,
    ) -> Result<Self, sqlx::Error> {
        let role_str = new_role.to_string();

        let row = sqlx::query_as!(
            TeamInvitationRow,
            r#"UPDATE team_invitations
               SET role = $2
               WHERE id = $1 AND status = 'pending'
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         email,
                         role,
                         status,
                         invited_by as "invited_by: Uuid",
                         token,
                         expires_at as "expires_at!: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>""#,
            id,
            role_str
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }
}
