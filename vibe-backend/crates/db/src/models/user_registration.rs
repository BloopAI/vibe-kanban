use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use std::str::FromStr;
use ts_rs::TS;
use uuid::Uuid;

/// Registration status for new users
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum RegistrationStatus {
    /// Waiting for owner approval
    Pending,
    /// Approved - user can access the platform
    Approved,
    /// Rejected - user access denied
    Rejected,
}

impl Default for RegistrationStatus {
    fn default() -> Self {
        Self::Pending
    }
}

impl std::fmt::Display for RegistrationStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Approved => write!(f, "approved"),
            Self::Rejected => write!(f, "rejected"),
        }
    }
}

impl FromStr for RegistrationStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "pending" => Ok(Self::Pending),
            "approved" => Ok(Self::Approved),
            "rejected" => Ok(Self::Rejected),
            _ => Err(format!("Unknown registration status: {}", s)),
        }
    }
}

/// A user registration request
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UserRegistration {
    pub id: Uuid,
    /// Clerk user ID for the registering user
    pub clerk_user_id: String,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    /// Name for the user's workspace
    pub workspace_name: String,
    /// Number of teams the user plans to create
    pub planned_teams: i32,
    /// Number of projects the user plans to create
    pub planned_projects: i32,
    /// Current registration status
    pub status: RegistrationStatus,
    /// ID of the team member who reviewed this registration
    pub reviewed_by: Option<Uuid>,
    /// When the registration was reviewed
    #[ts(type = "Date | null")]
    pub reviewed_at: Option<DateTime<Utc>>,
    /// Reason for rejection (if rejected)
    pub rejection_reason: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Request to create a user registration
#[derive(Debug, Deserialize, TS)]
pub struct CreateUserRegistration {
    pub clerk_user_id: String,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub workspace_name: String,
    pub planned_teams: Option<i32>,
    pub planned_projects: Option<i32>,
}

/// Request to review (approve/reject) a user registration
#[derive(Debug, Deserialize, TS)]
pub struct ReviewUserRegistration {
    pub status: RegistrationStatus,
    pub rejection_reason: Option<String>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct UserRegistrationRow {
    id: Uuid,
    clerk_user_id: String,
    email: String,
    first_name: Option<String>,
    last_name: Option<String>,
    workspace_name: String,
    planned_teams: Option<i32>,
    planned_projects: Option<i32>,
    status: String,
    reviewed_by: Option<Uuid>,
    reviewed_at: Option<DateTime<Utc>>,
    rejection_reason: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<UserRegistrationRow> for UserRegistration {
    fn from(row: UserRegistrationRow) -> Self {
        Self {
            id: row.id,
            clerk_user_id: row.clerk_user_id,
            email: row.email,
            first_name: row.first_name,
            last_name: row.last_name,
            workspace_name: row.workspace_name,
            planned_teams: row.planned_teams.unwrap_or(1),
            planned_projects: row.planned_projects.unwrap_or(1),
            status: RegistrationStatus::from_str(&row.status).unwrap_or_default(),
            reviewed_by: row.reviewed_by,
            reviewed_at: row.reviewed_at,
            rejection_reason: row.rejection_reason,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl UserRegistration {
    /// Find a registration by Clerk user ID
    pub async fn find_by_clerk_id(
        pool: &PgPool,
        clerk_user_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            UserRegistrationRow,
            r#"SELECT id as "id!: Uuid",
                      clerk_user_id,
                      email,
                      first_name,
                      last_name,
                      workspace_name,
                      planned_teams,
                      planned_projects,
                      status,
                      reviewed_by as "reviewed_by: Uuid",
                      reviewed_at as "reviewed_at: DateTime<Utc>",
                      rejection_reason,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM user_registrations
               WHERE clerk_user_id = $1"#,
            clerk_user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find a registration by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            UserRegistrationRow,
            r#"SELECT id as "id!: Uuid",
                      clerk_user_id,
                      email,
                      first_name,
                      last_name,
                      workspace_name,
                      planned_teams,
                      planned_projects,
                      status,
                      reviewed_by as "reviewed_by: Uuid",
                      reviewed_at as "reviewed_at: DateTime<Utc>",
                      rejection_reason,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM user_registrations
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Create a new user registration
    pub async fn create(pool: &PgPool, data: &CreateUserRegistration) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let status = RegistrationStatus::Pending.to_string();
        let planned_teams = data.planned_teams.unwrap_or(1);
        let planned_projects = data.planned_projects.unwrap_or(1);

        let row = sqlx::query_as!(
            UserRegistrationRow,
            r#"INSERT INTO user_registrations (id, clerk_user_id, email, first_name, last_name, workspace_name, planned_teams, planned_projects, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING id as "id!: Uuid",
                         clerk_user_id,
                         email,
                         first_name,
                         last_name,
                         workspace_name,
                         planned_teams,
                         planned_projects,
                         status,
                         reviewed_by as "reviewed_by: Uuid",
                         reviewed_at as "reviewed_at: DateTime<Utc>",
                         rejection_reason,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.clerk_user_id,
            data.email,
            data.first_name,
            data.last_name,
            data.workspace_name,
            planned_teams,
            planned_projects,
            status
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Create a new user registration with auto-approved status (for existing team members)
    pub async fn create_auto_approved(
        pool: &PgPool,
        data: &CreateUserRegistration,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let status = RegistrationStatus::Approved.to_string();
        let planned_teams = data.planned_teams.unwrap_or(1);
        let planned_projects = data.planned_projects.unwrap_or(1);
        let now = Utc::now();

        let row = sqlx::query_as!(
            UserRegistrationRow,
            r#"INSERT INTO user_registrations (id, clerk_user_id, email, first_name, last_name, workspace_name, planned_teams, planned_projects, status, reviewed_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               RETURNING id as "id!: Uuid",
                         clerk_user_id,
                         email,
                         first_name,
                         last_name,
                         workspace_name,
                         planned_teams,
                         planned_projects,
                         status,
                         reviewed_by as "reviewed_by: Uuid",
                         reviewed_at as "reviewed_at: DateTime<Utc>",
                         rejection_reason,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.clerk_user_id,
            data.email,
            data.first_name,
            data.last_name,
            data.workspace_name,
            planned_teams,
            planned_projects,
            status,
            now
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// List all pending registrations (for admin review)
    pub async fn list_pending(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            UserRegistrationRow,
            r#"SELECT id as "id!: Uuid",
                      clerk_user_id,
                      email,
                      first_name,
                      last_name,
                      workspace_name,
                      planned_teams,
                      planned_projects,
                      status,
                      reviewed_by as "reviewed_by: Uuid",
                      reviewed_at as "reviewed_at: DateTime<Utc>",
                      rejection_reason,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM user_registrations
               WHERE status = 'pending'
               ORDER BY created_at ASC"#
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// List all registrations with optional status filter
    pub async fn list_all(
        pool: &PgPool,
        status_filter: Option<RegistrationStatus>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let rows = if let Some(status) = status_filter {
            let status_str = status.to_string();
            sqlx::query_as!(
                UserRegistrationRow,
                r#"SELECT id as "id!: Uuid",
                          clerk_user_id,
                          email,
                          first_name,
                          last_name,
                          workspace_name,
                          planned_teams,
                          planned_projects,
                          status,
                          reviewed_by as "reviewed_by: Uuid",
                          reviewed_at as "reviewed_at: DateTime<Utc>",
                          rejection_reason,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM user_registrations
                   WHERE status = $1
                   ORDER BY created_at DESC"#,
                status_str
            )
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as!(
                UserRegistrationRow,
                r#"SELECT id as "id!: Uuid",
                          clerk_user_id,
                          email,
                          first_name,
                          last_name,
                          workspace_name,
                          planned_teams,
                          planned_projects,
                          status,
                          reviewed_by as "reviewed_by: Uuid",
                          reviewed_at as "reviewed_at: DateTime<Utc>",
                          rejection_reason,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM user_registrations
                   ORDER BY created_at DESC"#
            )
            .fetch_all(pool)
            .await?
        };

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Approve a registration
    pub async fn approve(
        pool: &PgPool,
        id: Uuid,
        reviewed_by: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let status = RegistrationStatus::Approved.to_string();

        let row = sqlx::query_as!(
            UserRegistrationRow,
            r#"UPDATE user_registrations
               SET status = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
               WHERE id = $1 AND status = 'pending'
               RETURNING id as "id!: Uuid",
                         clerk_user_id,
                         email,
                         first_name,
                         last_name,
                         workspace_name,
                         planned_teams,
                         planned_projects,
                         status,
                         reviewed_by as "reviewed_by: Uuid",
                         reviewed_at as "reviewed_at: DateTime<Utc>",
                         rejection_reason,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            status,
            reviewed_by
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Reject a registration
    pub async fn reject(
        pool: &PgPool,
        id: Uuid,
        reviewed_by: Uuid,
        reason: Option<&str>,
    ) -> Result<Self, sqlx::Error> {
        let status = RegistrationStatus::Rejected.to_string();

        let row = sqlx::query_as!(
            UserRegistrationRow,
            r#"UPDATE user_registrations
               SET status = $2, reviewed_by = $3, reviewed_at = NOW(), rejection_reason = $4, updated_at = NOW()
               WHERE id = $1 AND status = 'pending'
               RETURNING id as "id!: Uuid",
                         clerk_user_id,
                         email,
                         first_name,
                         last_name,
                         workspace_name,
                         planned_teams,
                         planned_projects,
                         status,
                         reviewed_by as "reviewed_by: Uuid",
                         reviewed_at as "reviewed_at: DateTime<Utc>",
                         rejection_reason,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            status,
            reviewed_by,
            reason
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Check if user registration is approved
    pub fn is_approved(&self) -> bool {
        self.status == RegistrationStatus::Approved
    }

    /// Check if user registration is pending
    pub fn is_pending(&self) -> bool {
        self.status == RegistrationStatus::Pending
    }
}
