//! Local SQLite-backed implementation of the cloud `crates/remote` `/v1/*`
//! API surface.
//!
//! The frontend's Electric `useShape` collections are configured with
//! `fallback` URLs of the form `/v1/fallback/<table>` and `mutation` URLs of
//! the form `/v1/<entity>` (see `shared/remote-types.ts`). When the desktop
//! client runs in `local_only` mode `lockElectricToFallback()` switches every
//! collection into REST polling, so all kanban data flows through the
//! handlers in this module. Without this router, the frontend gets a 404 for
//! `/v1/fallback/projects` and the kanban board never renders.
//!
//! Response conventions:
//!
//! - **Fallback GET**: returns a raw `{ "<table>": [rows] }` JSON object.
//!   The frontend's `extractFallbackRows(payload, table)` helper looks up
//!   the array by table name. We must NOT wrap responses with `ApiResponse`
//!   because the fallback decoder doesn't unwrap it.
//! - **Mutation POST/PATCH**: returns `MutationResponse<T> { data, txid }`.
//!   The frontend only reads `txid` (a stable `0` is fine in fallback mode
//!   because polling re-syncs the snapshot every 30s).
//! - **Mutation DELETE**: returns `{ "txid": 0 }`.

use api_types::{
    BulkUpdateProjectsRequest, CreateIssueAssigneeRequest, CreateIssueRelationshipRequest,
    CreateIssueRequest, CreateIssueTagRequest, CreateProjectRequest, CreateProjectStatusRequest,
    CreateTagRequest, DeleteResponse, Issue, IssueAssignee, IssueRelationship, IssueTag,
    ListOrganizationsResponse, MutationResponse, ProjectStatus, Tag, UpdateIssueRequest,
    UpdateProjectRequest, UpdateProjectStatusRequest, UpdateTagRequest,
};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{delete, get, patch, post},
};
use deployment::Deployment;
use serde::Deserialize;
use serde_json::{Value, json};
use services::services::local_remote::LocalRemote;
use sqlx::Row;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Bulk-update body shared across `/v1/<entity>/bulk` mutation endpoints.
/// Each entry is `{ id, ...changes }` (frontend code in
/// `packages/web-core/src/shared/lib/electric/collections.ts:684` flattens
/// `id` + `changes` into a single object).
#[derive(Deserialize)]
struct BulkUpdateBody<T> {
    updates: Vec<BulkItem<T>>,
}

#[derive(Deserialize)]
struct BulkItem<T> {
    id: Uuid,
    #[serde(flatten)]
    changes: T,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        // Fallback GETs (Electric `useShape` -> REST polling)
        .route("/fallback/projects", get(fallback_projects))
        .route("/fallback/project_statuses", get(fallback_project_statuses))
        .route("/fallback/tags", get(fallback_tags))
        .route("/fallback/issues", get(fallback_issues))
        .route("/fallback/issue_assignees", get(fallback_issue_assignees))
        .route("/fallback/issue_tags", get(fallback_issue_tags))
        .route(
            "/fallback/issue_relationships",
            get(fallback_issue_relationships),
        )
        .route(
            "/fallback/organization_members",
            get(fallback_organization_members),
        )
        .route("/fallback/users", get(fallback_users))
        .route("/fallback/user_workspaces", get(fallback_user_workspaces))
        .route(
            "/fallback/project_workspaces",
            get(fallback_project_workspaces),
        )
        // Stubs for tables outside the local-only "core" scope.
        .route(
            "/fallback/notifications",
            get(|| stub_table("notifications")),
        )
        .route(
            "/fallback/issue_followers",
            get(|| stub_table("issue_followers")),
        )
        .route(
            "/fallback/issue_comments",
            get(|| stub_table("issue_comments")),
        )
        .route(
            "/fallback/issue_comment_reactions",
            get(|| stub_table("issue_comment_reactions")),
        )
        .route(
            "/fallback/pull_requests",
            get(|| stub_table("pull_requests")),
        )
        .route(
            "/fallback/pull_request_issues",
            get(|| stub_table("pull_request_issues")),
        )
        // Organization reads — mirrors cloud `/v1/organizations` so
        // `organizationsApi.getUserOrganizations()` / `firstProjectDestination`
        // resolves the seeded "Local" org instead of 404ing into the SPA
        // fallback (which made `RootRedirectPage` bounce to /workspaces/create).
        .route("/organizations", get(list_organizations))
        // Project mutations
        .route("/projects", post(create_project))
        .route("/projects/bulk", post(bulk_update_projects))
        .route(
            "/projects/{id}",
            patch(update_project).delete(delete_project),
        )
        // Project status mutations
        .route("/project_statuses", post(create_project_status))
        .route("/project_statuses/bulk", post(bulk_update_project_statuses))
        .route(
            "/project_statuses/{id}",
            patch(update_project_status).delete(delete_project_status),
        )
        // Tag mutations
        .route("/tags", post(create_tag))
        .route("/tags/{id}", patch(update_tag).delete(delete_tag))
        // Issue mutations
        .route("/issues", post(create_issue))
        .route("/issues/bulk", post(bulk_update_issues))
        .route("/issues/{id}", patch(update_issue).delete(delete_issue))
        // Issue assignee mutations
        .route("/issue_assignees", post(create_issue_assignee))
        .route("/issue_assignees/{id}", delete(delete_issue_assignee))
        // Issue tag mutations
        .route("/issue_tags", post(create_issue_tag))
        .route("/issue_tags/{id}", delete(delete_issue_tag))
        // Issue relationship mutations
        .route("/issue_relationships", post(create_issue_relationship))
        .route(
            "/issue_relationships/{id}",
            delete(delete_issue_relationship),
        )
        // Stubs for entities outside core scope. Returning a successful
        // MutationResponse (txid:0) prevents UI errors when the user tries
        // to e.g. mark a notification as read — the action is silently
        // dropped instead of crashing.
        .route("/notifications", post(stub_mutation_post))
        .route(
            "/notifications/{id}",
            patch(stub_mutation_patch).delete(stub_mutation_delete),
        )
        .route("/issue_followers", post(stub_mutation_post))
        .route("/issue_followers/{id}", delete(stub_mutation_delete))
        .route("/issue_comments", post(stub_mutation_post))
        .route(
            "/issue_comments/{id}",
            patch(stub_mutation_patch).delete(stub_mutation_delete),
        )
        .route("/issue_comment_reactions", post(stub_mutation_post))
        .route(
            "/issue_comment_reactions/{id}",
            patch(stub_mutation_patch).delete(stub_mutation_delete),
        )
        .route("/pull_request_issues", post(stub_mutation_post))
        .route("/pull_request_issues/{id}", delete(stub_mutation_delete))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn local_remote(deployment: &DeploymentImpl) -> LocalRemote {
    deployment
        .local_remote()
        .expect("local_remote configured (server is in local_only mode)")
}

/// `MutationResponse` is `{ data, txid }` but lacks `Serialize` outside of
/// generic contexts; this helper builds the JSON shape directly.
fn mutation_response<T: serde::Serialize>(data: T) -> Value {
    json!({ "data": data, "txid": 0 })
}

async fn stub_table(table: &'static str) -> ResponseJson<Value> {
    ResponseJson(json!({ table: [] }))
}

async fn stub_mutation_post(_body: Json<Value>) -> ResponseJson<Value> {
    ResponseJson(json!({ "data": null, "txid": 0 }))
}

async fn stub_mutation_patch(_body: Json<Value>) -> ResponseJson<Value> {
    ResponseJson(json!({ "data": null, "txid": 0 }))
}

async fn stub_mutation_delete() -> ResponseJson<DeleteResponse> {
    ResponseJson(DeleteResponse { txid: 0 })
}

// ---------------------------------------------------------------------------
// Fallback queries (parametrised by the same fields as the cloud `/v1/shape/*`)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct OrgIdQuery {
    organization_id: Uuid,
}

#[derive(Deserialize)]
struct ProjectIdQuery {
    project_id: Uuid,
}

#[derive(Deserialize)]
struct UserIdQuery {
    #[allow(dead_code)]
    owner_user_id: Uuid,
}

async fn list_organizations(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ListOrganizationsResponse>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.list_organizations().await?;
    Ok(ResponseJson(resp))
}

async fn fallback_projects(
    State(deployment): State<DeploymentImpl>,
    Query(q): Query<OrgIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.list_remote_projects(q.organization_id).await?;
    Ok(ResponseJson(json!({ "projects": resp.projects })))
}

async fn fallback_project_statuses(
    State(deployment): State<DeploymentImpl>,
    Query(q): Query<ProjectIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.list_project_statuses(q.project_id).await?;
    Ok(ResponseJson(
        json!({ "project_statuses": resp.project_statuses }),
    ))
}

async fn fallback_tags(
    State(deployment): State<DeploymentImpl>,
    Query(q): Query<ProjectIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.list_tags(q.project_id).await?;
    Ok(ResponseJson(json!({ "tags": resp.tags })))
}

async fn fallback_issues(
    State(deployment): State<DeploymentImpl>,
    Query(q): Query<ProjectIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.list_issues(q.project_id).await?;
    Ok(ResponseJson(json!({ "issues": resp.issues })))
}

/// `issue_assignees` shape is keyed by `project_id` (not `issue_id`), so we
/// need a join through `remote_issues`. `LocalRemote::list_issue_assignees`
/// is per-issue and not directly reusable here.
async fn fallback_issue_assignees(
    State(deployment): State<DeploymentImpl>,
    Query(q): Query<ProjectIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    let rows = sqlx::query(
        r#"SELECT a.id, a.issue_id, a.user_id, a.assigned_at
           FROM remote_issue_assignees a
           JOIN remote_issues i ON i.id = a.issue_id
           WHERE i.project_id = ?1
           ORDER BY a.assigned_at ASC"#,
    )
    .bind(q.project_id)
    .fetch_all(&pool)
    .await
    .map_err(ApiError::Database)?;
    let assignees: Vec<IssueAssignee> = rows
        .into_iter()
        .map(|r| IssueAssignee {
            id: r.get("id"),
            issue_id: r.get("issue_id"),
            user_id: r.get("user_id"),
            assigned_at: r.get("assigned_at"),
        })
        .collect();
    Ok(ResponseJson(json!({ "issue_assignees": assignees })))
}

async fn fallback_issue_tags(
    State(deployment): State<DeploymentImpl>,
    Query(q): Query<ProjectIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    let rows = sqlx::query(
        r#"SELECT t.id, t.issue_id, t.tag_id
           FROM remote_issue_tags t
           JOIN remote_issues i ON i.id = t.issue_id
           WHERE i.project_id = ?1"#,
    )
    .bind(q.project_id)
    .fetch_all(&pool)
    .await
    .map_err(ApiError::Database)?;
    let issue_tags: Vec<IssueTag> = rows
        .into_iter()
        .map(|r| IssueTag {
            id: r.get("id"),
            issue_id: r.get("issue_id"),
            tag_id: r.get("tag_id"),
        })
        .collect();
    Ok(ResponseJson(json!({ "issue_tags": issue_tags })))
}

async fn fallback_issue_relationships(
    State(deployment): State<DeploymentImpl>,
    Query(q): Query<ProjectIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    let rows = sqlx::query(
        r#"SELECT r.id, r.issue_id, r.related_issue_id, r.relationship_type, r.created_at
           FROM remote_issue_relationships r
           JOIN remote_issues i ON i.id = r.issue_id
           WHERE i.project_id = ?1"#,
    )
    .bind(q.project_id)
    .fetch_all(&pool)
    .await
    .map_err(ApiError::Database)?;
    let relationships: Vec<IssueRelationship> = rows
        .into_iter()
        .map(|r| {
            let kind: String = r.get("relationship_type");
            IssueRelationship {
                id: r.get("id"),
                issue_id: r.get("issue_id"),
                related_issue_id: r.get("related_issue_id"),
                relationship_type: parse_relationship_type(&kind),
                created_at: r.get("created_at"),
            }
        })
        .collect();
    Ok(ResponseJson(
        json!({ "issue_relationships": relationships }),
    ))
}

/// `ORGANIZATION_MEMBERS_SHAPE` declares its table as
/// `organization_member_metadata` (not `members`!), so we serialize using
/// that exact key — `extractFallbackRows` looks it up verbatim.
async fn fallback_organization_members(
    State(deployment): State<DeploymentImpl>,
    Query(q): Query<OrgIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.list_organization_members(q.organization_id).await?;
    Ok(ResponseJson(
        json!({ "organization_member_metadata": resp.members }),
    ))
}

/// `USERS_SHAPE` is keyed by `organization_id` and yields one row per
/// member of the org. For local-only mode this is always just the seeded
/// local user (matches `services::local_remote::LOCAL_USER_ID`).
async fn fallback_users(
    State(deployment): State<DeploymentImpl>,
    Query(_q): Query<OrgIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    let rows =
        sqlx::query(r#"SELECT id, email, display_name, avatar_url, created_at FROM remote_users"#)
            .fetch_all(&pool)
            .await
            .map_err(ApiError::Database)?;
    let users: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.get::<Uuid, _>("id"),
                "email": r.get::<Option<String>, _>("email"),
                "first_name": r.get::<Option<String>, _>("display_name"),
                "last_name": Value::Null,
                "username": r.get::<Option<String>, _>("display_name"),
                "avatar_url": r.get::<Option<String>, _>("avatar_url"),
                "created_at": r.get::<String, _>("created_at"),
            })
        })
        .collect();
    Ok(ResponseJson(json!({ "users": users })))
}

async fn fallback_user_workspaces(
    State(deployment): State<DeploymentImpl>,
    Query(_q): Query<UserIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    list_workspaces(&deployment, None).await
}

async fn fallback_project_workspaces(
    State(deployment): State<DeploymentImpl>,
    Query(q): Query<ProjectIdQuery>,
) -> Result<ResponseJson<Value>, ApiError> {
    list_workspaces(&deployment, Some(q.project_id)).await
}

async fn list_workspaces(
    deployment: &DeploymentImpl,
    project_id: Option<Uuid>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    let rows = match project_id {
        Some(pid) => sqlx::query(
            r#"SELECT id, project_id, owner_user_id, issue_id, local_workspace_id, name,
                      archived, files_changed, lines_added, lines_removed, created_at, updated_at
               FROM remote_workspaces WHERE project_id = ?1
               ORDER BY created_at DESC"#,
        )
        .bind(pid)
        .fetch_all(&pool)
        .await
        .map_err(ApiError::Database)?,
        None => sqlx::query(
            r#"SELECT id, project_id, owner_user_id, issue_id, local_workspace_id, name,
                      archived, files_changed, lines_added, lines_removed, created_at, updated_at
               FROM remote_workspaces ORDER BY created_at DESC"#,
        )
        .fetch_all(&pool)
        .await
        .map_err(ApiError::Database)?,
    };
    let workspaces: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.get::<Uuid, _>("id"),
                "project_id": r.get::<Uuid, _>("project_id"),
                "owner_user_id": r.get::<Uuid, _>("owner_user_id"),
                "issue_id": r.get::<Option<Uuid>, _>("issue_id"),
                "local_workspace_id": r.get::<Option<Uuid>, _>("local_workspace_id"),
                "name": r.get::<String, _>("name"),
                "archived": r.get::<bool, _>("archived"),
                "files_changed": r.get::<Option<i64>, _>("files_changed"),
                "lines_added": r.get::<Option<i64>, _>("lines_added"),
                "lines_removed": r.get::<Option<i64>, _>("lines_removed"),
                "created_at": r.get::<String, _>("created_at"),
                "updated_at": r.get::<String, _>("updated_at"),
            })
        })
        .collect();
    Ok(ResponseJson(json!({ "workspaces": workspaces })))
}

// ---------------------------------------------------------------------------
// Project mutations
// ---------------------------------------------------------------------------

async fn create_project(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<CreateProjectRequest>,
) -> Result<ResponseJson<Value>, ApiError> {
    let lr = local_remote(&deployment);
    let project = lr
        .create_remote_project(req.organization_id, &req.name, &req.color)
        .await?;
    // Seed the canonical kanban columns so the new project is immediately
    // usable from the UI without a separate "create status" step.
    lr.ensure_default_statuses(project.id).await?;
    Ok(ResponseJson(mutation_response(project)))
}

async fn update_project(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateProjectRequest>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    if let Some(name) = &req.name {
        sqlx::query(
            "UPDATE remote_projects SET name = ?2, updated_at = datetime('now', 'subsec') \
             WHERE id = ?1",
        )
        .bind(id)
        .bind(name)
        .execute(&pool)
        .await
        .map_err(ApiError::Database)?;
    }
    if let Some(color) = &req.color {
        sqlx::query(
            "UPDATE remote_projects SET color = ?2, updated_at = datetime('now', 'subsec') \
             WHERE id = ?1",
        )
        .bind(id)
        .bind(color)
        .execute(&pool)
        .await
        .map_err(ApiError::Database)?;
    }
    if let Some(sort_order) = req.sort_order {
        sqlx::query(
            "UPDATE remote_projects SET sort_order = ?2, updated_at = datetime('now', 'subsec') \
             WHERE id = ?1",
        )
        .bind(id)
        .bind(sort_order)
        .execute(&pool)
        .await
        .map_err(ApiError::Database)?;
    }
    let project = local_remote(&deployment).get_remote_project(id).await?;
    Ok(ResponseJson(mutation_response(project)))
}

async fn delete_project(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    let pool = deployment.db().pool.clone();
    sqlx::query("DELETE FROM remote_projects WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(ApiError::Database)?;
    Ok(ResponseJson(DeleteResponse { txid: 0 }))
}

async fn bulk_update_projects(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<BulkUpdateProjectsRequest>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    for item in req.updates {
        let id = item.id;
        let changes = item.changes;
        if let Some(name) = changes.name {
            sqlx::query(
                "UPDATE remote_projects SET name = ?2, updated_at = datetime('now', 'subsec') \
                 WHERE id = ?1",
            )
            .bind(id)
            .bind(name)
            .execute(&pool)
            .await
            .map_err(ApiError::Database)?;
        }
        if let Some(color) = changes.color {
            sqlx::query(
                "UPDATE remote_projects SET color = ?2, updated_at = datetime('now', 'subsec') \
                 WHERE id = ?1",
            )
            .bind(id)
            .bind(color)
            .execute(&pool)
            .await
            .map_err(ApiError::Database)?;
        }
        if let Some(sort_order) = changes.sort_order {
            sqlx::query(
                "UPDATE remote_projects SET sort_order = ?2, updated_at = datetime('now', 'subsec') \
                 WHERE id = ?1",
            )
            .bind(id)
            .bind(sort_order)
            .execute(&pool)
            .await
            .map_err(ApiError::Database)?;
        }
    }
    Ok(ResponseJson(json!({ "txid": 0 })))
}

// ---------------------------------------------------------------------------
// Project status mutations
// ---------------------------------------------------------------------------

async fn create_project_status(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<CreateProjectStatusRequest>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    let id = req.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query(
        r#"INSERT INTO remote_project_statuses (id, project_id, name, color, sort_order)
           VALUES (?1, ?2, ?3, ?4, ?5)"#,
    )
    .bind(id)
    .bind(req.project_id)
    .bind(&req.name)
    .bind(&req.color)
    .bind(req.sort_order)
    .execute(&pool)
    .await
    .map_err(ApiError::Database)?;
    let status = fetch_project_status(&pool, id).await?;
    Ok(ResponseJson(mutation_response(status)))
}

async fn update_project_status(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateProjectStatusRequest>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    if let Some(name) = &req.name {
        sqlx::query("UPDATE remote_project_statuses SET name = ?2 WHERE id = ?1")
            .bind(id)
            .bind(name)
            .execute(&pool)
            .await
            .map_err(ApiError::Database)?;
    }
    if let Some(color) = &req.color {
        sqlx::query("UPDATE remote_project_statuses SET color = ?2 WHERE id = ?1")
            .bind(id)
            .bind(color)
            .execute(&pool)
            .await
            .map_err(ApiError::Database)?;
    }
    if let Some(sort_order) = req.sort_order {
        sqlx::query("UPDATE remote_project_statuses SET sort_order = ?2 WHERE id = ?1")
            .bind(id)
            .bind(sort_order)
            .execute(&pool)
            .await
            .map_err(ApiError::Database)?;
    }
    if let Some(hidden) = req.hidden {
        sqlx::query("UPDATE remote_project_statuses SET hidden = ?2 WHERE id = ?1")
            .bind(id)
            .bind(hidden as i64)
            .execute(&pool)
            .await
            .map_err(ApiError::Database)?;
    }
    let status = fetch_project_status(&pool, id).await?;
    Ok(ResponseJson(mutation_response(status)))
}

async fn delete_project_status(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    let pool = deployment.db().pool.clone();
    sqlx::query("DELETE FROM remote_project_statuses WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(ApiError::Database)?;
    Ok(ResponseJson(DeleteResponse { txid: 0 }))
}

async fn bulk_update_project_statuses(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<BulkUpdateBody<UpdateProjectStatusRequest>>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    for item in req.updates {
        let id = item.id;
        let changes = item.changes;
        if let Some(name) = changes.name {
            sqlx::query("UPDATE remote_project_statuses SET name = ?2 WHERE id = ?1")
                .bind(id)
                .bind(name)
                .execute(&pool)
                .await
                .map_err(ApiError::Database)?;
        }
        if let Some(color) = changes.color {
            sqlx::query("UPDATE remote_project_statuses SET color = ?2 WHERE id = ?1")
                .bind(id)
                .bind(color)
                .execute(&pool)
                .await
                .map_err(ApiError::Database)?;
        }
        if let Some(sort_order) = changes.sort_order {
            sqlx::query("UPDATE remote_project_statuses SET sort_order = ?2 WHERE id = ?1")
                .bind(id)
                .bind(sort_order)
                .execute(&pool)
                .await
                .map_err(ApiError::Database)?;
        }
        if let Some(hidden) = changes.hidden {
            sqlx::query("UPDATE remote_project_statuses SET hidden = ?2 WHERE id = ?1")
                .bind(id)
                .bind(hidden as i64)
                .execute(&pool)
                .await
                .map_err(ApiError::Database)?;
        }
    }
    Ok(ResponseJson(json!({ "txid": 0 })))
}

async fn fetch_project_status(
    pool: &sqlx::SqlitePool,
    id: Uuid,
) -> Result<ProjectStatus, ApiError> {
    let row = sqlx::query(
        r#"SELECT id, project_id, name, color, sort_order, hidden, created_at
           FROM remote_project_statuses WHERE id = ?1"#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::BadRequest("Project status not found".into()))?;
    let hidden: i64 = row.get("hidden");
    Ok(ProjectStatus {
        id: row.get("id"),
        project_id: row.get("project_id"),
        name: row.get("name"),
        color: row.get("color"),
        sort_order: row.get("sort_order"),
        hidden: hidden != 0,
        created_at: row.get("created_at"),
    })
}

// ---------------------------------------------------------------------------
// Tag mutations
// ---------------------------------------------------------------------------

async fn create_tag(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<CreateTagRequest>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    let id = req.id.unwrap_or_else(Uuid::new_v4);
    sqlx::query(r#"INSERT INTO remote_tags (id, project_id, name, color) VALUES (?1, ?2, ?3, ?4)"#)
        .bind(id)
        .bind(req.project_id)
        .bind(&req.name)
        .bind(&req.color)
        .execute(&pool)
        .await
        .map_err(ApiError::Database)?;
    let tag = local_remote(&deployment).get_tag(id).await?;
    Ok(ResponseJson(mutation_response(tag)))
}

async fn update_tag(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateTagRequest>,
) -> Result<ResponseJson<Value>, ApiError> {
    let pool = deployment.db().pool.clone();
    if let Some(name) = &req.name {
        sqlx::query("UPDATE remote_tags SET name = ?2 WHERE id = ?1")
            .bind(id)
            .bind(name)
            .execute(&pool)
            .await
            .map_err(ApiError::Database)?;
    }
    if let Some(color) = &req.color {
        sqlx::query("UPDATE remote_tags SET color = ?2 WHERE id = ?1")
            .bind(id)
            .bind(color)
            .execute(&pool)
            .await
            .map_err(ApiError::Database)?;
    }
    let tag: Tag = local_remote(&deployment).get_tag(id).await?;
    Ok(ResponseJson(mutation_response(tag)))
}

async fn delete_tag(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    let pool = deployment.db().pool.clone();
    sqlx::query("DELETE FROM remote_tags WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(ApiError::Database)?;
    Ok(ResponseJson(DeleteResponse { txid: 0 }))
}

// ---------------------------------------------------------------------------
// Issue mutations
// ---------------------------------------------------------------------------

async fn create_issue(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<CreateIssueRequest>,
) -> Result<ResponseJson<MutationResponse<Issue>>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.create_issue(&req).await?;
    Ok(ResponseJson(resp))
}

async fn update_issue(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateIssueRequest>,
) -> Result<ResponseJson<MutationResponse<Issue>>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.update_issue(id, &req).await?;
    Ok(ResponseJson(resp))
}

async fn delete_issue(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    local_remote(&deployment).delete_issue(id).await?;
    Ok(ResponseJson(DeleteResponse { txid: 0 }))
}

async fn bulk_update_issues(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<BulkUpdateBody<UpdateIssueRequest>>,
) -> Result<ResponseJson<Value>, ApiError> {
    let lr = local_remote(&deployment);
    for item in req.updates {
        lr.update_issue(item.id, &item.changes).await?;
    }
    Ok(ResponseJson(json!({ "txid": 0 })))
}

// ---------------------------------------------------------------------------
// Issue assignee / tag / relationship mutations
// ---------------------------------------------------------------------------

async fn create_issue_assignee(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<CreateIssueAssigneeRequest>,
) -> Result<ResponseJson<MutationResponse<IssueAssignee>>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.create_issue_assignee(&req).await?;
    Ok(ResponseJson(resp))
}

async fn delete_issue_assignee(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    local_remote(&deployment).delete_issue_assignee(id).await?;
    Ok(ResponseJson(DeleteResponse { txid: 0 }))
}

async fn create_issue_tag(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<CreateIssueTagRequest>,
) -> Result<ResponseJson<MutationResponse<IssueTag>>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.create_issue_tag(&req).await?;
    Ok(ResponseJson(resp))
}

async fn delete_issue_tag(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    local_remote(&deployment).delete_issue_tag(id).await?;
    Ok(ResponseJson(DeleteResponse { txid: 0 }))
}

async fn create_issue_relationship(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<CreateIssueRelationshipRequest>,
) -> Result<ResponseJson<MutationResponse<IssueRelationship>>, ApiError> {
    let lr = local_remote(&deployment);
    let resp = lr.create_issue_relationship(&req).await?;
    Ok(ResponseJson(resp))
}

async fn delete_issue_relationship(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<DeleteResponse>, ApiError> {
    local_remote(&deployment)
        .delete_issue_relationship(id)
        .await?;
    Ok(ResponseJson(DeleteResponse { txid: 0 }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_relationship_type(s: &str) -> api_types::IssueRelationshipType {
    use api_types::IssueRelationshipType as R;
    // Mirror `services::local_remote::parse_relationship_type` so the
    // fallback shape returns identical values to LocalRemote queries.
    match s {
        "blocking" => R::Blocking,
        "has_duplicate" => R::HasDuplicate,
        _ => R::Related,
    }
}
