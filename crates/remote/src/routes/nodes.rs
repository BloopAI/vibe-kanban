use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::{HeaderMap, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{Span, instrument};
use uuid::Uuid;

use super::organization_members::ensure_member_access;
use crate::{
    AppState,
    auth::{NodeAuthContext, RequestContext, require_node_api_key},
    db::{
        organizations::{MemberRole, OrganizationRepository},
        swarm_projects::{SwarmProjectNode, SwarmProjectRepository},
    },
    nodes::{
        CreateNodeApiKey, HeartbeatPayload, MergeNodesResult, Node, NodeApiKey, NodeError,
        NodeExecutionProcess, NodeRegistration, NodeServiceImpl, NodeTaskAttempt,
    },
};

/// Header name for API key authentication
const API_KEY_HEADER: &str = "x-api-key";

// ============================================================================
// Router Setup
// ============================================================================

/// Creates the HTTP routes that require API key authentication for node operations.
///
/// # Examples
///
/// ```
/// let router = api_key_router();
/// // router now contains POST /nodes/register and POST /nodes/{node_id}/heartbeat
/// ```
pub fn api_key_router() -> Router<AppState> {
    Router::new()
        .route("/nodes/register", post(register_node))
        .route("/nodes/{node_id}/heartbeat", post(heartbeat))
    // Legacy project linking endpoints removed - use WebSocket LinkProject/UnlinkProject messages instead
}

/// Routes that require user JWT authentication
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/nodes/api-keys", post(create_api_key))
        .route("/nodes/api-keys", get(list_api_keys))
        .route("/nodes/api-keys/{key_id}", delete(revoke_api_key))
        .route("/nodes/api-keys/{key_id}/unblock", post(unblock_api_key))
        // User-facing node endpoints (JWT auth for frontend)
        .route("/nodes", get(list_nodes))
        .route("/nodes/{node_id}", get(get_node))
        .route("/nodes/{node_id}", delete(delete_node))
        .route("/nodes/{node_id}/projects", get(list_node_projects))
        .route(
            "/nodes/{node_id}/projects/linked",
            get(list_linked_node_projects),
        )
        .route("/nodes/{source_id}/merge-to/{target_id}", post(merge_nodes))
        .route(
            "/nodes/assignments/{assignment_id}/logs",
            get(get_assignment_logs),
        )
        .route(
            "/nodes/assignments/{assignment_id}/progress",
            get(get_assignment_progress),
        )
        .route(
            "/nodes/assignments/{assignment_id}/connection-info",
            get(get_connection_info),
        )
        .route(
            "/nodes/task-attempts/by-shared-task/{shared_task_id}",
            get(list_task_attempts_by_shared_task),
        )
        .route(
            "/nodes/task-attempts/{attempt_id}",
            get(get_node_task_attempt),
        )
}

/// Routes for node sync operations that require API key authentication.
///
/// These endpoints are used by nodes to sync projects and other data headlessly.
/// Architecture: One hive = one swarm = one organization.
/// Sync operations use API key auth only (no OAuth fallback needed).
pub fn node_sync_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/nodes", get(list_nodes_sync))
        .route("/nodes/status", get(get_node_statuses_sync))
        .route("/nodes/{node_id}/projects", get(list_node_projects_sync))
        .route(
            "/nodes/{node_id}/projects/linked",
            get(list_linked_node_projects_sync),
        )
        .route("/nodes/tasks/bulk", get(bulk_tasks_for_node_sync))
        .route("/swarm/projects", get(list_swarm_projects_sync))
        .route("/swarm/projects/{project_id}", get(get_swarm_project_sync))
        // Swarm data read endpoints (for cross-node viewing)
        .route(
            "/swarm/projects/{project_id}/tasks",
            get(list_swarm_project_tasks_sync),
        )
        .route(
            "/swarm/tasks/{shared_task_id}/attempts",
            get(list_task_attempts_sync),
        )
        .route("/swarm/tasks/{task_id}", get(get_task_sync))
        .route("/swarm/attempts/{attempt_id}", get(get_attempt_sync))
        .route(
            "/swarm/attempts/{attempt_id}/logs",
            get(get_attempt_logs_sync),
        )
        .layer(middleware::from_fn_with_state(state, require_node_api_key))
}

// ============================================================================
// API Key Management (User JWT Auth)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateApiKeyRequest {
    pub organization_id: Uuid,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct CreateApiKeyResponse {
    pub api_key: NodeApiKey,
    /// The raw API key value - only returned on creation
    pub secret: String,
}

#[instrument(
    name = "nodes.create_api_key",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, org_id = %payload.organization_id)
)]
pub async fn create_api_key(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateApiKeyRequest>,
) -> Response {
    let pool = state.pool();

    // Verify user has access to organization
    if let Err(error) = ensure_member_access(pool, payload.organization_id, ctx.user.id).await {
        return error.into_response();
    }

    let service = NodeServiceImpl::new(pool.clone());
    let data = CreateNodeApiKey { name: payload.name };

    match service
        .create_api_key(payload.organization_id, data, ctx.user.id)
        .await
    {
        Ok((api_key, secret)) => (
            StatusCode::CREATED,
            Json(CreateApiKeyResponse { api_key, secret }),
        )
            .into_response(),
        Err(error) => node_error_response(error, "failed to create API key"),
    }
}

#[derive(Debug, Deserialize)]
pub struct ListApiKeysQuery {
    pub organization_id: Uuid,
}

#[instrument(
    name = "nodes.list_api_keys",
    skip(state, ctx, query),
    fields(user_id = %ctx.user.id, org_id = %query.organization_id)
)]
pub async fn list_api_keys(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListApiKeysQuery>,
) -> Response {
    let pool = state.pool();

    if let Err(error) = ensure_member_access(pool, query.organization_id, ctx.user.id).await {
        return error.into_response();
    }

    let service = NodeServiceImpl::new(pool.clone());

    match service.list_api_keys(query.organization_id).await {
        Ok(keys) => (StatusCode::OK, Json(keys)).into_response(),
        Err(error) => node_error_response(error, "failed to list API keys"),
    }
}

#[instrument(
    name = "nodes.revoke_api_key",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, key_id = %key_id)
)]
pub async fn revoke_api_key(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(key_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    // TODO: Verify the key belongs to an organization the user has access to
    let _ = ctx; // Silence unused warning for now

    match service.revoke_api_key(key_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => node_error_response(error, "failed to revoke API key"),
    }
}

// ============================================================================
// Node Registration (API Key Auth)
// ============================================================================

#[derive(Debug, Serialize)]
pub struct RegisterNodeResponse {
    pub node: Node,
    pub linked_projects: Vec<SwarmProjectNode>,
}

/// Registers or updates a node using the provided API key and node registration payload.
///
/// On success returns a 200 OK response containing the registered `Node` and any swarm projects
/// linked to that node. On failure returns an appropriate error response (authentication,
/// authorization, validation, or database errors).
///
/// # Examples
///
/// ```
/// # use axum::http::HeaderMap;
/// # use axum::extract::State;
/// # use axum::Json;
/// # use uuid::Uuid;
/// # use crate::routes::nodes::{register_node, NodeRegistration};
/// # // The following is illustrative and requires an application `AppState` and running runtime.
/// # #[tokio::test]
/// # async fn example_register_node_call() {
/// let state = /* obtain AppState */ todo!();
/// let mut headers = HeaderMap::new();
/// headers.insert("x-api-key", "example-key".parse().unwrap());
/// let payload = NodeRegistration {
///     machine_id: "machine-123".into(),
///     ..Default::default()
/// };
/// let response = register_node(State(state), headers, Json(payload)).await;
/// // Inspect `response` for status and body
/// # }
/// ```
#[instrument(
name = "nodes.register",
skip(state, headers, payload),
fields(machine_id = %payload.machine_id)
)]
pub async fn register_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<NodeRegistration>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    // Validate API key
    let api_key = match extract_and_validate_api_key(&service, &headers).await {
        Ok(key) => key,
        Err(response) => return response,
    };

    Span::current().record("org_id", format_args!("{}", api_key.organization_id));

    // Register or update node
    match service
        .register_node(api_key.organization_id, payload)
        .await
    {
        Ok(node) => {
            // Get linked swarm projects for this node
            let linked_projects = match SwarmProjectRepository::list_by_node(pool, node.id).await {
                Ok(projects) => projects,
                Err(e) => {
                    return node_error_response(
                        NodeError::Database(e.to_string()),
                        "failed to fetch linked projects for registered node",
                    );
                }
            };

            (
                StatusCode::OK,
                Json(RegisterNodeResponse {
                    node,
                    linked_projects,
                }),
            )
                .into_response()
        }
        Err(error) => node_error_response(error, "failed to register node"),
    }
}

/// Handle a node heartbeat request authenticated by an API key.
///
/// Validates the incoming API key from the `x-api-key` header, invokes the node service heartbeat
/// for the given `node_id` with the provided payload, and returns an HTTP response:
/// - 204 No Content on success
/// - a mapped error response on failure
///
/// # Examples
///
/// ```no_run
/// // Illustrative usage within an HTTP handler test environment:
/// // let resp = heartbeat(State(app_state), headers, Path(node_id), Json(payload)).await;
/// // assert_eq!(resp.status(), StatusCode::NO_CONTENT);
/// ```
#[instrument(
name = "nodes.heartbeat",
skip(state, headers, payload),
fields(node_id = %node_id)
)]
pub async fn heartbeat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(node_id): Path<Uuid>,
    Json(payload): Json<HeartbeatPayload>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    // Validate API key
    if let Err(response) = extract_and_validate_api_key(&service, &headers).await {
        return response;
    }

    // TODO: Verify node belongs to the organization from the API key

    match service.heartbeat(node_id, payload).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => node_error_response(error, "failed to process heartbeat"),
    }
}

// ============================================================================
// Node Management (User JWT Auth)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ListNodesQuery {
    pub organization_id: Uuid,
}

#[instrument(
    name = "nodes.list",
    skip(state, ctx, query),
    fields(user_id = %ctx.user.id, org_id = %query.organization_id)
)]
pub async fn list_nodes(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListNodesQuery>,
) -> Response {
    let pool = state.pool();

    if let Err(error) = ensure_member_access(pool, query.organization_id, ctx.user.id).await {
        return error.into_response();
    }

    let service = NodeServiceImpl::new(pool.clone());

    match service.list_nodes(query.organization_id).await {
        Ok(nodes) => (StatusCode::OK, Json(nodes)).into_response(),
        Err(error) => node_error_response(error, "failed to list nodes"),
    }
}

#[instrument(
    name = "nodes.get",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, node_id = %node_id)
)]
pub async fn get_node(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(node_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    let _ = ctx; // TODO: Verify user has access to the node's organization

    match service.get_node(node_id).await {
        Ok(node) => (StatusCode::OK, Json(node)).into_response(),
        Err(error) => node_error_response(error, "failed to get node"),
    }
}

/// Deletes the specified node when the requesting user has admin access to the node's organization.
///
/// Verifies the node exists, enforces that the requester is an organization admin, and removes the node
/// (which cascades related swarm_project_nodes and task_assignments). Returns an HTTP response
/// representing the outcome.
///
/// # Returns
///
/// `204 No Content` on successful deletion; otherwise an appropriate error status and JSON error message
/// (e.g., `404` if the node is not found, `403` if the requester lacks admin access, `500` for internal errors).
///
/// # Examples
///
/// ```
/// // This handler is intended to be mounted in an Axum router:
/// // router.delete("/nodes/:id", delete_node);
/// let _ = "delete_node handler";
/// ```
#[instrument(
name = "nodes.delete",
skip(state, ctx),
fields(user_id = %ctx.user.id, node_id = %node_id)
)]
pub async fn delete_node(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(node_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    // Get node to verify organization access
    let node = match service.get_node(node_id).await {
        Ok(node) => node,
        Err(NodeError::NodeNotFound) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Node not found" })),
            )
                .into_response();
        }
        Err(error) => return node_error_response(error, "failed to get node"),
    };

    // Verify user is admin of the node's organization
    let org_repo = OrganizationRepository::new(pool);
    match org_repo
        .check_user_role(node.organization_id, ctx.user.id)
        .await
    {
        Ok(Some(MemberRole::Admin)) => {}
        Ok(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Admin access required to delete nodes" })),
            )
                .into_response();
        }
        Err(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Admin access required to delete nodes" })),
            )
                .into_response();
        }
    }

    // Delete the node (cascades swarm_project_nodes, task_assignments)
    match service.delete_node(node_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => node_error_response(error, "failed to delete node"),
    }
}

#[instrument(
    name = "nodes.list_projects",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, node_id = %node_id)
)]
pub async fn list_node_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(node_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    let _ = ctx; // TODO: Verify user has access to the node's organization

    // Return local projects with swarm project info for the settings UI
    match service.list_node_local_projects(node_id).await {
        Ok(projects) => (StatusCode::OK, Json(projects)).into_response(),
        Err(error) => node_error_response(error, "failed to list node projects"),
    }
}

/// List projects linked to a node that are also linked to a swarm project.
/// Only swarm-linked projects are returned - unlinked projects are excluded.
/// Use this endpoint for syncing projects to other nodes.
#[instrument(
    name = "nodes.list_linked_projects",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, node_id = %node_id)
)]
pub async fn list_linked_node_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(node_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    let _ = ctx; // TODO: Verify user has access to the node's organization

    match service.list_linked_node_projects(node_id).await {
        Ok(projects) => (StatusCode::OK, Json(projects)).into_response(),
        Err(error) => node_error_response(error, "failed to list linked node projects"),
    }
}

// ============================================================================
// Node Sync (API Key Auth Only)
// ============================================================================

/// List nodes in the organization.
///
/// Simplified sync endpoint - uses API key's organization directly.
/// Architecture: One hive = one swarm = one organization.
#[instrument(name = "nodes.list_sync", skip(state, node_ctx))]
pub async fn list_nodes_sync(
    State(state): State<AppState>,
    Extension(node_ctx): Extension<NodeAuthContext>,
) -> Response {
    let service = NodeServiceImpl::new(state.pool().clone());

    match service.list_nodes(node_ctx.organization_id).await {
        Ok(nodes) => (StatusCode::OK, Json(nodes)).into_response(),
        Err(error) => node_error_response(error, "failed to list nodes"),
    }
}

/// Query parameters for getting node statuses
#[derive(Debug, Deserialize)]
pub struct GetNodeStatusesQuery {
    /// Comma-separated list of node IDs
    pub ids: String,
}

/// Response for node status query
#[derive(Debug, Serialize, Deserialize)]
pub struct NodeStatusInfo {
    pub id: Uuid,
    pub status: String,
    pub public_url: Option<String>,
}

/// Response for batch node status query
#[derive(Debug, Serialize, Deserialize)]
pub struct GetNodeStatusesResponse {
    pub nodes: Vec<NodeStatusInfo>,
}

/// Get statuses for multiple nodes by their IDs.
///
/// Used by nodes to sync source_node_status for remote projects.
/// Accepts a comma-separated list of node IDs and returns their current statuses.
/// Results are scoped to the caller's organization for security.
#[instrument(name = "nodes.get_statuses_sync", skip(state, node_ctx, query))]
pub async fn get_node_statuses_sync(
    State(state): State<AppState>,
    Extension(node_ctx): Extension<NodeAuthContext>,
    Query(query): Query<GetNodeStatusesQuery>,
) -> Response {
    use crate::db::nodes::NodeRepository;

    // Parse the comma-separated IDs
    let node_ids: Vec<Uuid> = query
        .ids
        .split(',')
        .filter_map(|s| Uuid::parse_str(s.trim()).ok())
        .collect();

    if node_ids.is_empty() {
        return (
            StatusCode::OK,
            Json(GetNodeStatusesResponse { nodes: vec![] }),
        )
            .into_response();
    }

    let repo = NodeRepository::new(state.pool());
    // Scope query to caller's organization to prevent cross-org access
    match repo
        .get_statuses_by_ids(node_ctx.organization_id, &node_ids)
        .await
    {
        Ok(statuses) => {
            let nodes: Vec<NodeStatusInfo> = statuses
                .into_iter()
                .map(|(id, status, public_url)| NodeStatusInfo {
                    id,
                    status: status.to_string(),
                    public_url,
                })
                .collect();
            (StatusCode::OK, Json(GetNodeStatusesResponse { nodes })).into_response()
        }
        Err(e) => {
            tracing::error!(?e, "failed to get node statuses");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to get node statuses" })),
            )
                .into_response()
        }
    }
}

/// List all local projects for a node.
///
/// Simplified sync endpoint - uses API key auth only.
#[instrument(
    name = "nodes.list_projects_sync",
    skip(state, _node_ctx),
    fields(node_id = %node_id)
)]
pub async fn list_node_projects_sync(
    State(state): State<AppState>,
    Extension(_node_ctx): Extension<NodeAuthContext>,
    Path(node_id): Path<Uuid>,
) -> Response {
    let service = NodeServiceImpl::new(state.pool().clone());

    match service.list_node_local_projects(node_id).await {
        Ok(projects) => (StatusCode::OK, Json(projects)).into_response(),
        Err(NodeError::NodeNotFound) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Node not found" })),
        )
            .into_response(),
        Err(error) => node_error_response(error, "failed to list node projects"),
    }
}

/// List linked projects for a node.
///
/// Simplified sync endpoint - uses API key auth only.
#[instrument(
    name = "nodes.list_linked_projects_sync",
    skip(state, _node_ctx),
    fields(node_id = %node_id)
)]
pub async fn list_linked_node_projects_sync(
    State(state): State<AppState>,
    Extension(_node_ctx): Extension<NodeAuthContext>,
    Path(node_id): Path<Uuid>,
) -> Response {
    let service = NodeServiceImpl::new(state.pool().clone());

    match service.list_linked_node_projects(node_id).await {
        Ok(projects) => (StatusCode::OK, Json(projects)).into_response(),
        Err(NodeError::NodeNotFound) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Node not found" })),
        )
            .into_response(),
        Err(error) => node_error_response(error, "failed to list linked node projects"),
    }
}

/// List swarm projects with task counts for node sync.
///
/// Uses API key's organization directly. Returns all swarm projects
/// in the organization with their task counts (todo, in_progress, etc.).
#[instrument(name = "nodes.list_swarm_projects_sync", skip(state, node_ctx))]
pub async fn list_swarm_projects_sync(
    State(state): State<AppState>,
    Extension(node_ctx): Extension<NodeAuthContext>,
) -> Response {
    use super::swarm_projects::ListSwarmProjectsResponse;

    match SwarmProjectRepository::list_with_nodes_count(state.pool(), node_ctx.organization_id)
        .await
    {
        Ok(projects) => {
            (StatusCode::OK, Json(ListSwarmProjectsResponse { projects })).into_response()
        }
        Err(error) => {
            tracing::error!(?error, "failed to list swarm projects for sync");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to list swarm projects" })),
            )
                .into_response()
        }
    }
}

/// Get a single swarm project by ID for node sync.
///
/// Uses API key's organization to verify access. Returns the project
/// if it belongs to the same organization as the authenticated node.
#[instrument(
    name = "nodes.get_swarm_project_sync",
    skip(state, node_ctx),
    fields(project_id = %project_id)
)]
pub async fn get_swarm_project_sync(
    State(state): State<AppState>,
    Extension(node_ctx): Extension<NodeAuthContext>,
    Path(project_id): Path<Uuid>,
) -> Response {
    use super::swarm_projects::SwarmProjectResponse;

    match SwarmProjectRepository::find_by_id(state.pool(), project_id).await {
        Ok(Some(project)) => {
            // Verify project belongs to the same organization as the node's API key
            if project.organization_id != node_ctx.organization_id {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "swarm project not found" })),
                )
                    .into_response();
            }
            (StatusCode::OK, Json(SwarmProjectResponse { project })).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "swarm project not found" })),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(?error, "failed to get swarm project for sync");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to get swarm project" })),
            )
                .into_response()
        }
    }
}

// ============================================================================
// Bulk Task Sync (API Key Auth Only)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct BulkTasksSyncQuery {
    pub project_id: Uuid,
}

/// Response for bulk task sync operations.
/// Same format as the user-facing `/tasks/bulk` endpoint.
#[derive(Debug, Serialize)]
pub struct BulkSharedTasksSyncResponse {
    pub tasks: Vec<crate::db::tasks::SharedTaskActivityPayload>,
    pub deleted_task_ids: Vec<Uuid>,
    pub latest_seq: Option<i64>,
}

/// Fetch tasks in bulk for node sync operations.
///
/// Simplified sync endpoint - uses API key auth only.
/// Verifies project exists, then fetches tasks.
#[instrument(
    name = "nodes.bulk_tasks_sync",
    skip(state, _node_ctx, query),
    fields(project_id = %query.project_id)
)]
pub async fn bulk_tasks_for_node_sync(
    State(state): State<AppState>,
    Extension(_node_ctx): Extension<NodeAuthContext>,
    Query(query): Query<BulkTasksSyncQuery>,
) -> Response {
    use crate::db::tasks::{SharedTaskError, SharedTaskRepository};

    let pool = state.pool();

    // Verify project exists
    match SwarmProjectRepository::exists(pool, query.project_id).await {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "project not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to check project existence");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    }

    // Fetch tasks
    let repo = SharedTaskRepository::new(pool);
    match repo.bulk_fetch(query.project_id).await {
        Ok(snapshot) => (
            StatusCode::OK,
            Json(BulkSharedTasksSyncResponse {
                tasks: snapshot.tasks,
                deleted_task_ids: snapshot.deleted_task_ids,
                latest_seq: snapshot.latest_seq,
            }),
        )
            .into_response(),
        Err(SharedTaskError::Database(err)) => {
            tracing::error!(?err, "failed to load shared task snapshot");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to load shared tasks" })),
            )
                .into_response()
        }
        Err(other) => {
            tracing::error!(?other, "failed to load shared task snapshot");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to load shared tasks" })),
            )
                .into_response()
        }
    }
}

// ============================================================================
// Node Merge (User JWT Auth - Admin Only)
// ============================================================================

#[derive(Debug, Serialize)]
pub struct MergeNodesResponse {
    pub source_node_id: Uuid,
    pub target_node_id: Uuid,
    pub projects_moved: u64,
    pub keys_rebound: u64,
}

impl From<MergeNodesResult> for MergeNodesResponse {
    fn from(result: MergeNodesResult) -> Self {
        Self {
            source_node_id: result.source_node_id,
            target_node_id: result.target_node_id,
            projects_moved: result.projects_moved,
            keys_rebound: result.keys_rebound,
        }
    }
}

#[instrument(
    name = "nodes.merge",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, source_id = %source_id, target_id = %target_id)
)]
pub async fn merge_nodes(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((source_id, target_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    // Get source node to verify organization access
    let source_node = match service.get_node(source_id).await {
        Ok(node) => node,
        Err(NodeError::NodeNotFound) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Source node not found" })),
            )
                .into_response();
        }
        Err(error) => return node_error_response(error, "failed to get source node"),
    };

    // Verify user is admin of the node's organization
    let org_repo = OrganizationRepository::new(pool);
    match org_repo
        .check_user_role(source_node.organization_id, ctx.user.id)
        .await
    {
        Ok(Some(MemberRole::Admin)) => {}
        Ok(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Admin access required to merge nodes" })),
            )
                .into_response();
        }
        Err(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Admin access required to merge nodes" })),
            )
                .into_response();
        }
    }

    // Perform the merge
    match service.merge_nodes(source_id, target_id).await {
        Ok(result) => (StatusCode::OK, Json(MergeNodesResponse::from(result))).into_response(),
        Err(error) => node_error_response(error, "failed to merge nodes"),
    }
}

// ============================================================================
// Unblock API Key (User JWT Auth - Admin Only)
// ============================================================================

#[instrument(
    name = "nodes.unblock_api_key",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, key_id = %key_id)
)]
pub async fn unblock_api_key(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(key_id): Path<Uuid>,
) -> Response {
    use crate::db::node_api_keys::NodeApiKeyRepository;

    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    // Get the API key to verify organization access
    let key_repo = NodeApiKeyRepository::new(pool);
    let api_key = match key_repo.find_by_id(key_id).await {
        Ok(Some(key)) => key,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "API key not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch API key");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Verify user is admin of the API key's organization
    let org_repo = OrganizationRepository::new(pool);
    match org_repo
        .check_user_role(api_key.organization_id, ctx.user.id)
        .await
    {
        Ok(Some(MemberRole::Admin)) => {}
        Ok(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Admin access required to unblock API keys" })),
            )
                .into_response();
        }
        Err(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Admin access required to unblock API keys" })),
            )
                .into_response();
        }
    }

    // Unblock the key
    match service.unblock_api_key(key_id).await {
        Ok(key) => (StatusCode::OK, Json(key)).into_response(),
        Err(error) => node_error_response(error, "failed to unblock API key"),
    }
}

// ============================================================================
// Task Output Logs (User JWT Auth)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct GetAssignmentLogsQuery {
    /// Maximum number of logs to return
    pub limit: Option<i64>,
    /// Return logs after this ID (for pagination)
    pub after_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct TaskOutputLogResponse {
    pub id: i64,
    pub assignment_id: Uuid,
    pub output_type: String,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct GetAssignmentLogsResponse {
    pub logs: Vec<TaskOutputLogResponse>,
}

#[instrument(
    name = "nodes.get_assignment_logs",
    skip(state, ctx, query),
    fields(user_id = %ctx.user.id, assignment_id = %assignment_id)
)]
pub async fn get_assignment_logs(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(assignment_id): Path<Uuid>,
    Query(query): Query<GetAssignmentLogsQuery>,
) -> Response {
    use crate::db::task_assignments::TaskAssignmentRepository;
    use crate::db::task_output_logs::TaskOutputLogRepository;

    let pool = state.pool();

    // Get the assignment to verify access
    let assignment_repo = TaskAssignmentRepository::new(pool);
    let assignment = match assignment_repo.find_by_id(assignment_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "assignment not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch assignment");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Get the task to verify organization access
    use crate::db::tasks::SharedTaskRepository;
    let task_repo = SharedTaskRepository::new(pool);
    let task = match task_repo.find_by_id(assignment.task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "task not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch task");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Verify user has access to the organization
    if let Err(error) = ensure_member_access(pool, task.organization_id, ctx.user.id).await {
        return error.into_response();
    }

    // Get the logs
    let log_repo = TaskOutputLogRepository::new(pool);
    match log_repo
        .list_by_assignment(assignment_id, query.limit, query.after_id)
        .await
    {
        Ok(logs) => {
            let response = GetAssignmentLogsResponse {
                logs: logs
                    .into_iter()
                    .map(|log| TaskOutputLogResponse {
                        id: log.id,
                        assignment_id: log.assignment_id,
                        output_type: log.output_type,
                        content: log.content,
                        timestamp: log.timestamp,
                        created_at: log.created_at,
                    })
                    .collect(),
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch assignment logs");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct GetAssignmentProgressQuery {
    /// Maximum number of events to return
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct TaskProgressEventResponse {
    pub id: i64,
    pub assignment_id: Uuid,
    pub event_type: String,
    pub message: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct GetAssignmentProgressResponse {
    pub events: Vec<TaskProgressEventResponse>,
}

#[instrument(
    name = "nodes.get_assignment_progress",
    skip(state, ctx, query),
    fields(user_id = %ctx.user.id, assignment_id = %assignment_id)
)]
pub async fn get_assignment_progress(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(assignment_id): Path<Uuid>,
    Query(query): Query<GetAssignmentProgressQuery>,
) -> Response {
    use crate::db::task_assignments::TaskAssignmentRepository;
    use crate::db::task_progress_events::TaskProgressEventRepository;

    let pool = state.pool();

    // Get the assignment to verify access
    let assignment_repo = TaskAssignmentRepository::new(pool);
    let assignment = match assignment_repo.find_by_id(assignment_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "assignment not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch assignment");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Get the task to verify organization access
    use crate::db::tasks::SharedTaskRepository;
    let task_repo = SharedTaskRepository::new(pool);
    let task = match task_repo.find_by_id(assignment.task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "task not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch task");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Verify user has access to the organization
    if let Err(error) = ensure_member_access(pool, task.organization_id, ctx.user.id).await {
        return error.into_response();
    }

    // Get the progress events
    let progress_repo = TaskProgressEventRepository::new(pool);
    match progress_repo
        .list_by_assignment(assignment_id, query.limit)
        .await
    {
        Ok(events) => {
            let response = GetAssignmentProgressResponse {
                events: events
                    .into_iter()
                    .map(|event| TaskProgressEventResponse {
                        id: event.id,
                        assignment_id: event.assignment_id,
                        event_type: event.event_type,
                        message: event.message,
                        metadata: event.metadata,
                        timestamp: event.timestamp,
                        created_at: event.created_at,
                    })
                    .collect(),
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch assignment progress events");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

// ============================================================================
// Connection Info (User JWT Auth)
// ============================================================================

/// Response containing connection information for streaming logs from a node.
#[derive(Debug, Serialize)]
pub struct ConnectionInfoResponse {
    /// The assignment ID
    pub assignment_id: Uuid,
    /// The node ID
    pub node_id: Uuid,
    /// Direct URL to the node (if available)
    pub direct_url: Option<String>,
    /// Hive relay URL for log streaming
    pub relay_url: String,
    /// Short-lived token for authenticating with the node or relay
    pub connection_token: String,
    /// Token expiration timestamp (ISO 8601)
    pub expires_at: String,
}

#[instrument(
    name = "nodes.get_connection_info",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, assignment_id = %assignment_id)
)]
pub async fn get_connection_info(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(assignment_id): Path<Uuid>,
) -> Response {
    use crate::db::nodes::NodeRepository;
    use crate::db::task_assignments::TaskAssignmentRepository;

    let pool = state.pool();

    // Get the assignment
    let assignment_repo = TaskAssignmentRepository::new(pool);
    let assignment = match assignment_repo.find_by_id(assignment_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "assignment not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch assignment");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Get the task to verify organization access
    use crate::db::tasks::SharedTaskRepository;
    let task_repo = SharedTaskRepository::new(pool);
    let task = match task_repo.find_by_id(assignment.task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "task not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch task");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Verify user has access to the organization
    if let Err(error) = ensure_member_access(pool, task.organization_id, ctx.user.id).await {
        return error.into_response();
    }

    // Get the node to get its public URL
    let node_repo = NodeRepository::new(pool);
    let node = match node_repo.find_by_id(assignment.node_id).await {
        Ok(Some(n)) => n,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "node not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch node");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Generate connection token
    let connection_token_service = state.connection_token();
    let token = match connection_token_service.generate(
        ctx.user.id,
        node.id,
        assignment_id,
        assignment.local_attempt_id,
    ) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(?e, "failed to generate connection token");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Calculate expiration time (15 minutes from now)
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(15);

    // Build relay URL
    let relay_url = format!(
        "{}/v1/nodes/assignments/{}/logs/ws",
        state.server_public_base_url, assignment_id
    );

    let response = ConnectionInfoResponse {
        assignment_id,
        node_id: node.id,
        direct_url: node.public_url,
        relay_url,
        connection_token: token,
        expires_at: expires_at.to_rfc3339(),
    };

    (StatusCode::OK, Json(response)).into_response()
}

// ============================================================================
// Task Attempts (User JWT Auth)
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ListTaskAttemptsBySharedTaskResponse {
    pub attempts: Vec<NodeTaskAttempt>,
}

/// List all task attempts for a shared task.
/// Used by remote nodes to fetch attempts for swarm tasks via the Hive.
#[instrument(
    name = "nodes.list_task_attempts_by_shared_task",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, shared_task_id = %shared_task_id)
)]
pub async fn list_task_attempts_by_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(shared_task_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();

    // Get the shared task to verify organization access
    use crate::db::tasks::SharedTaskRepository;
    let task_repo = SharedTaskRepository::new(pool);
    let task = match task_repo.find_by_id(shared_task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "shared task not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch shared task");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Verify user has access to the organization
    if let Err(error) = ensure_member_access(pool, task.organization_id, ctx.user.id).await {
        return error.into_response();
    }

    // Get the task attempts
    let service = NodeServiceImpl::new(pool.clone());
    match service
        .list_task_attempts_by_shared_task(shared_task_id)
        .await
    {
        Ok(attempts) => {
            let response = ListTaskAttemptsBySharedTaskResponse { attempts };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(error) => node_error_response(error, "failed to list task attempts"),
    }
}

/// Node information for cross-node proxy routing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeInfo {
    pub id: Uuid,
    pub name: String,
    pub public_url: Option<String>,
    pub status: String,
}

/// Response for getting a single node task attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTaskAttemptResponse {
    pub attempt: NodeTaskAttempt,
    pub executions: Vec<NodeExecutionProcess>,
    /// Whether all executions are in a terminal state (complete/failed/killed)
    pub is_complete: bool,
    /// Node information for cross-node proxy routing
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_info: Option<NodeInfo>,
}

/// Get a single task attempt by ID.
/// Used by remote nodes to fetch attempt details for cross-node viewing.
#[instrument(
    name = "nodes.get_node_task_attempt",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, attempt_id = %attempt_id)
)]
pub async fn get_node_task_attempt(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(attempt_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();

    // Get the attempt
    use crate::db::node_task_attempts::NodeTaskAttemptRepository;
    let attempt_repo = NodeTaskAttemptRepository::new(pool);
    let attempt = match attempt_repo.find_by_id(attempt_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "task attempt not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch task attempt");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Get the shared task to verify organization access
    use crate::db::tasks::SharedTaskRepository;
    let task_repo = SharedTaskRepository::new(pool);
    let task = match task_repo.find_by_id(attempt.shared_task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            tracing::warn!(
                attempt_id = %attempt_id,
                shared_task_id = %attempt.shared_task_id,
                "attempt references non-existent shared task"
            );
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "shared task not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch shared task");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Verify user has access to the organization
    if let Err(error) = ensure_member_access(pool, task.organization_id, ctx.user.id).await {
        return error.into_response();
    }

    // Trigger on-demand backfill for partial sync attempts (non-blocking)
    // This ensures that subsequent requests will have complete data
    if attempt.sync_state == "partial" {
        let backfill = state.backfill().clone();
        let node_id = attempt.node_id;
        let attempt_id_for_backfill = attempt.id;

        // Non-blocking - spawn and forget
        tokio::spawn(async move {
            if let Err(e) = backfill
                .request_immediate_backfill(node_id, attempt_id_for_backfill)
                .await
            {
                // Log at debug level since node being offline is expected
                tracing::debug!(
                    node_id = %node_id,
                    attempt_id = %attempt_id_for_backfill,
                    error = %e,
                    "on-demand backfill request failed (node may be offline)"
                );
            }
        });
    }

    // Get the execution processes for this attempt
    use crate::db::node_execution_processes::NodeExecutionProcessRepository;
    let exec_repo = NodeExecutionProcessRepository::new(pool);
    let executions = match exec_repo.find_by_attempt_id(attempt_id).await {
        Ok(execs) => execs,
        Err(e) => {
            tracing::error!(?e, "failed to fetch execution processes");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Determine if the attempt is complete (all executions in terminal state)
    let is_complete = executions
        .iter()
        .all(|e| matches!(e.status.as_str(), "completed" | "failed" | "killed"));

    // Fetch node info for cross-node proxy routing
    use crate::db::nodes::NodeRepository;
    let node_repo = NodeRepository::new(pool);
    let node_info = match node_repo.find_by_id(attempt.node_id).await {
        Ok(Some(node)) => Some(NodeInfo {
            id: node.id,
            name: node.name,
            public_url: node.public_url,
            status: node.status.to_string(),
        }),
        Ok(None) => {
            tracing::warn!(node_id = %attempt.node_id, "Node not found for attempt");
            None
        }
        Err(e) => {
            tracing::warn!(?e, node_id = %attempt.node_id, "Failed to fetch node info");
            None
        }
    };

    let response = NodeTaskAttemptResponse {
        attempt,
        executions,
        is_complete,
        node_info,
    };

    (StatusCode::OK, Json(response)).into_response()
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Extract and validate API key from headers
async fn extract_and_validate_api_key(
    service: &NodeServiceImpl,
    headers: &HeaderMap,
) -> Result<NodeApiKey, Response> {
    let api_key_value = headers
        .get(API_KEY_HEADER)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "missing API key" })),
            )
                .into_response()
        })?;

    service.validate_api_key(api_key_value).await.map_err(|e| {
        let (status, message) = match e {
            NodeError::ApiKeyNotFound | NodeError::ApiKeyInvalid => {
                (StatusCode::UNAUTHORIZED, "invalid API key")
            }
            NodeError::ApiKeyRevoked => (StatusCode::UNAUTHORIZED, "API key revoked"),
            _ => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to validate API key",
            ),
        };
        (status, Json(json!({ "error": message }))).into_response()
    })
}

/// Convert NodeError to HTTP response
fn node_error_response(error: NodeError, context: &str) -> Response {
    let (status, message): (StatusCode, String) = match &error {
        NodeError::NodeNotFound => (StatusCode::NOT_FOUND, "node not found".to_string()),
        NodeError::ApiKeyNotFound => (StatusCode::NOT_FOUND, "API key not found".to_string()),
        NodeError::ApiKeyInvalid => (StatusCode::UNAUTHORIZED, "invalid API key".to_string()),
        NodeError::ApiKeyRevoked => (StatusCode::UNAUTHORIZED, "API key revoked".to_string()),
        NodeError::ApiKeyBlocked(reason) => (
            StatusCode::FORBIDDEN,
            format!("API key blocked: {}", reason),
        ),
        NodeError::ApiKeyAlreadyBound => (
            StatusCode::CONFLICT,
            "API key already bound to a different node".to_string(),
        ),
        NodeError::TakeoverDetected(msg) => {
            (StatusCode::CONFLICT, format!("takeover detected: {}", msg))
        }
        NodeError::ProjectAlreadyLinked => (
            StatusCode::CONFLICT,
            "project already linked to a node".to_string(),
        ),
        NodeError::ProjectNotInHive => (
            StatusCode::BAD_REQUEST,
            "project not found in hive - sync project before linking".to_string(),
        ),
        NodeError::TaskAlreadyAssigned => (
            StatusCode::CONFLICT,
            "task already has an active assignment".to_string(),
        ),
        NodeError::AssignmentNotFound => {
            (StatusCode::NOT_FOUND, "assignment not found".to_string())
        }
        NodeError::NodeProjectNotFound => (
            StatusCode::NOT_FOUND,
            "node project link not found".to_string(),
        ),
        NodeError::Database(err) => {
            tracing::error!(?err, context, "database error in node operation");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal server error".to_string(),
            )
        }
    };

    (status, Json(json!({ "error": message }))).into_response()
}

// ============================================================================
// Swarm Data Read (API Key Auth Only)
// ============================================================================

/// Response for listing shared tasks for a swarm project.
#[derive(Debug, Serialize, Deserialize)]
pub struct ListSwarmProjectTasksResponse {
    pub tasks: Vec<crate::db::tasks::SharedTask>,
}

/// List all tasks for a swarm project.
///
/// Used by remote nodes to fetch tasks for swarm projects they don't own.
/// Includes denormalized assignee metadata (name, username) for cross-node display.
#[instrument(
    name = "nodes.list_swarm_project_tasks_sync",
    skip(state, node_ctx),
    fields(project_id = %project_id)
)]
pub async fn list_swarm_project_tasks_sync(
    State(state): State<AppState>,
    Extension(node_ctx): Extension<NodeAuthContext>,
    Path(project_id): Path<Uuid>,
) -> Response {
    use crate::db::tasks::SharedTaskRepository;
    use crate::db::users::fetch_users_by_ids;
    use std::collections::HashMap;

    let pool = state.pool();

    // Verify project exists and belongs to caller's organization
    match SwarmProjectRepository::find_by_id(pool, project_id).await {
        Ok(Some(project)) => {
            // Security: ensure caller can only access their own organization's projects
            if project.organization_id != node_ctx.organization_id {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "project not found" })),
                )
                    .into_response();
            }
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "project not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to check project existence");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    }

    // Fetch tasks for this swarm project
    let repo = SharedTaskRepository::new(pool);
    let tasks = match repo.find_by_swarm_project_id(project_id).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(?e, "failed to list tasks for swarm project");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to list tasks" })),
            )
                .into_response();
        }
    };

    // Collect unique assignee user IDs for batch fetch
    let assignee_ids: Vec<Uuid> = tasks
        .iter()
        .filter_map(|t| t.assignee_user_id)
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    // Fetch user data for assignees in one batch
    let users_map: HashMap<Uuid, crate::db::users::UserData> = if !assignee_ids.is_empty() {
        match fetch_users_by_ids(pool, &assignee_ids).await {
            Ok(users) => users.into_iter().map(|u| (u.id, u)).collect(),
            Err(e) => {
                tracing::warn!(
                    ?e,
                    "Failed to fetch assignee user data, returning tasks without metadata"
                );
                HashMap::new()
            }
        }
    } else {
        HashMap::new()
    };

    // Enrich tasks with assignee metadata and activity_at
    let enriched_tasks: Vec<_> = tasks
        .into_iter()
        .map(|task| {
            let user = task.assignee_user_id.and_then(|id| users_map.get(&id));
            // Use updated_at as activity_at since we don't have a dedicated column yet
            let activity_at = task.updated_at;
            task.with_assignee_info(user)
                .with_activity_at(Some(activity_at))
        })
        .collect();

    (
        StatusCode::OK,
        Json(ListSwarmProjectTasksResponse {
            tasks: enriched_tasks,
        }),
    )
        .into_response()
}

/// List task attempts for a shared task (API key auth).
///
/// Used by remote nodes to fetch attempts for swarm tasks via the Hive.
#[instrument(
    name = "nodes.list_task_attempts_sync",
    skip(state, node_ctx),
    fields(shared_task_id = %shared_task_id)
)]
pub async fn list_task_attempts_sync(
    State(state): State<AppState>,
    Extension(node_ctx): Extension<NodeAuthContext>,
    Path(shared_task_id): Path<Uuid>,
) -> Response {
    use crate::db::tasks::SharedTaskRepository;

    let pool = state.pool();

    // Validate that the task belongs to the same organization as the API key
    let task_repo = SharedTaskRepository::new(pool);
    match task_repo.find_by_id(shared_task_id).await {
        Ok(Some(task)) => {
            if task.organization_id != node_ctx.organization_id {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "task not found" })),
                )
                    .into_response();
            }
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "task not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch task for org validation");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    }

    let service = NodeServiceImpl::new(pool.clone());

    match service
        .list_task_attempts_by_shared_task(shared_task_id)
        .await
    {
        Ok(attempts) => {
            let response = ListTaskAttemptsBySharedTaskResponse { attempts };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(error) => node_error_response(error, "failed to list task attempts"),
    }
}

/// Get a single shared task by ID (API key auth).
///
/// Used by remote nodes to fetch task details for cross-node viewing.
#[instrument(
    name = "nodes.get_task_sync",
    skip(state, node_ctx),
    fields(task_id = %task_id)
)]
pub async fn get_task_sync(
    State(state): State<AppState>,
    Extension(node_ctx): Extension<NodeAuthContext>,
    Path(task_id): Path<Uuid>,
) -> Response {
    use crate::db::tasks::SharedTaskRepository;

    let pool = state.pool();
    let repo = SharedTaskRepository::new(pool);

    match repo.find_by_id(task_id).await {
        Ok(Some(task)) => {
            // Validate that the task belongs to the same organization as the API key
            if task.organization_id != node_ctx.organization_id {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "task not found" })),
                )
                    .into_response();
            }
            (
                StatusCode::OK,
                Json(crate::routes::tasks::SharedTaskResponse { task, user: None }),
            )
                .into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "task not found" })),
        )
            .into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to fetch shared task");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Get a single task attempt by ID (API key auth).
///
/// Used by remote nodes to fetch attempt details for cross-node viewing.
#[instrument(
    name = "nodes.get_attempt_sync",
    skip(state, node_ctx),
    fields(attempt_id = %attempt_id)
)]
pub async fn get_attempt_sync(
    State(state): State<AppState>,
    Extension(node_ctx): Extension<NodeAuthContext>,
    Path(attempt_id): Path<Uuid>,
) -> Response {
    use crate::db::node_execution_processes::NodeExecutionProcessRepository;
    use crate::db::node_task_attempts::NodeTaskAttemptRepository;
    use crate::db::tasks::SharedTaskRepository;

    let pool = state.pool();

    // Get the attempt
    let attempt_repo = NodeTaskAttemptRepository::new(pool);
    let attempt = match attempt_repo.find_by_id(attempt_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "task attempt not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch task attempt");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Validate organization ownership via the shared task
    let task_repo = SharedTaskRepository::new(pool);
    match task_repo.find_by_id(attempt.shared_task_id).await {
        Ok(Some(task)) => {
            if task.organization_id != node_ctx.organization_id {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "task attempt not found" })),
                )
                    .into_response();
            }
        }
        Ok(None) => {
            tracing::warn!(
                attempt_id = %attempt_id,
                shared_task_id = %attempt.shared_task_id,
                "attempt references non-existent shared task"
            );
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "task attempt not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch shared task for org validation");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    }

    // Get the execution processes for this attempt
    let exec_repo = NodeExecutionProcessRepository::new(pool);
    let executions = match exec_repo.find_by_attempt_id(attempt_id).await {
        Ok(execs) => execs,
        Err(e) => {
            tracing::error!(?e, "failed to fetch execution processes");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Determine if the attempt is complete (all executions in terminal state)
    let is_complete = executions
        .iter()
        .all(|e| matches!(e.status.as_str(), "completed" | "failed" | "killed"));

    // Fetch node info for cross-node proxy routing
    use crate::db::nodes::NodeRepository;
    let node_repo = NodeRepository::new(pool);
    let node_info = match node_repo.find_by_id(attempt.node_id).await {
        Ok(Some(node)) => Some(NodeInfo {
            id: node.id,
            name: node.name,
            public_url: node.public_url,
            status: node.status.to_string(),
        }),
        Ok(None) => {
            tracing::warn!(node_id = %attempt.node_id, "Node not found for attempt");
            None
        }
        Err(e) => {
            tracing::warn!(?e, node_id = %attempt.node_id, "Failed to fetch node info");
            None
        }
    };

    let response = NodeTaskAttemptResponse {
        attempt,
        executions,
        is_complete,
        node_info,
    };

    (StatusCode::OK, Json(response)).into_response()
}

/// Query parameters for paginated log retrieval
#[derive(Debug, Deserialize)]
pub struct GetAttemptLogsQuery {
    /// Maximum number of logs to return
    #[serde(default = "default_log_limit")]
    pub limit: i64,
    /// Cursor for pagination (entry ID)
    pub cursor: Option<i64>,
    /// Direction: "forward" (oldest first) or "backward" (newest first)
    #[serde(default)]
    pub direction: Option<String>,
}

fn default_log_limit() -> i64 {
    1000
}

/// Response for paginated log retrieval
#[derive(Debug, Serialize, Deserialize)]
pub struct GetAttemptLogsResponse {
    pub entries: Vec<utils::unified_log::LogEntry>,
    pub next_cursor: Option<i64>,
    pub has_more: bool,
    pub total_count: Option<i64>,
}

/// Get logs for a task attempt (API key auth).
///
/// Used by remote nodes to fetch logs for cross-node viewing.
#[instrument(
    name = "nodes.get_attempt_logs_sync",
    skip(state, _node_ctx, query),
    fields(attempt_id = %attempt_id)
)]
pub async fn get_attempt_logs_sync(
    State(state): State<AppState>,
    Extension(_node_ctx): Extension<NodeAuthContext>,
    Path(attempt_id): Path<Uuid>,
    Query(query): Query<GetAttemptLogsQuery>,
) -> Response {
    use crate::db::node_task_attempts::NodeTaskAttemptRepository;
    use crate::db::task_output_logs::TaskOutputLogRepository;
    use utils::unified_log::Direction;

    let pool = state.pool();

    // Verify the attempt exists
    let attempt_repo = NodeTaskAttemptRepository::new(pool);
    let attempt = match attempt_repo.find_by_id(attempt_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "task attempt not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch task attempt");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
    };

    // Logs are stored by assignment_id, which may be linked to the attempt
    // First try the direct assignment_id, then fall back to looking up by local_attempt_id
    let assignment_id = match attempt.assignment_id {
        Some(id) => id,
        None => {
            // Try to find assignment by looking up via local_attempt_id
            use crate::db::task_assignments::TaskAssignmentRepository;
            let assignment_repo = TaskAssignmentRepository::new(pool);
            match assignment_repo.find_by_local_attempt_id(attempt_id).await {
                Ok(Some(assignment)) => assignment.id,
                Ok(None) => {
                    // No assignment found, return empty logs
                    return (
                        StatusCode::OK,
                        Json(GetAttemptLogsResponse {
                            entries: vec![],
                            next_cursor: None,
                            has_more: false,
                            total_count: Some(0),
                        }),
                    )
                        .into_response();
                }
                Err(e) => {
                    tracing::error!(?e, "failed to look up assignment by local_attempt_id");
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": "internal server error" })),
                    )
                        .into_response();
                }
            }
        }
    };

    // Parse direction
    let direction = match query.direction.as_deref() {
        Some("forward") => Direction::Forward,
        _ => Direction::Backward, // Default to newest first
    };

    // Fetch paginated logs
    let log_repo = TaskOutputLogRepository::new(pool);
    match log_repo
        .find_paginated_with_count(assignment_id, query.cursor, query.limit, direction)
        .await
    {
        Ok(paginated) => {
            let response = GetAttemptLogsResponse {
                entries: paginated.entries,
                next_cursor: paginated.next_cursor,
                has_more: paginated.has_more,
                total_count: paginated.total_count,
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            tracing::error!(?e, "failed to fetch attempt logs");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to fetch logs" })),
            )
                .into_response()
        }
    }
}
