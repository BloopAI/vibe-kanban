use api_types::{
    CreateIssueAssigneeRequest, CreateIssueCommentReactionRequest, CreateIssueCommentRequest,
    CreateIssueFollowerRequest, CreateIssueRelationshipRequest, CreateIssueRequest,
    CreateIssueTagRequest, CreateProjectRequest, CreateProjectStatusRequest, CreateTagRequest,
    DeleteResponse, Issue, IssueAssignee, IssueComment, IssueCommentReaction, IssueFollower,
    IssuePriority, IssueRelationship, IssueRelationshipType, IssueTag, ListMembersResponse,
    ListOrganizationsResponse, MemberRole, MutationResponse, OrganizationMember,
    OrganizationMemberWithProfile, OrganizationWithRole, Project, ProjectStatus, Tag,
    UpdateIssueCommentRequest,
    UpdateIssueRequest, UpdateProjectRequest, UpdateProjectStatusRequest, UpdateTagRequest,
    User, Workspace,
};
use axum::{
    Router,
    extract::{Json, Path, Query, State},
    response::Json as ResponseJson,
    routing::{delete, get, patch, post},
};
use chrono::Utc;
use deployment::Deployment;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{Row, SqlitePool, sqlite::SqliteRow};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

const LOCAL_PROJECT_COLOR: &str = "210 80% 52%";

const DEFAULT_STATUSES: [(&str, &str, i32, bool); 5] = [
    ("Todo", "210 80% 52%", 100, false),
    ("In Progress", "38 92% 50%", 200, false),
    ("In Review", "265 70% 62%", 300, false),
    ("Done", "145 63% 42%", 400, false),
    ("Cancelled", "0 0% 50%", 500, true),
];

#[derive(Debug, Deserialize)]
struct OrganizationQuery {
    organization_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct ProjectQuery {
    project_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct IssueQuery {
    issue_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct UserQuery {
    user_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct BulkUpdateProjectItem {
    id: Uuid,
    #[serde(flatten)]
    changes: UpdateProjectRequest,
}

#[derive(Debug, Deserialize)]
struct BulkUpdateProjectsRequest {
    updates: Vec<BulkUpdateProjectItem>,
}

#[derive(Debug, Deserialize)]
struct BulkUpdateProjectStatusItem {
    id: Uuid,
    #[serde(flatten)]
    changes: UpdateProjectStatusRequest,
}

#[derive(Debug, Deserialize)]
struct BulkUpdateProjectStatusesRequest {
    updates: Vec<BulkUpdateProjectStatusItem>,
}

#[derive(Debug, Deserialize)]
struct BulkUpdateIssueItem {
    id: Uuid,
    #[serde(flatten)]
    changes: UpdateIssueRequest,
}

#[derive(Debug, Deserialize)]
struct BulkUpdateIssuesRequest {
    updates: Vec<BulkUpdateIssueItem>,
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/v1/organizations", get(list_organizations))
        .route("/v1/organizations/{org_id}/members", get(list_members))
        .route(
            "/v1/fallback/organization_members",
            get(fallback_organization_members),
        )
        .route("/v1/fallback/users", get(fallback_users))
        .route("/v1/fallback/projects", get(fallback_projects))
        .route("/v1/fallback/project_statuses", get(fallback_project_statuses))
        .route("/v1/fallback/issues", get(fallback_issues))
        .route("/v1/fallback/tags", get(fallback_tags))
        .route("/v1/fallback/issue_tags", get(fallback_issue_tags))
        .route("/v1/fallback/issue_assignees", get(fallback_issue_assignees))
        .route("/v1/fallback/issue_followers", get(fallback_issue_followers))
        .route(
            "/v1/fallback/issue_relationships",
            get(fallback_issue_relationships),
        )
        .route("/v1/fallback/pull_requests", get(fallback_pull_requests))
        .route(
            "/v1/fallback/pull_request_issues",
            get(fallback_pull_request_issues),
        )
        .route("/v1/fallback/project_workspaces", get(fallback_project_workspaces))
        .route("/v1/fallback/user_workspaces", get(fallback_user_workspaces))
        .route("/v1/fallback/notifications", get(fallback_notifications))
        .route("/v1/fallback/issue_comments", get(fallback_issue_comments))
        .route(
            "/v1/fallback/issue_comment_reactions",
            get(fallback_issue_comment_reactions),
        )
        .route("/v1/projects", post(create_project))
        .route("/v1/projects/bulk", post(bulk_update_projects))
        .route(
            "/v1/projects/{project_id}",
            get(get_project).patch(update_project).delete(delete_project),
        )
        .route("/v1/project_statuses", post(create_project_status))
        .route(
            "/v1/project_statuses/bulk",
            post(bulk_update_project_statuses),
        )
        .route(
            "/v1/project_statuses/{status_id}",
            patch(update_project_status).delete(delete_project_status),
        )
        .route("/v1/issues", post(create_issue))
        .route("/v1/issues/bulk", post(bulk_update_issues))
        .route(
            "/v1/issues/{issue_id}",
            patch(update_issue).delete(delete_issue),
        )
        .route("/v1/tags", post(create_tag))
        .route("/v1/tags/{tag_id}", patch(update_tag).delete(delete_tag))
        .route("/v1/issue_tags", post(create_issue_tag))
        .route("/v1/issue_tags/{issue_tag_id}", delete(delete_issue_tag))
        .route("/v1/issue_assignees", post(create_issue_assignee))
        .route(
            "/v1/issue_assignees/{issue_assignee_id}",
            delete(delete_issue_assignee),
        )
        .route("/v1/issue_followers", post(create_issue_follower))
        .route(
            "/v1/issue_followers/{issue_follower_id}",
            delete(delete_issue_follower),
        )
        .route("/v1/issue_relationships", post(create_issue_relationship))
        .route(
            "/v1/issue_relationships/{relationship_id}",
            delete(delete_issue_relationship),
        )
        .route("/v1/issue_comments", post(create_issue_comment))
        .route(
            "/v1/issue_comments/{comment_id}",
            patch(update_issue_comment).delete(delete_issue_comment),
        )
        .route(
            "/v1/issue_comment_reactions",
            post(create_issue_comment_reaction),
        )
        .route(
            "/v1/issue_comment_reactions/{reaction_id}",
            delete(delete_issue_comment_reaction),
        )
}

fn local_user_id() -> Uuid {
    Uuid::from_u128(1)
}

fn local_org_id() -> Uuid {
    Uuid::from_u128(2)
}

fn txid() -> i64 {
    Utc::now().timestamp_millis()
}

fn priority_to_str(priority: IssuePriority) -> &'static str {
    match priority {
        IssuePriority::Urgent => "urgent",
        IssuePriority::High => "high",
        IssuePriority::Medium => "medium",
        IssuePriority::Low => "low",
    }
}

fn priority_from_str(value: Option<String>) -> Option<IssuePriority> {
    match value.as_deref() {
        Some("urgent") => Some(IssuePriority::Urgent),
        Some("high") => Some(IssuePriority::High),
        Some("medium") => Some(IssuePriority::Medium),
        Some("low") => Some(IssuePriority::Low),
        _ => None,
    }
}

fn relationship_type_to_str(relationship_type: IssueRelationshipType) -> &'static str {
    match relationship_type {
        IssueRelationshipType::Blocking => "blocking",
        IssueRelationshipType::Related => "related",
        IssueRelationshipType::HasDuplicate => "has_duplicate",
    }
}

fn relationship_type_from_str(value: String) -> IssueRelationshipType {
    match value.as_str() {
        "blocking" => IssueRelationshipType::Blocking,
        "has_duplicate" => IssueRelationshipType::HasDuplicate,
        _ => IssueRelationshipType::Related,
    }
}

fn empty_rows(table: &str) -> ResponseJson<Value> {
    ResponseJson(json!({ table: [] }))
}

async fn project_exists(pool: &SqlitePool, project_id: Uuid) -> Result<bool, ApiError> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_one(pool)
        .await?;
    Ok(count > 0)
}

async fn ensure_project_metadata(pool: &SqlitePool) -> Result<(), ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT p.id
        FROM projects p
        LEFT JOIN local_project_metadata m ON m.project_id = p.id
        WHERE m.project_id IS NULL
        ORDER BY p.created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    for row in rows {
        let project_id: Uuid = row.try_get("id")?;
        let sort_order: i32 =
            sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM local_project_metadata")
                .fetch_one(pool)
                .await?;

        sqlx::query(
            r#"
            INSERT INTO local_project_metadata
                (project_id, organization_id, color, sort_order)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind(project_id)
        .bind(local_org_id())
        .bind(LOCAL_PROJECT_COLOR)
        .bind(sort_order)
        .execute(pool)
        .await?;
    }

    Ok(())
}

fn project_from_row(row: &SqliteRow) -> Result<Project, sqlx::Error> {
    Ok(Project {
        id: row.try_get("id")?,
        organization_id: row.try_get("organization_id")?,
        name: row.try_get("name")?,
        color: row.try_get("color")?,
        sort_order: row.try_get("sort_order")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

async fn list_local_projects(pool: &SqlitePool) -> Result<Vec<Project>, ApiError> {
    ensure_project_metadata(pool).await?;

    let rows = sqlx::query(
        r#"
        SELECT
            p.id,
            m.organization_id,
            p.name,
            m.color,
            m.sort_order,
            p.created_at,
            p.updated_at
        FROM projects p
        JOIN local_project_metadata m ON m.project_id = p.id
        WHERE m.organization_id = ?
        ORDER BY m.sort_order ASC, p.created_at ASC
        "#,
    )
    .bind(local_org_id())
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(project_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

async fn get_local_project(pool: &SqlitePool, project_id: Uuid) -> Result<Project, ApiError> {
    ensure_project_metadata(pool).await?;

    let row = sqlx::query(
        r#"
        SELECT
            p.id,
            m.organization_id,
            p.name,
            m.color,
            m.sort_order,
            p.created_at,
            p.updated_at
        FROM projects p
        JOIN local_project_metadata m ON m.project_id = p.id
        WHERE p.id = ?
        "#,
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Project not found".to_string()))?;

    project_from_row(&row).map_err(ApiError::from)
}

async fn create_local_project(
    pool: &SqlitePool,
    request: CreateProjectRequest,
) -> Result<Project, ApiError> {
    let project_id = request.id.unwrap_or_else(Uuid::new_v4);
    let sort_order: i32 =
        sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM local_project_metadata")
            .fetch_one(pool)
            .await?;

    sqlx::query("INSERT INTO projects (id, name) VALUES (?, ?)")
        .bind(project_id)
        .bind(request.name)
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        INSERT INTO local_project_metadata
            (project_id, organization_id, color, sort_order)
        VALUES (?, ?, ?, ?)
        "#,
    )
    .bind(project_id)
    .bind(local_org_id())
    .bind(request.color)
    .bind(sort_order)
    .execute(pool)
    .await?;

    ensure_default_statuses(pool, project_id).await?;
    get_local_project(pool, project_id).await
}

async fn update_local_project(
    pool: &SqlitePool,
    project_id: Uuid,
    changes: UpdateProjectRequest,
) -> Result<Project, ApiError> {
    if let Some(name) = changes.name {
        sqlx::query("UPDATE projects SET name = ?, updated_at = datetime('now', 'subsec') WHERE id = ?")
            .bind(name)
            .bind(project_id)
            .execute(pool)
            .await?;
    }

    if changes.color.is_some() || changes.sort_order.is_some() {
        ensure_project_metadata(pool).await?;

        let existing = get_local_project(pool, project_id).await?;
        sqlx::query(
            r#"
            UPDATE local_project_metadata
            SET color = ?, sort_order = ?, updated_at = datetime('now', 'subsec')
            WHERE project_id = ?
            "#,
        )
        .bind(changes.color.unwrap_or(existing.color))
        .bind(changes.sort_order.unwrap_or(existing.sort_order))
        .bind(project_id)
        .execute(pool)
        .await?;
    }

    get_local_project(pool, project_id).await
}

fn status_from_row(row: &SqliteRow) -> Result<ProjectStatus, sqlx::Error> {
    Ok(ProjectStatus {
        id: row.try_get("id")?,
        project_id: row.try_get("project_id")?,
        name: row.try_get("name")?,
        color: row.try_get("color")?,
        sort_order: row.try_get("sort_order")?,
        hidden: row.try_get("hidden")?,
        created_at: row.try_get("created_at")?,
    })
}

async fn list_project_statuses(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<Vec<ProjectStatus>, ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT id, project_id, name, color, sort_order, hidden, created_at
        FROM local_project_statuses
        WHERE project_id = ?
        ORDER BY sort_order ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(status_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

async fn get_project_status(
    pool: &SqlitePool,
    status_id: Uuid,
) -> Result<ProjectStatus, ApiError> {
    let row = sqlx::query(
        r#"
        SELECT id, project_id, name, color, sort_order, hidden, created_at
        FROM local_project_statuses
        WHERE id = ?
        "#,
    )
    .bind(status_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Project status not found".to_string()))?;

    status_from_row(&row).map_err(ApiError::from)
}

async fn ensure_default_statuses(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<Vec<ProjectStatus>, ApiError> {
    if !project_exists(pool, project_id).await? {
        return Ok(Vec::new());
    }

    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM local_project_statuses WHERE project_id = ?")
            .bind(project_id)
            .fetch_one(pool)
            .await?;

    if count == 0 {
        for (name, color, sort_order, hidden) in DEFAULT_STATUSES {
            sqlx::query(
                r#"
                INSERT INTO local_project_statuses
                    (id, project_id, name, color, sort_order, hidden)
                VALUES (?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(Uuid::new_v4())
            .bind(project_id)
            .bind(name)
            .bind(color)
            .bind(sort_order)
            .bind(hidden)
            .execute(pool)
            .await?;
        }
    }

    list_project_statuses(pool, project_id).await
}

async fn create_local_status(
    pool: &SqlitePool,
    request: CreateProjectStatusRequest,
) -> Result<ProjectStatus, ApiError> {
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query(
        r#"
        INSERT INTO local_project_statuses
            (id, project_id, name, color, sort_order, hidden)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(id)
    .bind(request.project_id)
    .bind(request.name)
    .bind(request.color)
    .bind(request.sort_order)
    .bind(request.hidden)
    .execute(pool)
    .await?;

    get_project_status(pool, id).await
}

async fn update_local_status(
    pool: &SqlitePool,
    status_id: Uuid,
    changes: UpdateProjectStatusRequest,
) -> Result<ProjectStatus, ApiError> {
    let existing = get_project_status(pool, status_id).await?;

    sqlx::query(
        r#"
        UPDATE local_project_statuses
        SET name = ?, color = ?, sort_order = ?, hidden = ?
        WHERE id = ?
        "#,
    )
    .bind(changes.name.unwrap_or(existing.name))
    .bind(changes.color.unwrap_or(existing.color))
    .bind(changes.sort_order.unwrap_or(existing.sort_order))
    .bind(changes.hidden.unwrap_or(existing.hidden))
    .bind(status_id)
    .execute(pool)
    .await?;

    get_project_status(pool, status_id).await
}

fn issue_from_row(row: &SqliteRow) -> Result<Issue, sqlx::Error> {
    let extension_metadata = row
        .try_get::<String, _>("extension_metadata")
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .unwrap_or(Value::Null);

    Ok(Issue {
        id: row.try_get("id")?,
        project_id: row.try_get("project_id")?,
        issue_number: row.try_get("issue_number")?,
        simple_id: row.try_get("simple_id")?,
        status_id: row.try_get("status_id")?,
        title: row.try_get("title")?,
        description: row.try_get("description")?,
        priority: priority_from_str(row.try_get("priority")?),
        start_date: row.try_get("start_date")?,
        target_date: row.try_get("target_date")?,
        completed_at: row.try_get("completed_at")?,
        sort_order: row.try_get("sort_order")?,
        parent_issue_id: row.try_get("parent_issue_id")?,
        parent_issue_sort_order: row.try_get("parent_issue_sort_order")?,
        extension_metadata,
        creator_user_id: row.try_get("creator_user_id")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

async fn list_project_issues(pool: &SqlitePool, project_id: Uuid) -> Result<Vec<Issue>, ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT
            id,
            project_id,
            issue_number,
            simple_id,
            status_id,
            title,
            description,
            priority,
            start_date,
            target_date,
            completed_at,
            sort_order,
            parent_issue_id,
            parent_issue_sort_order,
            extension_metadata,
            creator_user_id,
            created_at,
            updated_at
        FROM local_issues
        WHERE project_id = ?
        ORDER BY sort_order ASC, created_at ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(issue_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

async fn get_local_issue(pool: &SqlitePool, issue_id: Uuid) -> Result<Issue, ApiError> {
    let row = sqlx::query(
        r#"
        SELECT
            id,
            project_id,
            issue_number,
            simple_id,
            status_id,
            title,
            description,
            priority,
            start_date,
            target_date,
            completed_at,
            sort_order,
            parent_issue_id,
            parent_issue_sort_order,
            extension_metadata,
            creator_user_id,
            created_at,
            updated_at
        FROM local_issues
        WHERE id = ?
        "#,
    )
    .bind(issue_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Issue not found".to_string()))?;

    issue_from_row(&row).map_err(ApiError::from)
}

async fn create_local_issue(
    pool: &SqlitePool,
    request: CreateIssueRequest,
) -> Result<Issue, ApiError> {
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    let issue_number: i32 =
        sqlx::query_scalar("SELECT COALESCE(MAX(issue_number), 0) + 1 FROM local_issues WHERE project_id = ?")
            .bind(request.project_id)
            .fetch_one(pool)
            .await?;
    let simple_id = format!("LOCAL-{issue_number}");
    let extension_metadata =
        serde_json::to_string(&request.extension_metadata).unwrap_or_else(|_| "null".to_string());

    sqlx::query(
        r#"
        INSERT INTO local_issues (
            id,
            project_id,
            issue_number,
            simple_id,
            status_id,
            title,
            description,
            priority,
            start_date,
            target_date,
            completed_at,
            sort_order,
            parent_issue_id,
            parent_issue_sort_order,
            extension_metadata,
            creator_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(id)
    .bind(request.project_id)
    .bind(issue_number)
    .bind(simple_id)
    .bind(request.status_id)
    .bind(request.title)
    .bind(request.description)
    .bind(request.priority.map(priority_to_str))
    .bind(request.start_date)
    .bind(request.target_date)
    .bind(request.completed_at)
    .bind(request.sort_order)
    .bind(request.parent_issue_id)
    .bind(request.parent_issue_sort_order)
    .bind(extension_metadata)
    .bind(local_user_id())
    .execute(pool)
    .await?;

    get_local_issue(pool, id).await
}

async fn update_local_issue(
    pool: &SqlitePool,
    issue_id: Uuid,
    changes: UpdateIssueRequest,
) -> Result<Issue, ApiError> {
    let existing = get_local_issue(pool, issue_id).await?;
    let extension_metadata = changes
        .extension_metadata
        .unwrap_or(existing.extension_metadata);
    let extension_metadata =
        serde_json::to_string(&extension_metadata).unwrap_or_else(|_| "null".to_string());

    sqlx::query(
        r#"
        UPDATE local_issues
        SET
            status_id = ?,
            title = ?,
            description = ?,
            priority = ?,
            start_date = ?,
            target_date = ?,
            completed_at = ?,
            sort_order = ?,
            parent_issue_id = ?,
            parent_issue_sort_order = ?,
            extension_metadata = ?,
            updated_at = datetime('now', 'subsec')
        WHERE id = ?
        "#,
    )
    .bind(changes.status_id.unwrap_or(existing.status_id))
    .bind(changes.title.unwrap_or(existing.title))
    .bind(changes.description.unwrap_or(existing.description))
    .bind(
        changes
            .priority
            .unwrap_or(existing.priority)
            .map(priority_to_str),
    )
    .bind(changes.start_date.unwrap_or(existing.start_date))
    .bind(changes.target_date.unwrap_or(existing.target_date))
    .bind(changes.completed_at.unwrap_or(existing.completed_at))
    .bind(changes.sort_order.unwrap_or(existing.sort_order))
    .bind(changes.parent_issue_id.unwrap_or(existing.parent_issue_id))
    .bind(
        changes
            .parent_issue_sort_order
            .unwrap_or(existing.parent_issue_sort_order),
    )
    .bind(extension_metadata)
    .bind(issue_id)
    .execute(pool)
    .await?;

    get_local_issue(pool, issue_id).await
}

fn tag_from_row(row: &SqliteRow) -> Result<Tag, sqlx::Error> {
    Ok(Tag {
        id: row.try_get("id")?,
        project_id: row.try_get("project_id")?,
        name: row.try_get("name")?,
        color: row.try_get("color")?,
    })
}

async fn list_project_tags(pool: &SqlitePool, project_id: Uuid) -> Result<Vec<Tag>, ApiError> {
    let rows = sqlx::query(
        "SELECT id, project_id, name, color FROM local_tags WHERE project_id = ? ORDER BY name ASC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(tag_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

async fn get_local_tag(pool: &SqlitePool, tag_id: Uuid) -> Result<Tag, ApiError> {
    let row = sqlx::query("SELECT id, project_id, name, color FROM local_tags WHERE id = ?")
        .bind(tag_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Tag not found".to_string()))?;

    tag_from_row(&row).map_err(ApiError::from)
}

fn issue_tag_from_row(row: &SqliteRow) -> Result<IssueTag, sqlx::Error> {
    Ok(IssueTag {
        id: row.try_get("id")?,
        issue_id: row.try_get("issue_id")?,
        tag_id: row.try_get("tag_id")?,
    })
}

async fn list_project_issue_tags(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<Vec<IssueTag>, ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT it.id, it.issue_id, it.tag_id
        FROM local_issue_tags it
        JOIN local_issues i ON i.id = it.issue_id
        WHERE i.project_id = ?
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(issue_tag_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

fn issue_assignee_from_row(row: &SqliteRow) -> Result<IssueAssignee, sqlx::Error> {
    Ok(IssueAssignee {
        id: row.try_get("id")?,
        issue_id: row.try_get("issue_id")?,
        user_id: row.try_get("user_id")?,
        assigned_at: row.try_get("assigned_at")?,
    })
}

async fn list_project_issue_assignees(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<Vec<IssueAssignee>, ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT ia.id, ia.issue_id, ia.user_id, ia.assigned_at
        FROM local_issue_assignees ia
        JOIN local_issues i ON i.id = ia.issue_id
        WHERE i.project_id = ?
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(issue_assignee_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

fn issue_follower_from_row(row: &SqliteRow) -> Result<IssueFollower, sqlx::Error> {
    Ok(IssueFollower {
        id: row.try_get("id")?,
        issue_id: row.try_get("issue_id")?,
        user_id: row.try_get("user_id")?,
    })
}

async fn list_project_issue_followers(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<Vec<IssueFollower>, ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT f.id, f.issue_id, f.user_id
        FROM local_issue_followers f
        JOIN local_issues i ON i.id = f.issue_id
        WHERE i.project_id = ?
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(issue_follower_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

fn issue_relationship_from_row(row: &SqliteRow) -> Result<IssueRelationship, sqlx::Error> {
    Ok(IssueRelationship {
        id: row.try_get("id")?,
        issue_id: row.try_get("issue_id")?,
        related_issue_id: row.try_get("related_issue_id")?,
        relationship_type: relationship_type_from_str(row.try_get("relationship_type")?),
        created_at: row.try_get("created_at")?,
    })
}

async fn list_project_issue_relationships(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<Vec<IssueRelationship>, ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT r.id, r.issue_id, r.related_issue_id, r.relationship_type, r.created_at
        FROM local_issue_relationships r
        JOIN local_issues i ON i.id = r.issue_id
        WHERE i.project_id = ?
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(issue_relationship_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

fn issue_comment_from_row(row: &SqliteRow) -> Result<IssueComment, sqlx::Error> {
    Ok(IssueComment {
        id: row.try_get("id")?,
        issue_id: row.try_get("issue_id")?,
        author_id: row.try_get("author_id")?,
        parent_id: row.try_get("parent_id")?,
        message: row.try_get("message")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

async fn list_issue_comments(
    pool: &SqlitePool,
    issue_id: Uuid,
) -> Result<Vec<IssueComment>, ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT id, issue_id, author_id, parent_id, message, created_at, updated_at
        FROM local_issue_comments
        WHERE issue_id = ?
        ORDER BY created_at ASC
        "#,
    )
    .bind(issue_id)
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(issue_comment_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

async fn get_issue_comment(pool: &SqlitePool, comment_id: Uuid) -> Result<IssueComment, ApiError> {
    let row = sqlx::query(
        r#"
        SELECT id, issue_id, author_id, parent_id, message, created_at, updated_at
        FROM local_issue_comments
        WHERE id = ?
        "#,
    )
    .bind(comment_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Issue comment not found".to_string()))?;

    issue_comment_from_row(&row).map_err(ApiError::from)
}

fn issue_comment_reaction_from_row(
    row: &SqliteRow,
) -> Result<IssueCommentReaction, sqlx::Error> {
    Ok(IssueCommentReaction {
        id: row.try_get("id")?,
        comment_id: row.try_get("comment_id")?,
        user_id: row.try_get("user_id")?,
        emoji: row.try_get("emoji")?,
        created_at: row.try_get("created_at")?,
    })
}

async fn list_issue_comment_reactions(
    pool: &SqlitePool,
    issue_id: Uuid,
) -> Result<Vec<IssueCommentReaction>, ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT r.id, r.comment_id, r.user_id, r.emoji, r.created_at
        FROM local_issue_comment_reactions r
        JOIN local_issue_comments c ON c.id = r.comment_id
        WHERE c.issue_id = ?
        ORDER BY r.created_at ASC
        "#,
    )
    .bind(issue_id)
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(issue_comment_reaction_from_row)
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::from)
}

async fn get_issue_comment_reaction(
    pool: &SqlitePool,
    reaction_id: Uuid,
) -> Result<IssueCommentReaction, ApiError> {
    let row = sqlx::query(
        r#"
        SELECT id, comment_id, user_id, emoji, created_at
        FROM local_issue_comment_reactions
        WHERE id = ?
        "#,
    )
    .bind(reaction_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Issue comment reaction not found".to_string()))?;

    issue_comment_reaction_from_row(&row).map_err(ApiError::from)
}

async fn list_project_workspaces(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<Vec<Workspace>, ApiError> {
    let workspaces = sqlx::query_as::<_, Workspace>(
        r#"
        SELECT
            w.id,
            i.project_id,
            ? AS owner_user_id,
            i.id AS issue_id,
            w.id AS local_workspace_id,
            w.name,
            w.archived,
            NULL AS files_changed,
            NULL AS lines_added,
            NULL AS lines_removed,
            w.created_at,
            w.updated_at
        FROM workspaces w
        JOIN local_workspace_links l ON l.workspace_id = w.id
        JOIN local_issues i ON i.id = l.issue_id
        WHERE l.project_id = ?
        ORDER BY w.updated_at DESC
        "#,
    )
    .bind(local_user_id())
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(workspaces)
}

async fn list_user_workspaces(pool: &SqlitePool) -> Result<Vec<Workspace>, ApiError> {
    let workspaces = sqlx::query_as::<_, Workspace>(
        r#"
        SELECT
            w.id,
            i.project_id,
            ? AS owner_user_id,
            i.id AS issue_id,
            w.id AS local_workspace_id,
            w.name,
            w.archived,
            NULL AS files_changed,
            NULL AS lines_added,
            NULL AS lines_removed,
            w.created_at,
            w.updated_at
        FROM workspaces w
        JOIN local_workspace_links l ON l.workspace_id = w.id
        JOIN local_issues i ON i.id = l.issue_id
        ORDER BY w.updated_at DESC
        "#,
    )
    .bind(local_user_id())
    .fetch_all(pool)
    .await?;

    Ok(workspaces)
}

async fn list_organizations() -> ResponseJson<ListOrganizationsResponse> {
    let now = Utc::now();
    ResponseJson(ListOrganizationsResponse {
        organizations: vec![OrganizationWithRole {
            id: local_org_id(),
            name: "Local".to_string(),
            slug: "local".to_string(),
            is_personal: true,
            issue_prefix: "LOCAL".to_string(),
            created_at: now,
            updated_at: now,
            user_role: MemberRole::Admin,
        }],
    })
}

async fn list_members(
    Path(_org_id): Path<Uuid>,
) -> ResponseJson<ListMembersResponse> {
    ResponseJson(ListMembersResponse {
        members: vec![OrganizationMemberWithProfile {
            user_id: local_user_id(),
            role: MemberRole::Admin,
            joined_at: Utc::now(),
            first_name: Some("Local".to_string()),
            last_name: Some("User".to_string()),
            username: Some("local".to_string()),
            email: Some("local@vibe-kanban.local".to_string()),
            avatar_url: None,
        }],
    })
}

async fn fallback_organization_members(
    Query(query): Query<OrganizationQuery>,
) -> ResponseJson<Value> {
    if query.organization_id != Some(local_org_id()) {
        return empty_rows("organization_member_metadata");
    }

    ResponseJson(json!({
        "organization_member_metadata": [OrganizationMember {
            organization_id: local_org_id(),
            user_id: local_user_id(),
            role: MemberRole::Admin,
            joined_at: Utc::now(),
            last_seen_at: None,
        }]
    }))
}

async fn fallback_users(Query(query): Query<OrganizationQuery>) -> ResponseJson<Value> {
    if query.organization_id != Some(local_org_id()) {
        return empty_rows("users");
    }

    ResponseJson(json!({
        "users": [User {
            id: local_user_id(),
            email: "local@vibe-kanban.local".to_string(),
            first_name: Some("Local".to_string()),
            last_name: Some("User".to_string()),
            username: Some("local".to_string()),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }]
    }))
}

async fn fallback_projects(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<OrganizationQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    if query.organization_id != Some(local_org_id()) {
        return Ok(empty_rows("projects"));
    }

    let projects = list_local_projects(&deployment.db().pool).await?;
    Ok(ResponseJson(json!({ "projects": projects })))
}

async fn fallback_project_statuses(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(project_id) = query.project_id else {
        return Ok(empty_rows("project_statuses"));
    };

    let statuses = ensure_default_statuses(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(json!({ "project_statuses": statuses })))
}

async fn fallback_issues(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(project_id) = query.project_id else {
        return Ok(empty_rows("issues"));
    };

    let issues = list_project_issues(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(json!({ "issues": issues })))
}

async fn fallback_tags(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(project_id) = query.project_id else {
        return Ok(empty_rows("tags"));
    };

    let tags = list_project_tags(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(json!({ "tags": tags })))
}

async fn fallback_issue_tags(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(project_id) = query.project_id else {
        return Ok(empty_rows("issue_tags"));
    };

    let issue_tags = list_project_issue_tags(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(json!({ "issue_tags": issue_tags })))
}

async fn fallback_issue_assignees(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(project_id) = query.project_id else {
        return Ok(empty_rows("issue_assignees"));
    };

    let issue_assignees = list_project_issue_assignees(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(json!({ "issue_assignees": issue_assignees })))
}

async fn fallback_issue_followers(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(project_id) = query.project_id else {
        return Ok(empty_rows("issue_followers"));
    };

    let issue_followers = list_project_issue_followers(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(json!({ "issue_followers": issue_followers })))
}

async fn fallback_issue_relationships(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(project_id) = query.project_id else {
        return Ok(empty_rows("issue_relationships"));
    };

    let issue_relationships =
        list_project_issue_relationships(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(json!({ "issue_relationships": issue_relationships })))
}

async fn fallback_pull_requests() -> ResponseJson<Value> {
    empty_rows("pull_requests")
}

async fn fallback_pull_request_issues() -> ResponseJson<Value> {
    empty_rows("pull_request_issues")
}

async fn fallback_project_workspaces(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(project_id) = query.project_id else {
        return Ok(empty_rows("workspaces"));
    };

    let workspaces = list_project_workspaces(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(json!({ "workspaces": workspaces })))
}

async fn fallback_user_workspaces(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<UserQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    if query.user_id.is_some_and(|user_id| user_id != local_user_id()) {
        return Ok(empty_rows("workspaces"));
    }

    let workspaces = list_user_workspaces(&deployment.db().pool).await?;
    Ok(ResponseJson(json!({ "workspaces": workspaces })))
}

async fn fallback_notifications() -> ResponseJson<Value> {
    empty_rows("notifications")
}

async fn fallback_issue_comments(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<IssueQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(issue_id) = query.issue_id else {
        return Ok(empty_rows("issue_comments"));
    };

    let issue_comments = list_issue_comments(&deployment.db().pool, issue_id).await?;
    Ok(ResponseJson(json!({ "issue_comments": issue_comments })))
}

async fn fallback_issue_comment_reactions(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<IssueQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let Some(issue_id) = query.issue_id else {
        return Ok(empty_rows("issue_comment_reactions"));
    };

    let issue_comment_reactions =
        list_issue_comment_reactions(&deployment.db().pool, issue_id).await?;
    Ok(ResponseJson(json!({ "issue_comment_reactions": issue_comment_reactions })))
}

async fn create_project(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateProjectRequest>,
) -> Result<ResponseJson<MutationResponse<Project>>, ApiError> {
    let data = create_local_project(&deployment.db().pool, request).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn get_project(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<Project>, ApiError> {
    Ok(ResponseJson(
        get_local_project(&deployment.db().pool, project_id).await?,
    ))
}

async fn update_project(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    Json(changes): Json<UpdateProjectRequest>,
) -> Result<ResponseJson<MutationResponse<Project>>, ApiError> {
    let data = update_local_project(&deployment.db().pool, project_id, changes).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn bulk_update_projects(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<BulkUpdateProjectsRequest>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    for update in request.updates {
        update_local_project(&deployment.db().pool, update.id, update.changes).await?;
    }

    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn delete_project(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(project_id)
        .execute(&deployment.db().pool)
        .await?;

    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn create_project_status(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateProjectStatusRequest>,
) -> Result<ResponseJson<MutationResponse<ProjectStatus>>, ApiError> {
    let data = create_local_status(&deployment.db().pool, request).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn update_project_status(
    State(deployment): State<DeploymentImpl>,
    Path(status_id): Path<Uuid>,
    Json(changes): Json<UpdateProjectStatusRequest>,
) -> Result<ResponseJson<MutationResponse<ProjectStatus>>, ApiError> {
    let data = update_local_status(&deployment.db().pool, status_id, changes).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn bulk_update_project_statuses(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<BulkUpdateProjectStatusesRequest>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    for update in request.updates {
        update_local_status(&deployment.db().pool, update.id, update.changes).await?;
    }

    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn delete_project_status(
    State(deployment): State<DeploymentImpl>,
    Path(status_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM local_project_statuses WHERE id = ?")
        .bind(status_id)
        .execute(&deployment.db().pool)
        .await?;

    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn create_issue(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueRequest>,
) -> Result<ResponseJson<MutationResponse<Issue>>, ApiError> {
    let data = create_local_issue(&deployment.db().pool, request).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn update_issue(
    State(deployment): State<DeploymentImpl>,
    Path(issue_id): Path<Uuid>,
    Json(changes): Json<UpdateIssueRequest>,
) -> Result<ResponseJson<MutationResponse<Issue>>, ApiError> {
    let data = update_local_issue(&deployment.db().pool, issue_id, changes).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn bulk_update_issues(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<BulkUpdateIssuesRequest>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    for update in request.updates {
        update_local_issue(&deployment.db().pool, update.id, update.changes).await?;
    }

    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn delete_issue(
    State(deployment): State<DeploymentImpl>,
    Path(issue_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM local_issues WHERE id = ?")
        .bind(issue_id)
        .execute(&deployment.db().pool)
        .await?;

    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn create_tag(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateTagRequest>,
) -> Result<ResponseJson<MutationResponse<Tag>>, ApiError> {
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query("INSERT INTO local_tags (id, project_id, name, color) VALUES (?, ?, ?, ?)")
        .bind(id)
        .bind(request.project_id)
        .bind(request.name)
        .bind(request.color)
        .execute(&deployment.db().pool)
        .await?;
    let data = get_local_tag(&deployment.db().pool, id).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn update_tag(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
    Json(changes): Json<UpdateTagRequest>,
) -> Result<ResponseJson<MutationResponse<Tag>>, ApiError> {
    let existing = get_local_tag(&deployment.db().pool, tag_id).await?;
    sqlx::query("UPDATE local_tags SET name = ?, color = ? WHERE id = ?")
        .bind(changes.name.unwrap_or(existing.name))
        .bind(changes.color.unwrap_or(existing.color))
        .bind(tag_id)
        .execute(&deployment.db().pool)
        .await?;
    let data = get_local_tag(&deployment.db().pool, tag_id).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn delete_tag(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM local_tags WHERE id = ?")
        .bind(tag_id)
        .execute(&deployment.db().pool)
        .await?;
    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn create_issue_tag(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueTagRequest>,
) -> Result<ResponseJson<MutationResponse<IssueTag>>, ApiError> {
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query("INSERT OR IGNORE INTO local_issue_tags (id, issue_id, tag_id) VALUES (?, ?, ?)")
        .bind(id)
        .bind(request.issue_id)
        .bind(request.tag_id)
        .execute(&deployment.db().pool)
        .await?;
    let data = IssueTag {
        id,
        issue_id: request.issue_id,
        tag_id: request.tag_id,
    };
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn delete_issue_tag(
    State(deployment): State<DeploymentImpl>,
    Path(issue_tag_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM local_issue_tags WHERE id = ?")
        .bind(issue_tag_id)
        .execute(&deployment.db().pool)
        .await?;
    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn create_issue_assignee(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueAssigneeRequest>,
) -> Result<ResponseJson<MutationResponse<IssueAssignee>>, ApiError> {
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query(
        "INSERT OR IGNORE INTO local_issue_assignees (id, issue_id, user_id) VALUES (?, ?, ?)",
    )
    .bind(id)
    .bind(request.issue_id)
    .bind(request.user_id)
    .execute(&deployment.db().pool)
    .await?;

    let data = IssueAssignee {
        id,
        issue_id: request.issue_id,
        user_id: request.user_id,
        assigned_at: Utc::now(),
    };
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn delete_issue_assignee(
    State(deployment): State<DeploymentImpl>,
    Path(issue_assignee_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM local_issue_assignees WHERE id = ?")
        .bind(issue_assignee_id)
        .execute(&deployment.db().pool)
        .await?;
    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn create_issue_follower(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueFollowerRequest>,
) -> Result<ResponseJson<MutationResponse<IssueFollower>>, ApiError> {
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query("INSERT OR IGNORE INTO local_issue_followers (id, issue_id, user_id) VALUES (?, ?, ?)")
        .bind(id)
        .bind(request.issue_id)
        .bind(request.user_id)
        .execute(&deployment.db().pool)
        .await?;

    let data = IssueFollower {
        id,
        issue_id: request.issue_id,
        user_id: request.user_id,
    };
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn delete_issue_follower(
    State(deployment): State<DeploymentImpl>,
    Path(issue_follower_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM local_issue_followers WHERE id = ?")
        .bind(issue_follower_id)
        .execute(&deployment.db().pool)
        .await?;
    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn create_issue_relationship(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueRelationshipRequest>,
) -> Result<ResponseJson<MutationResponse<IssueRelationship>>, ApiError> {
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query(
        r#"
        INSERT INTO local_issue_relationships
            (id, issue_id, related_issue_id, relationship_type)
        VALUES (?, ?, ?, ?)
        "#,
    )
    .bind(id)
    .bind(request.issue_id)
    .bind(request.related_issue_id)
    .bind(relationship_type_to_str(request.relationship_type))
    .execute(&deployment.db().pool)
    .await?;

    let data = IssueRelationship {
        id,
        issue_id: request.issue_id,
        related_issue_id: request.related_issue_id,
        relationship_type: request.relationship_type,
        created_at: Utc::now(),
    };
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn delete_issue_relationship(
    State(deployment): State<DeploymentImpl>,
    Path(relationship_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM local_issue_relationships WHERE id = ?")
        .bind(relationship_id)
        .execute(&deployment.db().pool)
        .await?;
    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn create_issue_comment(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueCommentRequest>,
) -> Result<ResponseJson<MutationResponse<IssueComment>>, ApiError> {
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query(
        r#"
        INSERT INTO local_issue_comments
            (id, issue_id, author_id, parent_id, message)
        VALUES (?, ?, ?, ?, ?)
        "#,
    )
    .bind(id)
    .bind(request.issue_id)
    .bind(local_user_id())
    .bind(request.parent_id)
    .bind(request.message)
    .execute(&deployment.db().pool)
    .await?;

    let data = get_issue_comment(&deployment.db().pool, id).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn update_issue_comment(
    State(deployment): State<DeploymentImpl>,
    Path(comment_id): Path<Uuid>,
    Json(changes): Json<UpdateIssueCommentRequest>,
) -> Result<ResponseJson<MutationResponse<IssueComment>>, ApiError> {
    let existing = get_issue_comment(&deployment.db().pool, comment_id).await?;
    sqlx::query(
        r#"
        UPDATE local_issue_comments
        SET message = ?, parent_id = ?, updated_at = datetime('now', 'subsec')
        WHERE id = ?
        "#,
    )
    .bind(changes.message.unwrap_or(existing.message))
    .bind(changes.parent_id.unwrap_or(existing.parent_id))
    .bind(comment_id)
    .execute(&deployment.db().pool)
    .await?;

    let data = get_issue_comment(&deployment.db().pool, comment_id).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn delete_issue_comment(
    State(deployment): State<DeploymentImpl>,
    Path(comment_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM local_issue_comments WHERE id = ?")
        .bind(comment_id)
        .execute(&deployment.db().pool)
        .await?;
    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

async fn create_issue_comment_reaction(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueCommentReactionRequest>,
) -> Result<ResponseJson<MutationResponse<IssueCommentReaction>>, ApiError> {
    let id = request.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query(
        r#"
        INSERT OR IGNORE INTO local_issue_comment_reactions
            (id, comment_id, user_id, emoji)
        VALUES (?, ?, ?, ?)
        "#,
    )
    .bind(id)
    .bind(request.comment_id)
    .bind(local_user_id())
    .bind(request.emoji)
    .execute(&deployment.db().pool)
    .await?;

    let data = get_issue_comment_reaction(&deployment.db().pool, id).await?;
    Ok(ResponseJson(MutationResponse { data, txid: txid() }))
}

async fn delete_issue_comment_reaction(
    State(deployment): State<DeploymentImpl>,
    Path(reaction_id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    sqlx::query("DELETE FROM local_issue_comment_reactions WHERE id = ?")
        .bind(reaction_id)
        .execute(&deployment.db().pool)
        .await?;
    Ok(ResponseJson(DeleteResponse { txid: txid() }))
}

#[cfg(test)]
mod tests {
    use api_types::{CreateIssueRequest, IssuePriority};
    use serde_json::Value;
    use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
    use uuid::Uuid;

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite");

        for statement in [
            r#"
            CREATE TABLE projects (
                id BLOB PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
            )
            "#,
            r#"
            CREATE TABLE local_project_statuses (
                id BLOB PRIMARY KEY,
                project_id BLOB NOT NULL,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                hidden INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
            )
            "#,
            r#"
            CREATE TABLE local_issues (
                id BLOB PRIMARY KEY,
                project_id BLOB NOT NULL,
                issue_number INTEGER NOT NULL,
                simple_id TEXT NOT NULL,
                status_id BLOB NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                priority TEXT,
                start_date TEXT,
                target_date TEXT,
                completed_at TEXT,
                sort_order REAL NOT NULL,
                parent_issue_id BLOB,
                parent_issue_sort_order REAL,
                extension_metadata TEXT NOT NULL DEFAULT 'null',
                creator_user_id BLOB,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
            )
            "#,
        ] {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("create test schema");
        }

        pool
    }

    #[tokio::test]
    async fn local_issue_create_seeds_default_statuses_and_simple_id() {
        let pool = setup_pool().await;
        let project_id = Uuid::new_v4();

        sqlx::query("INSERT INTO projects (id, name) VALUES (?, ?)")
            .bind(project_id)
            .bind("Local Project")
            .execute(&pool)
            .await
            .expect("insert project");

        let statuses = super::ensure_default_statuses(&pool, project_id)
            .await
            .expect("seed statuses");

        assert_eq!(statuses.len(), 5);
        assert_eq!(statuses[0].name, "Todo");
        assert_eq!(statuses[4].name, "Cancelled");
        assert!(statuses[4].hidden);

        let issue = super::create_local_issue(
            &pool,
            CreateIssueRequest {
                id: None,
                project_id,
                status_id: statuses[0].id,
                title: "First local issue".to_string(),
                description: Some("stored only in SQLite".to_string()),
                priority: Some(IssuePriority::High),
                start_date: None,
                target_date: None,
                completed_at: None,
                sort_order: 1001.0,
                parent_issue_id: None,
                parent_issue_sort_order: None,
                extension_metadata: Value::Null,
            },
        )
        .await
        .expect("create local issue");

        assert_eq!(issue.project_id, project_id);
        assert_eq!(issue.issue_number, 1);
        assert_eq!(issue.simple_id, "LOCAL-1");
        assert_eq!(issue.title, "First local issue");
        assert_eq!(issue.priority, Some(IssuePriority::High));
    }
}
