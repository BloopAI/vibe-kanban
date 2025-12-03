use rand::Rng;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::domain::{
    CreateNodeApiKey, HeartbeatPayload, LinkProjectData, Node, NodeApiKey, NodeProject,
    NodeRegistration, NodeStatus, NodeTaskAssignment, UpdateAssignmentData,
};

/// Type alias for registration data (used by WebSocket session)
pub type RegisterNode = NodeRegistration;
use crate::db::{
    node_api_keys::{NodeApiKeyError, NodeApiKeyRepository},
    node_projects::{NodeProjectError, NodeProjectRepository},
    nodes::{NodeDbError, NodeRepository},
    task_assignments::{TaskAssignmentError, TaskAssignmentRepository},
};

/// API key prefix used for identification (first 8 characters of the key)
const API_KEY_PREFIX_LEN: usize = 8;

/// Full API key length (32 bytes = 64 hex chars)
const API_KEY_LEN: usize = 32;

#[derive(Debug, Error)]
pub enum NodeError {
    #[error("node not found")]
    NodeNotFound,
    #[error("API key not found")]
    ApiKeyNotFound,
    #[error("API key invalid")]
    ApiKeyInvalid,
    #[error("API key revoked")]
    ApiKeyRevoked,
    #[error("project already linked to a node")]
    ProjectAlreadyLinked,
    #[error("task already has an active assignment")]
    TaskAlreadyAssigned,
    #[error("assignment not found")]
    AssignmentNotFound,
    #[error("node project link not found")]
    NodeProjectNotFound,
    #[error("database error: {0}")]
    Database(String),
}

impl From<NodeDbError> for NodeError {
    fn from(err: NodeDbError) -> Self {
        match err {
            NodeDbError::NotFound => NodeError::NodeNotFound,
            NodeDbError::AlreadyExists => NodeError::Database("node already exists".to_string()),
            NodeDbError::Database(e) => NodeError::Database(e.to_string()),
        }
    }
}

impl From<NodeApiKeyError> for NodeError {
    fn from(err: NodeApiKeyError) -> Self {
        match err {
            NodeApiKeyError::NotFound => NodeError::ApiKeyNotFound,
            NodeApiKeyError::Revoked => NodeError::ApiKeyRevoked,
            NodeApiKeyError::Database(e) => NodeError::Database(e.to_string()),
        }
    }
}

impl From<NodeProjectError> for NodeError {
    fn from(err: NodeProjectError) -> Self {
        match err {
            NodeProjectError::NotFound => NodeError::NodeProjectNotFound,
            NodeProjectError::ProjectAlreadyLinked => NodeError::ProjectAlreadyLinked,
            NodeProjectError::LocalProjectAlreadyLinked => {
                NodeError::Database("local project already linked".to_string())
            }
            NodeProjectError::Database(e) => NodeError::Database(e.to_string()),
        }
    }
}

impl From<TaskAssignmentError> for NodeError {
    fn from(err: TaskAssignmentError) -> Self {
        match err {
            TaskAssignmentError::NotFound => NodeError::AssignmentNotFound,
            TaskAssignmentError::AlreadyAssigned => NodeError::TaskAlreadyAssigned,
            TaskAssignmentError::Database(e) => NodeError::Database(e.to_string()),
        }
    }
}

/// Service for managing nodes in the swarm
pub struct NodeServiceImpl {
    pool: PgPool,
}

impl NodeServiceImpl {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // =========================================================================
    // API Key Management
    // =========================================================================

    /// Create a new API key for an organization.
    /// Returns the key record and the raw key value (only available at creation).
    pub async fn create_api_key(
        &self,
        organization_id: Uuid,
        data: CreateNodeApiKey,
        created_by: Uuid,
    ) -> Result<(NodeApiKey, String), NodeError> {
        // Generate a random API key
        let raw_key = generate_api_key();
        let key_prefix = &raw_key[..API_KEY_PREFIX_LEN];
        let key_hash = hash_api_key(&raw_key);

        let repo = NodeApiKeyRepository::new(&self.pool);
        let key = repo
            .create(organization_id, data, created_by, &key_hash, key_prefix)
            .await?;

        Ok((key, raw_key))
    }

    /// Validate an API key and return the key record if valid
    pub async fn validate_api_key(&self, raw_key: &str) -> Result<NodeApiKey, NodeError> {
        if raw_key.len() < API_KEY_PREFIX_LEN {
            return Err(NodeError::ApiKeyInvalid);
        }

        let prefix = &raw_key[..API_KEY_PREFIX_LEN];
        let repo = NodeApiKeyRepository::new(&self.pool);

        let key = repo
            .find_by_prefix(prefix)
            .await?
            .ok_or(NodeError::ApiKeyNotFound)?;

        // Check if key is revoked
        if key.revoked_at.is_some() {
            return Err(NodeError::ApiKeyRevoked);
        }

        // Verify the full hash
        let expected_hash = hash_api_key(raw_key);
        if key.key_hash != expected_hash {
            return Err(NodeError::ApiKeyInvalid);
        }

        // Update last used timestamp
        repo.touch(key.id).await?;

        Ok(key)
    }

    /// List all API keys for an organization
    pub async fn list_api_keys(&self, organization_id: Uuid) -> Result<Vec<NodeApiKey>, NodeError> {
        let repo = NodeApiKeyRepository::new(&self.pool);
        Ok(repo.list_by_organization(organization_id).await?)
    }

    /// Revoke an API key
    pub async fn revoke_api_key(&self, key_id: Uuid) -> Result<(), NodeError> {
        let repo = NodeApiKeyRepository::new(&self.pool);
        Ok(repo.revoke(key_id).await?)
    }

    /// Delete an API key
    pub async fn delete_api_key(&self, key_id: Uuid) -> Result<(), NodeError> {
        let repo = NodeApiKeyRepository::new(&self.pool);
        Ok(repo.delete(key_id).await?)
    }

    // =========================================================================
    // Node Management
    // =========================================================================

    /// Register a new node or update an existing one
    pub async fn register_node(
        &self,
        organization_id: Uuid,
        data: NodeRegistration,
    ) -> Result<Node, NodeError> {
        let repo = NodeRepository::new(&self.pool);
        Ok(repo.upsert(organization_id, data).await?)
    }

    /// Get a node by ID
    pub async fn get_node(&self, node_id: Uuid) -> Result<Node, NodeError> {
        let repo = NodeRepository::new(&self.pool);
        repo.find_by_id(node_id)
            .await?
            .ok_or(NodeError::NodeNotFound)
    }

    /// List all nodes for an organization
    pub async fn list_nodes(&self, organization_id: Uuid) -> Result<Vec<Node>, NodeError> {
        let repo = NodeRepository::new(&self.pool);
        Ok(repo.list_by_organization(organization_id).await?)
    }

    /// Process a heartbeat from a node
    pub async fn heartbeat(
        &self,
        node_id: Uuid,
        payload: HeartbeatPayload,
    ) -> Result<(), NodeError> {
        let repo = NodeRepository::new(&self.pool);
        Ok(repo.heartbeat(node_id, payload.status).await?)
    }

    /// Update a node's public URL
    pub async fn update_node_url(
        &self,
        node_id: Uuid,
        public_url: Option<&str>,
    ) -> Result<(), NodeError> {
        let repo = NodeRepository::new(&self.pool);
        Ok(repo.update_public_url(node_id, public_url).await?)
    }

    /// Delete a node
    pub async fn delete_node(&self, node_id: Uuid) -> Result<(), NodeError> {
        let repo = NodeRepository::new(&self.pool);
        Ok(repo.delete(node_id).await?)
    }

    /// Update a node's status (used by WebSocket session)
    pub async fn update_node_status(
        &self,
        node_id: Uuid,
        status: NodeStatus,
    ) -> Result<(), NodeError> {
        let repo = NodeRepository::new(&self.pool);
        Ok(repo.heartbeat(node_id, status).await?)
    }

    // =========================================================================
    // Project Linking
    // =========================================================================

    /// Link a project to a node
    pub async fn link_project(
        &self,
        node_id: Uuid,
        data: LinkProjectData,
    ) -> Result<NodeProject, NodeError> {
        let repo = NodeProjectRepository::new(&self.pool);
        Ok(repo
            .create(
                node_id,
                data.project_id,
                data.local_project_id,
                &data.git_repo_path,
                &data.default_branch,
            )
            .await?)
    }

    /// Get a project link by project ID
    pub async fn get_project_link(
        &self,
        project_id: Uuid,
    ) -> Result<Option<NodeProject>, NodeError> {
        let repo = NodeProjectRepository::new(&self.pool);
        Ok(repo.find_by_project(project_id).await?)
    }

    /// List all project links for a node
    pub async fn list_node_projects(&self, node_id: Uuid) -> Result<Vec<NodeProject>, NodeError> {
        let repo = NodeProjectRepository::new(&self.pool);
        Ok(repo.list_by_node(node_id).await?)
    }

    /// Update project sync status
    pub async fn update_project_sync(&self, link_id: Uuid, status: &str) -> Result<(), NodeError> {
        let repo = NodeProjectRepository::new(&self.pool);
        Ok(repo.update_sync_status(link_id, status).await?)
    }

    /// Unlink a project from its node (by project ID only)
    pub async fn unlink_project(&self, project_id: Uuid) -> Result<(), NodeError> {
        let repo = NodeProjectRepository::new(&self.pool);
        Ok(repo.delete_by_project(project_id).await?)
    }

    /// Unlink a project from a specific node.
    ///
    /// This method verifies that the node owns the project link before deleting.
    pub async fn unlink_project_for_node(
        &self,
        node_id: Uuid,
        project_id: Uuid,
    ) -> Result<(), NodeError> {
        let repo = NodeProjectRepository::new(&self.pool);
        Ok(repo.delete_by_node_and_project(node_id, project_id).await?)
    }

    // =========================================================================
    // Task Assignment
    // =========================================================================

    /// Create a task assignment
    pub async fn assign_task(
        &self,
        task_id: Uuid,
        node_id: Uuid,
        node_project_id: Uuid,
    ) -> Result<NodeTaskAssignment, NodeError> {
        let repo = TaskAssignmentRepository::new(&self.pool);
        Ok(repo.create(task_id, node_id, node_project_id).await?)
    }

    /// Get the active assignment for a task
    pub async fn get_active_assignment(
        &self,
        task_id: Uuid,
    ) -> Result<Option<NodeTaskAssignment>, NodeError> {
        let repo = TaskAssignmentRepository::new(&self.pool);
        Ok(repo.find_active_for_task(task_id).await?)
    }

    /// List active assignments for a node
    pub async fn list_node_assignments(
        &self,
        node_id: Uuid,
    ) -> Result<Vec<NodeTaskAssignment>, NodeError> {
        let repo = TaskAssignmentRepository::new(&self.pool);
        Ok(repo.list_active_by_node(node_id).await?)
    }

    /// Update an assignment
    pub async fn update_assignment(
        &self,
        assignment_id: Uuid,
        data: UpdateAssignmentData,
    ) -> Result<NodeTaskAssignment, NodeError> {
        let repo = TaskAssignmentRepository::new(&self.pool);
        Ok(repo.update(assignment_id, data).await?)
    }

    /// Update assignment local IDs (task and attempt IDs from the node)
    pub async fn update_assignment_local_ids(
        &self,
        assignment_id: Uuid,
        local_task_id: Option<Uuid>,
        local_attempt_id: Option<Uuid>,
    ) -> Result<(), NodeError> {
        let data = UpdateAssignmentData {
            local_task_id,
            local_attempt_id,
            execution_status: None,
        };
        let repo = TaskAssignmentRepository::new(&self.pool);
        repo.update(assignment_id, data).await?;
        Ok(())
    }

    /// Update assignment execution status
    pub async fn update_assignment_status(
        &self,
        assignment_id: Uuid,
        status: &str,
    ) -> Result<(), NodeError> {
        let data = UpdateAssignmentData {
            local_task_id: None,
            local_attempt_id: None,
            execution_status: Some(status.to_string()),
        };
        let repo = TaskAssignmentRepository::new(&self.pool);
        repo.update(assignment_id, data).await?;
        Ok(())
    }

    /// Complete an assignment
    pub async fn complete_assignment(
        &self,
        assignment_id: Uuid,
        status: &str,
    ) -> Result<(), NodeError> {
        let repo = TaskAssignmentRepository::new(&self.pool);
        Ok(repo.complete(assignment_id, status).await?)
    }

    /// Fail all active assignments for a node (used when node goes offline)
    pub async fn fail_node_assignments(&self, node_id: Uuid) -> Result<Vec<Uuid>, NodeError> {
        let repo = TaskAssignmentRepository::new(&self.pool);
        Ok(repo.fail_node_assignments(node_id).await?)
    }
}

/// Trait for the node service (for testing/mocking)
pub trait NodeService: Send + Sync {
    fn create_api_key(
        &self,
        organization_id: Uuid,
        data: CreateNodeApiKey,
        created_by: Uuid,
    ) -> impl std::future::Future<Output = Result<(NodeApiKey, String), NodeError>> + Send;

    fn validate_api_key(
        &self,
        raw_key: &str,
    ) -> impl std::future::Future<Output = Result<NodeApiKey, NodeError>> + Send;

    fn register_node(
        &self,
        organization_id: Uuid,
        data: NodeRegistration,
    ) -> impl std::future::Future<Output = Result<Node, NodeError>> + Send;

    fn heartbeat(
        &self,
        node_id: Uuid,
        payload: HeartbeatPayload,
    ) -> impl std::future::Future<Output = Result<(), NodeError>> + Send;

    fn list_nodes(
        &self,
        organization_id: Uuid,
    ) -> impl std::future::Future<Output = Result<Vec<Node>, NodeError>> + Send;
}

impl NodeService for NodeServiceImpl {
    async fn create_api_key(
        &self,
        organization_id: Uuid,
        data: CreateNodeApiKey,
        created_by: Uuid,
    ) -> Result<(NodeApiKey, String), NodeError> {
        self.create_api_key(organization_id, data, created_by).await
    }

    async fn validate_api_key(&self, raw_key: &str) -> Result<NodeApiKey, NodeError> {
        self.validate_api_key(raw_key).await
    }

    async fn register_node(
        &self,
        organization_id: Uuid,
        data: NodeRegistration,
    ) -> Result<Node, NodeError> {
        self.register_node(organization_id, data).await
    }

    async fn heartbeat(&self, node_id: Uuid, payload: HeartbeatPayload) -> Result<(), NodeError> {
        self.heartbeat(node_id, payload).await
    }

    async fn list_nodes(&self, organization_id: Uuid) -> Result<Vec<Node>, NodeError> {
        self.list_nodes(organization_id).await
    }
}

/// Generate a random API key (32 bytes = 64 hex characters)
fn generate_api_key() -> String {
    let mut rng = rand::rng();
    let bytes: [u8; API_KEY_LEN] = rng.random();
    hex::encode(bytes)
}

/// Hash an API key using SHA256
fn hash_api_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_api_key_length() {
        let key = generate_api_key();
        assert_eq!(key.len(), API_KEY_LEN * 2); // hex encoding doubles length
    }

    #[test]
    fn test_hash_api_key_deterministic() {
        let key = "test_key_12345678901234567890123456789012";
        let hash1 = hash_api_key(key);
        let hash2 = hash_api_key(key);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_api_key_different_inputs() {
        let hash1 = hash_api_key("key1");
        let hash2 = hash_api_key("key2");
        assert_ne!(hash1, hash2);
    }
}
