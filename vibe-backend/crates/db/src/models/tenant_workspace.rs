use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use std::fmt;
use std::str::FromStr;
use ts_rs::TS;
use uuid::Uuid;

// ============================================================================
// TenantWorkspace Model
// ============================================================================

/// Organizational workspace - top-level tenant container
/// Different from 'Workspace' which is for task execution containers
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TenantWorkspace {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    #[ts(type = "Record<string, unknown>")]
    pub settings: serde_json::Value,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Helper struct for FromRow conversion
#[derive(FromRow)]
struct TenantWorkspaceRow {
    id: Uuid,
    name: String,
    slug: String,
    icon: Option<String>,
    color: Option<String>,
    settings: serde_json::Value,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<TenantWorkspaceRow> for TenantWorkspace {
    fn from(row: TenantWorkspaceRow) -> Self {
        TenantWorkspace {
            id: row.id,
            name: row.name,
            slug: row.slug,
            icon: row.icon,
            color: row.color,
            settings: row.settings,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTenantWorkspace {
    pub name: String,
    pub slug: String,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTenantWorkspace {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    #[ts(type = "Record<string, unknown>")]
    pub settings: Option<serde_json::Value>,
}

// ============================================================================
// TenantWorkspaceMember Model
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TenantWorkspaceMember {
    pub id: Uuid,
    pub tenant_workspace_id: Uuid,
    pub user_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: WorkspaceMemberRole,
    #[ts(type = "Date")]
    pub joined_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Helper struct for FromRow conversion
#[derive(FromRow)]
struct TenantWorkspaceMemberRow {
    id: Uuid,
    tenant_workspace_id: Uuid,
    user_id: String,
    email: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
    role: String,
    joined_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<TenantWorkspaceMemberRow> for TenantWorkspaceMember {
    fn from(row: TenantWorkspaceMemberRow) -> Self {
        TenantWorkspaceMember {
            id: row.id,
            tenant_workspace_id: row.tenant_workspace_id,
            user_id: row.user_id,
            email: row.email,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            role: WorkspaceMemberRole::from_str(&row.role).unwrap_or(WorkspaceMemberRole::Member),
            joined_at: row.joined_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceMemberRole {
    Owner,
    Admin,
    Member,
}

impl fmt::Display for WorkspaceMemberRole {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WorkspaceMemberRole::Owner => write!(f, "owner"),
            WorkspaceMemberRole::Admin => write!(f, "admin"),
            WorkspaceMemberRole::Member => write!(f, "member"),
        }
    }
}

impl FromStr for WorkspaceMemberRole {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "owner" => Ok(WorkspaceMemberRole::Owner),
            "admin" => Ok(WorkspaceMemberRole::Admin),
            "member" => Ok(WorkspaceMemberRole::Member),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Deserialize, TS)]
pub struct AddWorkspaceMember {
    pub user_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: Option<WorkspaceMemberRole>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateWorkspaceMemberRole {
    pub role: WorkspaceMemberRole,
}

// ============================================================================
// Errors
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum TenantWorkspaceError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Workspace not found")]
    NotFound,
    #[error("Workspace slug already in use")]
    SlugConflict,
    #[error("User is not a member of this workspace")]
    NotMember,
    #[error("Insufficient permissions")]
    InsufficientPermissions,
}

// ============================================================================
// TenantWorkspace Implementation
// ============================================================================

impl TenantWorkspace {
    /// Create a new workspace with the creator as owner
    pub async fn create(
        pool: &PgPool,
        data: &CreateTenantWorkspace,
        creator_user_id: &str,
        creator_email: &str,
    ) -> Result<Self, TenantWorkspaceError> {
        let mut tx = pool.begin().await?;

        // Create the workspace
        let workspace = sqlx::query_as!(
            TenantWorkspaceRow,
            r#"INSERT INTO tenant_workspaces (name, slug, icon, color)
               VALUES ($1, $2, $3, $4)
               RETURNING id as "id!: Uuid",
                         name,
                         slug,
                         icon,
                         color,
                         settings as "settings!: serde_json::Value",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            data.name,
            data.slug,
            data.icon,
            data.color
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| {
            if e.to_string().contains("unique") || e.to_string().contains("duplicate") {
                TenantWorkspaceError::SlugConflict
            } else {
                TenantWorkspaceError::Database(e)
            }
        })?;

        // Add the creator as owner
        sqlx::query!(
            r#"INSERT INTO tenant_workspace_members (tenant_workspace_id, user_id, email, role)
               VALUES ($1, $2, $3, 'owner')"#,
            workspace.id,
            creator_user_id,
            creator_email
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(workspace.into())
    }

    /// Find all workspaces for a user (where they are a member)
    pub async fn find_all_for_user(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Vec<Self>, TenantWorkspaceError> {
        let workspaces = sqlx::query_as!(
            TenantWorkspaceRow,
            r#"SELECT tw.id as "id!: Uuid",
                      tw.name,
                      tw.slug,
                      tw.icon,
                      tw.color,
                      tw.settings as "settings!: serde_json::Value",
                      tw.created_at as "created_at!: DateTime<Utc>",
                      tw.updated_at as "updated_at!: DateTime<Utc>"
               FROM tenant_workspaces tw
               JOIN tenant_workspace_members twm ON tw.id = twm.tenant_workspace_id
               WHERE twm.user_id = $1
               ORDER BY tw.name ASC"#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(workspaces.into_iter().map(|r| r.into()).collect())
    }

    /// Find a workspace by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<Self>, TenantWorkspaceError> {
        let workspace = sqlx::query_as!(
            TenantWorkspaceRow,
            r#"SELECT id as "id!: Uuid",
                      name,
                      slug,
                      icon,
                      color,
                      settings as "settings!: serde_json::Value",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM tenant_workspaces
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(workspace.map(|r| r.into()))
    }

    /// Find a workspace by slug
    pub async fn find_by_slug(
        pool: &PgPool,
        slug: &str,
    ) -> Result<Option<Self>, TenantWorkspaceError> {
        let workspace = sqlx::query_as!(
            TenantWorkspaceRow,
            r#"SELECT id as "id!: Uuid",
                      name,
                      slug,
                      icon,
                      color,
                      settings as "settings!: serde_json::Value",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM tenant_workspaces
               WHERE slug = $1"#,
            slug
        )
        .fetch_optional(pool)
        .await?;

        Ok(workspace.map(|r| r.into()))
    }

    /// Update a workspace
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: &UpdateTenantWorkspace,
    ) -> Result<Self, TenantWorkspaceError> {
        let existing = Self::find_by_id(pool, id).await?.ok_or(TenantWorkspaceError::NotFound)?;

        let name = data.name.as_ref().unwrap_or(&existing.name);
        let icon = data.icon.as_ref().or(existing.icon.as_ref());
        let color = data.color.as_ref().or(existing.color.as_ref());
        let settings = data.settings.as_ref().unwrap_or(&existing.settings);

        let workspace = sqlx::query_as!(
            TenantWorkspaceRow,
            r#"UPDATE tenant_workspaces
               SET name = $2, icon = $3, color = $4, settings = $5, updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         slug,
                         icon,
                         color,
                         settings as "settings!: serde_json::Value",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            icon,
            color,
            settings
        )
        .fetch_one(pool)
        .await?;

        Ok(workspace.into())
    }

    /// Delete a workspace
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, TenantWorkspaceError> {
        let result = sqlx::query!("DELETE FROM tenant_workspaces WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Find or create the default "iKanban" workspace
    pub async fn find_or_create_default(pool: &PgPool) -> Result<Self, TenantWorkspaceError> {
        // Try to find existing default workspace
        if let Some(workspace) = Self::find_by_slug(pool, "ikanban").await? {
            return Ok(workspace);
        }

        // Create default workspace (without owner - will be added separately)
        let workspace = sqlx::query_as!(
            TenantWorkspaceRow,
            r#"INSERT INTO tenant_workspaces (name, slug, icon, color)
               VALUES ('iKanban', 'ikanban', NULL, '#6366f1')
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
               RETURNING id as "id!: Uuid",
                         name,
                         slug,
                         icon,
                         color,
                         settings as "settings!: serde_json::Value",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#
        )
        .fetch_one(pool)
        .await?;

        Ok(workspace.into())
    }

    /// Ensure a user is a member of a workspace (idempotent)
    pub async fn ensure_user_is_member(
        pool: &PgPool,
        workspace_id: Uuid,
        user_id: &str,
        email: &str,
    ) -> Result<(), TenantWorkspaceError> {
        // Use ON CONFLICT to make this idempotent
        sqlx::query!(
            r#"INSERT INTO tenant_workspace_members (tenant_workspace_id, user_id, email, role)
               VALUES ($1, $2, $3, 'member')
               ON CONFLICT (tenant_workspace_id, user_id) DO NOTHING"#,
            workspace_id,
            user_id,
            email
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}

// ============================================================================
// TenantWorkspaceMember Implementation
// ============================================================================

impl TenantWorkspaceMember {
    /// Find all members of a workspace
    pub async fn find_by_workspace(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, TenantWorkspaceError> {
        let rows = sqlx::query_as!(
            TenantWorkspaceMemberRow,
            r#"SELECT id as "id!: Uuid",
                      tenant_workspace_id as "tenant_workspace_id!: Uuid",
                      user_id,
                      email,
                      display_name,
                      avatar_url,
                      role,
                      joined_at as "joined_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM tenant_workspace_members
               WHERE tenant_workspace_id = $1
               ORDER BY role ASC, joined_at ASC"#,
            workspace_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Find a specific member
    pub async fn find_by_user(
        pool: &PgPool,
        workspace_id: Uuid,
        user_id: &str,
    ) -> Result<Option<Self>, TenantWorkspaceError> {
        let row = sqlx::query_as!(
            TenantWorkspaceMemberRow,
            r#"SELECT id as "id!: Uuid",
                      tenant_workspace_id as "tenant_workspace_id!: Uuid",
                      user_id,
                      email,
                      display_name,
                      avatar_url,
                      role,
                      joined_at as "joined_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM tenant_workspace_members
               WHERE tenant_workspace_id = $1 AND user_id = $2"#,
            workspace_id,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Check if a user is a member of a workspace
    pub async fn is_member(
        pool: &PgPool,
        workspace_id: Uuid,
        user_id: &str,
    ) -> Result<bool, TenantWorkspaceError> {
        let result = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!" FROM tenant_workspace_members
               WHERE tenant_workspace_id = $1 AND user_id = $2"#,
            workspace_id,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(result > 0)
    }

    /// Get the role of a user in a workspace
    pub async fn get_role(
        pool: &PgPool,
        workspace_id: Uuid,
        user_id: &str,
    ) -> Result<Option<WorkspaceMemberRole>, TenantWorkspaceError> {
        let role = sqlx::query_scalar!(
            r#"SELECT role FROM tenant_workspace_members
               WHERE tenant_workspace_id = $1 AND user_id = $2"#,
            workspace_id,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(role.and_then(|r| WorkspaceMemberRole::from_str(&r).ok()))
    }

    /// Add a member to a workspace
    pub async fn add(
        pool: &PgPool,
        workspace_id: Uuid,
        data: &AddWorkspaceMember,
    ) -> Result<Self, TenantWorkspaceError> {
        let role = data.role.unwrap_or(WorkspaceMemberRole::Member);
        let role_str = role.to_string();

        let row = sqlx::query_as!(
            TenantWorkspaceMemberRow,
            r#"INSERT INTO tenant_workspace_members
                   (tenant_workspace_id, user_id, email, display_name, avatar_url, role)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         user_id,
                         email,
                         display_name,
                         avatar_url,
                         role,
                         joined_at as "joined_at!: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            workspace_id,
            data.user_id,
            data.email,
            data.display_name,
            data.avatar_url,
            role_str
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Update a member's role
    pub async fn update_role(
        pool: &PgPool,
        workspace_id: Uuid,
        user_id: &str,
        role: WorkspaceMemberRole,
    ) -> Result<Self, TenantWorkspaceError> {
        let role_str = role.to_string();

        let row = sqlx::query_as!(
            TenantWorkspaceMemberRow,
            r#"UPDATE tenant_workspace_members
               SET role = $3, updated_at = NOW()
               WHERE tenant_workspace_id = $1 AND user_id = $2
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         user_id,
                         email,
                         display_name,
                         avatar_url,
                         role,
                         joined_at as "joined_at!: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            workspace_id,
            user_id,
            role_str
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Remove a member from a workspace
    pub async fn remove(
        pool: &PgPool,
        workspace_id: Uuid,
        user_id: &str,
    ) -> Result<u64, TenantWorkspaceError> {
        let result = sqlx::query!(
            "DELETE FROM tenant_workspace_members WHERE tenant_workspace_id = $1 AND user_id = $2",
            workspace_id,
            user_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_member_role_display() {
        assert_eq!(WorkspaceMemberRole::Owner.to_string(), "owner");
        assert_eq!(WorkspaceMemberRole::Admin.to_string(), "admin");
        assert_eq!(WorkspaceMemberRole::Member.to_string(), "member");
    }

    #[test]
    fn test_workspace_member_role_from_str() {
        assert_eq!(
            WorkspaceMemberRole::from_str("owner").unwrap(),
            WorkspaceMemberRole::Owner
        );
        assert_eq!(
            WorkspaceMemberRole::from_str("admin").unwrap(),
            WorkspaceMemberRole::Admin
        );
        assert_eq!(
            WorkspaceMemberRole::from_str("member").unwrap(),
            WorkspaceMemberRole::Member
        );
        assert_eq!(
            WorkspaceMemberRole::from_str("OWNER").unwrap(),
            WorkspaceMemberRole::Owner
        );
        assert!(WorkspaceMemberRole::from_str("invalid").is_err());
    }

    #[test]
    fn test_role_equality() {
        assert_eq!(WorkspaceMemberRole::Owner, WorkspaceMemberRole::Owner);
        assert_ne!(WorkspaceMemberRole::Owner, WorkspaceMemberRole::Admin);
    }
}
