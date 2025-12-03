use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::{HeaderMap, StatusCode},
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
    auth::RequestContext,
    nodes::{
        CreateNodeApiKey, HeartbeatPayload, LinkProjectData, Node, NodeApiKey, NodeError,
        NodeProject, NodeRegistration, NodeServiceImpl,
    },
};

/// Header name for API key authentication
const API_KEY_HEADER: &str = "x-api-key";

// ============================================================================
// Router Setup
// ============================================================================

/// Routes that require API key authentication (for nodes)
pub fn api_key_router() -> Router<AppState> {
    Router::new()
        .route("/nodes/register", post(register_node))
        .route("/nodes/{node_id}/heartbeat", post(heartbeat))
        .route("/nodes/{node_id}/projects", post(link_project))
        .route(
            "/nodes/{node_id}/projects/{link_id}",
            delete(unlink_project_by_id),
        )
}

/// Routes that require user JWT authentication
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/nodes/api-keys", post(create_api_key))
        .route("/nodes/api-keys", get(list_api_keys))
        .route("/nodes/api-keys/{key_id}", delete(revoke_api_key))
        .route("/nodes", get(list_nodes))
        .route("/nodes/{node_id}", get(get_node))
        .route("/nodes/{node_id}", delete(delete_node))
        .route("/nodes/{node_id}/projects", get(list_node_projects))
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
    pub linked_projects: Vec<NodeProject>,
}

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
            // Get linked projects
            let linked_projects = service
                .list_node_projects(node.id)
                .await
                .unwrap_or_default();

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
// Project Linking (API Key Auth)
// ============================================================================

#[instrument(
    name = "nodes.link_project",
    skip(state, headers, payload),
    fields(node_id = %node_id, project_id = %payload.project_id)
)]
pub async fn link_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(node_id): Path<Uuid>,
    Json(payload): Json<LinkProjectData>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    // Validate API key
    if let Err(response) = extract_and_validate_api_key(&service, &headers).await {
        return response;
    }

    match service.link_project(node_id, payload).await {
        Ok(link) => (StatusCode::CREATED, Json(link)).into_response(),
        Err(error) => node_error_response(error, "failed to link project"),
    }
}

#[instrument(
    name = "nodes.unlink_project",
    skip(state, headers),
    fields(node_id = %node_id, link_id = %link_id)
)]
pub async fn unlink_project_by_id(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((node_id, link_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let pool = state.pool();
    let service = NodeServiceImpl::new(pool.clone());

    // Validate API key
    if let Err(response) = extract_and_validate_api_key(&service, &headers).await {
        return response;
    }

    let _ = node_id; // We could verify the link belongs to this node

    // For now, just delete by project_id from the link
    // In the future we should verify the link belongs to the node
    match service.unlink_project(link_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => node_error_response(error, "failed to unlink project"),
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

    let _ = ctx; // TODO: Verify user has access to the node's organization

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

    match service.list_node_projects(node_id).await {
        Ok(projects) => (StatusCode::OK, Json(projects)).into_response(),
        Err(error) => node_error_response(error, "failed to list node projects"),
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
    let (status, message) = match &error {
        NodeError::NodeNotFound => (StatusCode::NOT_FOUND, "node not found"),
        NodeError::ApiKeyNotFound => (StatusCode::NOT_FOUND, "API key not found"),
        NodeError::ApiKeyInvalid => (StatusCode::UNAUTHORIZED, "invalid API key"),
        NodeError::ApiKeyRevoked => (StatusCode::UNAUTHORIZED, "API key revoked"),
        NodeError::ProjectAlreadyLinked => {
            (StatusCode::CONFLICT, "project already linked to a node")
        }
        NodeError::TaskAlreadyAssigned => (
            StatusCode::CONFLICT,
            "task already has an active assignment",
        ),
        NodeError::AssignmentNotFound => (StatusCode::NOT_FOUND, "assignment not found"),
        NodeError::NodeProjectNotFound => (StatusCode::NOT_FOUND, "node project link not found"),
        NodeError::Database(err) => {
            tracing::error!(?err, context, "database error in node operation");
            (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        }
    };

    (status, Json(json!({ "error": message }))).into_response()
}
