//! Local SQLite-backed implementation of the cloud `crates/remote` API surface.
//!
//! Mirrors the subset of `RemoteClient` methods that the desktop client and
//! the MCP currently depend on. Used when the deployment is in `local_only`
//! mode so the app works fully offline (no `api.vibekanban.com` calls).
//!
//! All tables live in `crates/db/migrations/20260420000000_local_remote_core.sql`
//! and use the `remote_*` prefix to avoid collisions with the existing local
//! workspace/project/tag tables.

use api_types::{
    CreateIssueAssigneeRequest, CreateIssueRelationshipRequest, CreateIssueRequest,
    CreateIssueTagRequest, Issue, IssueAssignee, IssuePriority, IssueRelationship,
    IssueRelationshipType, IssueSortField, IssueTag, ListIssueAssigneesResponse,
    ListIssueRelationshipsResponse, ListIssueTagsResponse, ListIssuesResponse, ListMembersResponse,
    ListOrganizationsResponse, ListProjectStatusesResponse, ListProjectsResponse,
    ListPullRequestsResponse, ListTagsResponse, MemberRole, MutationResponse, Organization,
    OrganizationMemberWithProfile, OrganizationWithRole, Project, ProjectStatus,
    SearchIssuesRequest, SortDirection, Tag, UpdateIssueRequest, Workspace,
};
use sqlx::{Row, SqlitePool};
use thiserror::Error;
use uuid::Uuid;

/// Deterministic UUID for the seeded "Local" user
/// (matches `crates/db/migrations/20260420000000_local_remote_core.sql`).
pub const LOCAL_USER_ID: Uuid = Uuid::from_bytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
/// Deterministic UUID for the seeded "Local" organization.
pub const LOCAL_ORG_ID: Uuid = Uuid::from_bytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);

#[derive(Debug, Error)]
pub enum LocalRemoteError {
    #[error("not found")]
    NotFound,
    #[error("sqlx: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("invalid input: {0}")]
    Invalid(String),
}

#[derive(Clone)]
pub struct LocalRemote {
    pool: SqlitePool,
}

impl LocalRemote {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    // -----------------------------------------------------------------------
    // Organizations
    // -----------------------------------------------------------------------

    pub async fn list_organizations(&self) -> Result<ListOrganizationsResponse, LocalRemoteError> {
        let rows = sqlx::query(
            r#"SELECT id, name, slug, issue_prefix, created_at, updated_at
               FROM remote_organizations ORDER BY created_at ASC"#,
        )
        .fetch_all(self.pool())
        .await?;
        let organizations = rows
            .into_iter()
            .map(|row| OrganizationWithRole {
                id: row.get("id"),
                name: row.get("name"),
                slug: row.get("slug"),
                is_personal: false,
                issue_prefix: row.get("issue_prefix"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                user_role: MemberRole::Admin,
            })
            .collect();
        Ok(ListOrganizationsResponse { organizations })
    }

    pub async fn get_organization(&self, id: Uuid) -> Result<Organization, LocalRemoteError> {
        let row = sqlx::query(
            r#"SELECT id, name, slug, issue_prefix, created_at, updated_at
               FROM remote_organizations WHERE id = ?1"#,
        )
        .bind(id)
        .fetch_optional(self.pool())
        .await?
        .ok_or(LocalRemoteError::NotFound)?;
        Ok(Organization {
            id: row.get("id"),
            name: row.get("name"),
            slug: row.get("slug"),
            is_personal: false,
            issue_prefix: row.get("issue_prefix"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }

    pub async fn list_organization_members(
        &self,
        organization_id: Uuid,
    ) -> Result<ListMembersResponse, LocalRemoteError> {
        let rows = sqlx::query(
            r#"SELECT m.user_id, m.created_at AS joined_at,
                      u.email, u.display_name, u.avatar_url
               FROM remote_organization_members m
               JOIN remote_users u ON u.id = m.user_id
               WHERE m.organization_id = ?1"#,
        )
        .bind(organization_id)
        .fetch_all(self.pool())
        .await?;
        let members: Vec<OrganizationMemberWithProfile> = rows
            .into_iter()
            .map(|row| {
                let display: Option<String> = row.get("display_name");
                OrganizationMemberWithProfile {
                    user_id: row.get("user_id"),
                    role: MemberRole::Admin,
                    joined_at: row.get("joined_at"),
                    first_name: display.clone(),
                    last_name: None,
                    username: display,
                    email: row.get("email"),
                    avatar_url: row.get("avatar_url"),
                }
            })
            .collect();
        Ok(ListMembersResponse { members })
    }

    // -----------------------------------------------------------------------
    // Projects
    // -----------------------------------------------------------------------

    pub async fn list_remote_projects(
        &self,
        organization_id: Uuid,
    ) -> Result<ListProjectsResponse, LocalRemoteError> {
        let rows = sqlx::query(
            r#"SELECT id, organization_id, name, color, sort_order, created_at, updated_at
               FROM remote_projects
               WHERE organization_id = ?1
               ORDER BY sort_order ASC, created_at DESC"#,
        )
        .bind(organization_id)
        .fetch_all(self.pool())
        .await?;
        let projects = rows.into_iter().map(row_to_project).collect();
        Ok(ListProjectsResponse { projects })
    }

    pub async fn get_remote_project(&self, id: Uuid) -> Result<Project, LocalRemoteError> {
        let row = sqlx::query(
            r#"SELECT id, organization_id, name, color, sort_order, created_at, updated_at
               FROM remote_projects WHERE id = ?1"#,
        )
        .bind(id)
        .fetch_optional(self.pool())
        .await?
        .ok_or(LocalRemoteError::NotFound)?;
        Ok(row_to_project(row))
    }

    pub async fn create_remote_project(
        &self,
        organization_id: Uuid,
        name: &str,
        color: &str,
    ) -> Result<Project, LocalRemoteError> {
        let id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO remote_projects (id, organization_id, name, color)
               VALUES (?1, ?2, ?3, ?4)"#,
        )
        .bind(id)
        .bind(organization_id)
        .bind(name)
        .bind(color)
        .execute(self.pool())
        .await?;
        self.get_remote_project(id).await
    }

    // -----------------------------------------------------------------------
    // Project statuses
    // -----------------------------------------------------------------------

    pub async fn list_project_statuses(
        &self,
        project_id: Uuid,
    ) -> Result<ListProjectStatusesResponse, LocalRemoteError> {
        let rows = sqlx::query(
            r#"SELECT id, project_id, name, color, sort_order, hidden, created_at
               FROM remote_project_statuses
               WHERE project_id = ?1
               ORDER BY sort_order ASC"#,
        )
        .bind(project_id)
        .fetch_all(self.pool())
        .await?;
        let project_statuses = rows.into_iter().map(row_to_status).collect();
        Ok(ListProjectStatusesResponse { project_statuses })
    }

    pub async fn ensure_default_statuses(
        &self,
        project_id: Uuid,
    ) -> Result<Vec<ProjectStatus>, LocalRemoteError> {
        let existing = self.list_project_statuses(project_id).await?;
        if !existing.project_statuses.is_empty() {
            return Ok(existing.project_statuses);
        }
        let defaults = [
            ("Backlog", "0 0% 50%", 0),
            ("Todo", "210 80% 60%", 1),
            ("In Progress", "45 90% 55%", 2),
            ("Done", "140 60% 45%", 3),
            ("Cancelled", "0 0% 30%", 4),
        ];
        for (name, color, order) in defaults {
            let id = Uuid::new_v4();
            sqlx::query(
                r#"INSERT INTO remote_project_statuses
                   (id, project_id, name, color, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)"#,
            )
            .bind(id)
            .bind(project_id)
            .bind(name)
            .bind(color)
            .bind(order)
            .execute(self.pool())
            .await?;
        }
        Ok(self
            .list_project_statuses(project_id)
            .await?
            .project_statuses)
    }

    // -----------------------------------------------------------------------
    // Tags
    // -----------------------------------------------------------------------

    pub async fn list_tags(&self, project_id: Uuid) -> Result<ListTagsResponse, LocalRemoteError> {
        let rows = sqlx::query(
            r#"SELECT id, project_id, name, color FROM remote_tags
               WHERE project_id = ?1 ORDER BY name ASC"#,
        )
        .bind(project_id)
        .fetch_all(self.pool())
        .await?;
        let tags = rows.into_iter().map(row_to_tag).collect();
        Ok(ListTagsResponse { tags })
    }

    pub async fn get_tag(&self, id: Uuid) -> Result<Tag, LocalRemoteError> {
        let row =
            sqlx::query(r#"SELECT id, project_id, name, color FROM remote_tags WHERE id = ?1"#)
                .bind(id)
                .fetch_optional(self.pool())
                .await?
                .ok_or(LocalRemoteError::NotFound)?;
        Ok(row_to_tag(row))
    }

    // -----------------------------------------------------------------------
    // Issues
    // -----------------------------------------------------------------------

    pub async fn list_issues(
        &self,
        project_id: Uuid,
    ) -> Result<ListIssuesResponse, LocalRemoteError> {
        let rows = sqlx::query(ISSUE_SELECT_SQL)
            .bind(project_id)
            .fetch_all(self.pool())
            .await?;
        let issues: Vec<Issue> = rows.into_iter().map(row_to_issue).collect();
        let total_count = issues.len();
        Ok(ListIssuesResponse {
            issues,
            total_count,
            limit: total_count,
            offset: 0,
        })
    }

    pub async fn search_issues(
        &self,
        req: &SearchIssuesRequest,
    ) -> Result<ListIssuesResponse, LocalRemoteError> {
        // Simplified server-side filter — load all then apply in-memory.
        // Acceptable scale for the local single-user kanban (10s of thousands).
        let all = self.list_issues(req.project_id).await?.issues;
        let mut filtered: Vec<Issue> = all
            .into_iter()
            .filter(|i| {
                if let Some(sid) = req.status_id {
                    if i.status_id != sid {
                        return false;
                    }
                }
                if let Some(ids) = &req.status_ids {
                    if !ids.contains(&i.status_id) {
                        return false;
                    }
                }
                if let Some(p) = req.priority {
                    if i.priority != Some(p) {
                        return false;
                    }
                }
                if let Some(parent) = req.parent_issue_id {
                    if i.parent_issue_id != Some(parent) {
                        return false;
                    }
                }
                if let Some(simple) = &req.simple_id {
                    if &i.simple_id != simple {
                        return false;
                    }
                }
                if let Some(s) = &req.search {
                    let needle = s.to_lowercase();
                    if !i.title.to_lowercase().contains(&needle)
                        && i.description
                            .as_ref()
                            .map(|d| !d.to_lowercase().contains(&needle))
                            .unwrap_or(true)
                    {
                        return false;
                    }
                }
                true
            })
            .collect();

        let dir = req.sort_direction.unwrap_or(SortDirection::Asc);
        match req.sort_field.unwrap_or(IssueSortField::SortOrder) {
            IssueSortField::SortOrder => {
                filtered.sort_by(|a, b| {
                    a.sort_order
                        .partial_cmp(&b.sort_order)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
            }
            IssueSortField::CreatedAt => filtered.sort_by_key(|i| i.created_at),
            IssueSortField::UpdatedAt => filtered.sort_by_key(|i| i.updated_at),
            IssueSortField::Title => filtered.sort_by(|a, b| a.title.cmp(&b.title)),
            IssueSortField::Priority => filtered.sort_by_key(|i| match i.priority {
                Some(IssuePriority::Urgent) => 0,
                Some(IssuePriority::High) => 1,
                Some(IssuePriority::Medium) => 2,
                Some(IssuePriority::Low) => 3,
                None => 4,
            }),
        }
        if matches!(dir, SortDirection::Desc) {
            filtered.reverse();
        }

        let total_count = filtered.len();
        let offset = req.offset.unwrap_or(0).max(0) as usize;
        let limit = req.limit.unwrap_or(filtered.len() as i32).max(0) as usize;
        let page: Vec<Issue> = filtered.into_iter().skip(offset).take(limit).collect();
        let returned = page.len();
        Ok(ListIssuesResponse {
            issues: page,
            total_count,
            limit: returned,
            offset,
        })
    }

    pub async fn get_issue(&self, id: Uuid) -> Result<Issue, LocalRemoteError> {
        let row = sqlx::query(&format!("{} WHERE id = ?1", ISSUE_SELECT_BASE))
            .bind(id)
            .fetch_optional(self.pool())
            .await?
            .ok_or(LocalRemoteError::NotFound)?;
        Ok(row_to_issue(row))
    }

    pub async fn create_issue(
        &self,
        req: &CreateIssueRequest,
    ) -> Result<MutationResponse<Issue>, LocalRemoteError> {
        let id = req.id.unwrap_or_else(Uuid::new_v4);
        let priority_str = req.priority.map(priority_to_str);
        let metadata = serde_json::to_string(&req.extension_metadata)
            .map_err(|e| LocalRemoteError::Invalid(format!("bad extension_metadata: {e}")))?;
        sqlx::query(
            r#"INSERT INTO remote_issues
               (id, project_id, issue_number, simple_id, status_id, title, description,
                priority, start_date, target_date, completed_at, sort_order,
                parent_issue_id, parent_issue_sort_order, extension_metadata, creator_user_id)
               VALUES (?1, ?2, 0, '', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)"#,
        )
        .bind(id)
        .bind(req.project_id)
        .bind(req.status_id)
        .bind(&req.title)
        .bind(&req.description)
        .bind(priority_str)
        .bind(req.start_date)
        .bind(req.target_date)
        .bind(req.completed_at)
        .bind(req.sort_order)
        .bind(req.parent_issue_id)
        .bind(req.parent_issue_sort_order)
        .bind(metadata)
        .bind(LOCAL_USER_ID)
        .execute(self.pool())
        .await?;
        let data = self.get_issue(id).await?;
        Ok(MutationResponse { data, txid: 0 })
    }

    pub async fn update_issue(
        &self,
        id: Uuid,
        req: &UpdateIssueRequest,
    ) -> Result<MutationResponse<Issue>, LocalRemoteError> {
        // Build dynamic UPDATE based on the Some() fields.
        // sqlx's typed binding makes this ugly; we use COALESCE-like semantics
        // by always updating all fields and using existing values when None.
        // This avoids dynamic SQL building while staying readable.
        let current = self.get_issue(id).await?;

        let title = req.title.clone().unwrap_or(current.title);
        let description = req
            .description
            .clone()
            .unwrap_or(current.description.clone());
        let priority = req.priority.unwrap_or(current.priority);
        let start_date = req.start_date.unwrap_or(current.start_date);
        let target_date = req.target_date.unwrap_or(current.target_date);
        let completed_at = req.completed_at.unwrap_or(current.completed_at);
        let sort_order = req.sort_order.unwrap_or(current.sort_order);
        let parent_issue_id = req.parent_issue_id.unwrap_or(current.parent_issue_id);
        let parent_issue_sort_order = req
            .parent_issue_sort_order
            .unwrap_or(current.parent_issue_sort_order);
        let status_id = req.status_id.unwrap_or(current.status_id);
        let extension_metadata = req
            .extension_metadata
            .clone()
            .unwrap_or(current.extension_metadata);
        let metadata = serde_json::to_string(&extension_metadata)
            .map_err(|e| LocalRemoteError::Invalid(format!("bad extension_metadata: {e}")))?;
        let priority_str = priority.map(priority_to_str);

        sqlx::query(
            r#"UPDATE remote_issues SET
               status_id = ?2,
               title = ?3,
               description = ?4,
               priority = ?5,
               start_date = ?6,
               target_date = ?7,
               completed_at = ?8,
               sort_order = ?9,
               parent_issue_id = ?10,
               parent_issue_sort_order = ?11,
               extension_metadata = ?12,
               updated_at = datetime('now', 'subsec')
               WHERE id = ?1"#,
        )
        .bind(id)
        .bind(status_id)
        .bind(title)
        .bind(description)
        .bind(priority_str)
        .bind(start_date)
        .bind(target_date)
        .bind(completed_at)
        .bind(sort_order)
        .bind(parent_issue_id)
        .bind(parent_issue_sort_order)
        .bind(metadata)
        .execute(self.pool())
        .await?;
        let data = self.get_issue(id).await?;
        Ok(MutationResponse { data, txid: 0 })
    }

    pub async fn delete_issue(&self, id: Uuid) -> Result<(), LocalRemoteError> {
        sqlx::query("DELETE FROM remote_issues WHERE id = ?1")
            .bind(id)
            .execute(self.pool())
            .await?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Issue assignees
    // -----------------------------------------------------------------------

    pub async fn list_issue_assignees(
        &self,
        issue_id: Uuid,
    ) -> Result<ListIssueAssigneesResponse, LocalRemoteError> {
        let rows = sqlx::query(
            r#"SELECT id, issue_id, user_id, assigned_at FROM remote_issue_assignees
               WHERE issue_id = ?1 ORDER BY assigned_at ASC"#,
        )
        .bind(issue_id)
        .fetch_all(self.pool())
        .await?;
        let issue_assignees = rows
            .into_iter()
            .map(|r| IssueAssignee {
                id: r.get("id"),
                issue_id: r.get("issue_id"),
                user_id: r.get("user_id"),
                assigned_at: r.get("assigned_at"),
            })
            .collect();
        Ok(ListIssueAssigneesResponse { issue_assignees })
    }

    pub async fn get_issue_assignee(&self, id: Uuid) -> Result<IssueAssignee, LocalRemoteError> {
        let row = sqlx::query(
            r#"SELECT id, issue_id, user_id, assigned_at FROM remote_issue_assignees
               WHERE id = ?1"#,
        )
        .bind(id)
        .fetch_optional(self.pool())
        .await?
        .ok_or(LocalRemoteError::NotFound)?;
        Ok(IssueAssignee {
            id: row.get("id"),
            issue_id: row.get("issue_id"),
            user_id: row.get("user_id"),
            assigned_at: row.get("assigned_at"),
        })
    }

    pub async fn create_issue_assignee(
        &self,
        req: &CreateIssueAssigneeRequest,
    ) -> Result<MutationResponse<IssueAssignee>, LocalRemoteError> {
        let id = req.id.unwrap_or_else(Uuid::new_v4);
        sqlx::query(
            r#"INSERT INTO remote_issue_assignees (id, issue_id, user_id) VALUES (?1, ?2, ?3)"#,
        )
        .bind(id)
        .bind(req.issue_id)
        .bind(req.user_id)
        .execute(self.pool())
        .await?;
        let data = self.get_issue_assignee(id).await?;
        Ok(MutationResponse { data, txid: 0 })
    }

    pub async fn delete_issue_assignee(&self, id: Uuid) -> Result<(), LocalRemoteError> {
        sqlx::query("DELETE FROM remote_issue_assignees WHERE id = ?1")
            .bind(id)
            .execute(self.pool())
            .await?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Issue tags
    // -----------------------------------------------------------------------

    pub async fn list_issue_tags(
        &self,
        issue_id: Uuid,
    ) -> Result<ListIssueTagsResponse, LocalRemoteError> {
        let rows = sqlx::query(
            r#"SELECT id, issue_id, tag_id FROM remote_issue_tags WHERE issue_id = ?1"#,
        )
        .bind(issue_id)
        .fetch_all(self.pool())
        .await?;
        let issue_tags = rows
            .into_iter()
            .map(|r| IssueTag {
                id: r.get("id"),
                issue_id: r.get("issue_id"),
                tag_id: r.get("tag_id"),
            })
            .collect();
        Ok(ListIssueTagsResponse { issue_tags })
    }

    pub async fn get_issue_tag(&self, id: Uuid) -> Result<IssueTag, LocalRemoteError> {
        let row =
            sqlx::query(r#"SELECT id, issue_id, tag_id FROM remote_issue_tags WHERE id = ?1"#)
                .bind(id)
                .fetch_optional(self.pool())
                .await?
                .ok_or(LocalRemoteError::NotFound)?;
        Ok(IssueTag {
            id: row.get("id"),
            issue_id: row.get("issue_id"),
            tag_id: row.get("tag_id"),
        })
    }

    pub async fn create_issue_tag(
        &self,
        req: &CreateIssueTagRequest,
    ) -> Result<MutationResponse<IssueTag>, LocalRemoteError> {
        let id = req.id.unwrap_or_else(Uuid::new_v4);
        sqlx::query(r#"INSERT INTO remote_issue_tags (id, issue_id, tag_id) VALUES (?1, ?2, ?3)"#)
            .bind(id)
            .bind(req.issue_id)
            .bind(req.tag_id)
            .execute(self.pool())
            .await?;
        let data = self.get_issue_tag(id).await?;
        Ok(MutationResponse { data, txid: 0 })
    }

    pub async fn delete_issue_tag(&self, id: Uuid) -> Result<(), LocalRemoteError> {
        sqlx::query("DELETE FROM remote_issue_tags WHERE id = ?1")
            .bind(id)
            .execute(self.pool())
            .await?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Issue relationships
    // -----------------------------------------------------------------------

    pub async fn list_issue_relationships(
        &self,
        issue_id: Uuid,
    ) -> Result<ListIssueRelationshipsResponse, LocalRemoteError> {
        let rows = sqlx::query(
            r#"SELECT id, issue_id, related_issue_id, relationship_type, created_at
               FROM remote_issue_relationships WHERE issue_id = ?1"#,
        )
        .bind(issue_id)
        .fetch_all(self.pool())
        .await?;
        let issue_relationships = rows
            .into_iter()
            .map(|r| IssueRelationship {
                id: r.get("id"),
                issue_id: r.get("issue_id"),
                related_issue_id: r.get("related_issue_id"),
                relationship_type: parse_relationship_type(r.get::<String, _>("relationship_type")),
                created_at: r.get("created_at"),
            })
            .collect();
        Ok(ListIssueRelationshipsResponse {
            issue_relationships,
        })
    }

    pub async fn create_issue_relationship(
        &self,
        req: &CreateIssueRelationshipRequest,
    ) -> Result<MutationResponse<IssueRelationship>, LocalRemoteError> {
        let id = req.id.unwrap_or_else(Uuid::new_v4);
        let kind = relationship_type_to_str(req.relationship_type);
        sqlx::query(
            r#"INSERT INTO remote_issue_relationships
               (id, issue_id, related_issue_id, relationship_type)
               VALUES (?1, ?2, ?3, ?4)"#,
        )
        .bind(id)
        .bind(req.issue_id)
        .bind(req.related_issue_id)
        .bind(kind)
        .execute(self.pool())
        .await?;
        let row = sqlx::query(
            r#"SELECT id, issue_id, related_issue_id, relationship_type, created_at
               FROM remote_issue_relationships WHERE id = ?1"#,
        )
        .bind(id)
        .fetch_one(self.pool())
        .await?;
        let data = IssueRelationship {
            id: row.get("id"),
            issue_id: row.get("issue_id"),
            related_issue_id: row.get("related_issue_id"),
            relationship_type: parse_relationship_type(row.get::<String, _>("relationship_type")),
            created_at: row.get("created_at"),
        };
        Ok(MutationResponse { data, txid: 0 })
    }

    pub async fn delete_issue_relationship(&self, id: Uuid) -> Result<(), LocalRemoteError> {
        sqlx::query("DELETE FROM remote_issue_relationships WHERE id = ?1")
            .bind(id)
            .execute(self.pool())
            .await?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Pull requests (returns empty list — local mode doesn't track remote PRs)
    // -----------------------------------------------------------------------

    pub async fn list_pull_requests(
        &self,
        _issue_id: Uuid,
    ) -> Result<ListPullRequestsResponse, LocalRemoteError> {
        Ok(ListPullRequestsResponse {
            pull_requests: vec![],
        })
    }

    // -----------------------------------------------------------------------
    // Workspaces
    // -----------------------------------------------------------------------

    pub async fn get_workspace_by_local_id(
        &self,
        local_workspace_id: Uuid,
    ) -> Result<Workspace, LocalRemoteError> {
        let row = sqlx::query(
            r#"SELECT id, project_id, owner_user_id, issue_id, local_workspace_id, name,
                      archived, files_changed, lines_added, lines_removed, created_at, updated_at
               FROM remote_workspaces WHERE local_workspace_id = ?1"#,
        )
        .bind(local_workspace_id)
        .fetch_optional(self.pool())
        .await?
        .ok_or(LocalRemoteError::NotFound)?;
        Ok(row_to_workspace(row))
    }
}

// ===========================================================================
// Row → struct helpers
// ===========================================================================

const ISSUE_SELECT_BASE: &str = r#"SELECT
    id, project_id, issue_number, simple_id, status_id, title, description,
    priority, start_date, target_date, completed_at, sort_order,
    parent_issue_id, parent_issue_sort_order, extension_metadata, creator_user_id,
    created_at, updated_at
    FROM remote_issues"#;

const ISSUE_SELECT_SQL: &str = r#"SELECT
    id, project_id, issue_number, simple_id, status_id, title, description,
    priority, start_date, target_date, completed_at, sort_order,
    parent_issue_id, parent_issue_sort_order, extension_metadata, creator_user_id,
    created_at, updated_at
    FROM remote_issues
    WHERE project_id = ?1
    ORDER BY sort_order ASC, created_at ASC"#;

fn row_to_project(row: sqlx::sqlite::SqliteRow) -> Project {
    Project {
        id: row.get("id"),
        organization_id: row.get("organization_id"),
        name: row.get("name"),
        color: row.get("color"),
        sort_order: row.get::<i64, _>("sort_order") as i32,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn row_to_status(row: sqlx::sqlite::SqliteRow) -> ProjectStatus {
    ProjectStatus {
        id: row.get("id"),
        project_id: row.get("project_id"),
        name: row.get("name"),
        color: row.get("color"),
        sort_order: row.get::<i64, _>("sort_order") as i32,
        hidden: row.get::<i64, _>("hidden") != 0,
        created_at: row.get("created_at"),
    }
}

fn row_to_tag(row: sqlx::sqlite::SqliteRow) -> Tag {
    Tag {
        id: row.get("id"),
        project_id: row.get("project_id"),
        name: row.get("name"),
        color: row.get("color"),
    }
}

fn row_to_issue(row: sqlx::sqlite::SqliteRow) -> Issue {
    let priority_str: Option<String> = row.get("priority");
    let metadata_str: String = row.get("extension_metadata");
    let extension_metadata: serde_json::Value =
        serde_json::from_str(&metadata_str).unwrap_or(serde_json::Value::Null);
    Issue {
        id: row.get("id"),
        project_id: row.get("project_id"),
        issue_number: row.get::<i64, _>("issue_number") as i32,
        simple_id: row.get("simple_id"),
        status_id: row.get("status_id"),
        title: row.get("title"),
        description: row.get("description"),
        priority: priority_str.and_then(parse_priority),
        start_date: row.get("start_date"),
        target_date: row.get("target_date"),
        completed_at: row.get("completed_at"),
        sort_order: row.get("sort_order"),
        parent_issue_id: row.get("parent_issue_id"),
        parent_issue_sort_order: row.get("parent_issue_sort_order"),
        extension_metadata,
        creator_user_id: row.get("creator_user_id"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn row_to_workspace(row: sqlx::sqlite::SqliteRow) -> Workspace {
    Workspace {
        id: row.get("id"),
        project_id: row.get("project_id"),
        owner_user_id: row.get("owner_user_id"),
        issue_id: row.get("issue_id"),
        local_workspace_id: row.get("local_workspace_id"),
        name: row.get("name"),
        archived: row.get::<i64, _>("archived") != 0,
        files_changed: row.get::<Option<i64>, _>("files_changed").map(|v| v as i32),
        lines_added: row.get::<Option<i64>, _>("lines_added").map(|v| v as i32),
        lines_removed: row.get::<Option<i64>, _>("lines_removed").map(|v| v as i32),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn priority_to_str(p: IssuePriority) -> &'static str {
    match p {
        IssuePriority::Urgent => "urgent",
        IssuePriority::High => "high",
        IssuePriority::Medium => "medium",
        IssuePriority::Low => "low",
    }
}

fn parse_priority(s: String) -> Option<IssuePriority> {
    match s.as_str() {
        "urgent" => Some(IssuePriority::Urgent),
        "high" => Some(IssuePriority::High),
        "medium" => Some(IssuePriority::Medium),
        "low" => Some(IssuePriority::Low),
        _ => None,
    }
}

fn relationship_type_to_str(t: IssueRelationshipType) -> &'static str {
    match t {
        IssueRelationshipType::Blocking => "blocking",
        IssueRelationshipType::Related => "related",
        IssueRelationshipType::HasDuplicate => "has_duplicate",
    }
}

fn parse_relationship_type(s: String) -> IssueRelationshipType {
    match s.as_str() {
        "blocking" => IssueRelationshipType::Blocking,
        "has_duplicate" => IssueRelationshipType::HasDuplicate,
        _ => IssueRelationshipType::Related,
    }
}
