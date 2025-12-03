//! Node management routes - proxies to the remote hive server.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{delete, get},
};
use remote::nodes::{Node, NodeApiKey, NodeProject};
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ListNodesQuery {
    pub organization_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct ListApiKeysQuery {
    pub organization_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CreateApiKeyRequest {
    pub organization_id: Uuid,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct CreateApiKeyResponse {
    pub api_key: NodeApiKey,
    pub secret: String,
}

/// List all nodes for an organization.
pub async fn list_nodes(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListNodesQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<Node>>>, ApiError> {
    let client = deployment.remote_client()?;
    let nodes = client.list_nodes(query.organization_id).await?;
    Ok(ResponseJson(ApiResponse::success(nodes)))
}

/// Get a specific node by ID.
pub async fn get_node(
    State(deployment): State<DeploymentImpl>,
    Path(node_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Node>>, ApiError> {
    let client = deployment.remote_client()?;
    let node = client.get_node(node_id).await?;
    Ok(ResponseJson(ApiResponse::success(node)))
}

/// Delete a node.
pub async fn delete_node(
    State(deployment): State<DeploymentImpl>,
    Path(node_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let client = deployment.remote_client()?;
    client.delete_node(node_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

/// List projects linked to a node.
pub async fn list_node_projects(
    State(deployment): State<DeploymentImpl>,
    Path(node_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<NodeProject>>>, ApiError> {
    let client = deployment.remote_client()?;
    let projects = client.list_node_projects(node_id).await?;
    Ok(ResponseJson(ApiResponse::success(projects)))
}

/// List API keys for an organization.
pub async fn list_api_keys(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListApiKeysQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<NodeApiKey>>>, ApiError> {
    let client = deployment.remote_client()?;
    let keys = client.list_node_api_keys(query.organization_id).await?;
    Ok(ResponseJson(ApiResponse::success(keys)))
}

/// Create a new API key for an organization.
pub async fn create_api_key(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateApiKeyRequest>,
) -> Result<ResponseJson<ApiResponse<CreateApiKeyResponse>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client
        .create_node_api_key(request.organization_id, request.name)
        .await?;
    Ok(ResponseJson(ApiResponse::success(CreateApiKeyResponse {
        api_key: response.api_key,
        secret: response.secret,
    })))
}

/// Revoke an API key.
pub async fn revoke_api_key(
    State(deployment): State<DeploymentImpl>,
    Path(key_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let client = deployment.remote_client()?;
    client.revoke_node_api_key(key_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/nodes", get(list_nodes))
        .route("/nodes/{node_id}", get(get_node).delete(delete_node))
        .route("/nodes/{node_id}/projects", get(list_node_projects))
        .route("/nodes/api-keys", get(list_api_keys).post(create_api_key))
        .route("/nodes/api-keys/{key_id}", delete(revoke_api_key))
}
