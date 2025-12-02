//! Connection manager for tracking connected nodes.
//!
//! This module provides a centralized registry of connected nodes and their
//! WebSocket channels for sending messages.

use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;

use super::message::HiveMessage;
use crate::nodes::domain::NodeStatus;

/// Handle for sending messages to a connected node.
#[derive(Debug, Clone)]
pub struct NodeConnection {
    /// Node ID
    pub node_id: Uuid,
    /// Organization ID
    pub organization_id: Uuid,
    /// Channel for sending messages to this node
    pub sender: mpsc::Sender<HiveMessage>,
    /// When the connection was established
    pub connected_at: DateTime<Utc>,
    /// Current status
    pub status: NodeStatus,
    /// Number of active tasks
    pub active_tasks: u32,
}

/// Manager for all connected nodes.
#[derive(Debug, Clone)]
pub struct ConnectionManager {
    inner: Arc<RwLock<ConnectionManagerInner>>,
}

#[derive(Debug, Default)]
struct ConnectionManagerInner {
    /// Map of node_id -> connection
    connections: HashMap<Uuid, NodeConnection>,
    /// Map of organization_id -> set of node_ids
    org_nodes: HashMap<Uuid, Vec<Uuid>>,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionManager {
    /// Create a new connection manager.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(ConnectionManagerInner::default())),
        }
    }

    /// Register a new node connection.
    pub async fn register(
        &self,
        node_id: Uuid,
        organization_id: Uuid,
        sender: mpsc::Sender<HiveMessage>,
    ) {
        let mut inner = self.inner.write().await;

        let connection = NodeConnection {
            node_id,
            organization_id,
            sender,
            connected_at: Utc::now(),
            status: NodeStatus::Online,
            active_tasks: 0,
        };

        inner.connections.insert(node_id, connection);
        inner
            .org_nodes
            .entry(organization_id)
            .or_default()
            .push(node_id);

        tracing::info!(
            node_id = %node_id,
            organization_id = %organization_id,
            "node connected"
        );
    }

    /// Unregister a node connection.
    pub async fn unregister(&self, node_id: Uuid) {
        let mut inner = self.inner.write().await;

        if let Some(conn) = inner.connections.remove(&node_id) {
            if let Some(nodes) = inner.org_nodes.get_mut(&conn.organization_id) {
                nodes.retain(|id| *id != node_id);
                if nodes.is_empty() {
                    inner.org_nodes.remove(&conn.organization_id);
                }
            }

            tracing::info!(
                node_id = %node_id,
                organization_id = %conn.organization_id,
                "node disconnected"
            );
        }
    }

    /// Update a node's status.
    pub async fn update_status(&self, node_id: Uuid, status: NodeStatus, active_tasks: u32) {
        let mut inner = self.inner.write().await;

        if let Some(conn) = inner.connections.get_mut(&node_id) {
            conn.status = status;
            conn.active_tasks = active_tasks;
        }
    }

    /// Send a message to a specific node.
    pub async fn send_to_node(&self, node_id: Uuid, message: HiveMessage) -> Result<(), SendError> {
        let inner = self.inner.read().await;

        let conn = inner
            .connections
            .get(&node_id)
            .ok_or(SendError::NotConnected)?;

        conn.sender
            .send(message)
            .await
            .map_err(|_| SendError::ChannelClosed)
    }

    /// Send a message to all nodes in an organization.
    pub async fn broadcast_to_org(&self, organization_id: Uuid, message: HiveMessage) -> Vec<Uuid> {
        let inner = self.inner.read().await;
        let mut failed = Vec::new();

        if let Some(node_ids) = inner.org_nodes.get(&organization_id) {
            for node_id in node_ids {
                if let Some(conn) = inner.connections.get(node_id)
                    && conn.sender.send(message.clone()).await.is_err()
                {
                    failed.push(*node_id);
                }
            }
        }

        failed
    }

    /// Get a node's connection info.
    pub async fn get_connection(&self, node_id: Uuid) -> Option<NodeConnectionInfo> {
        let inner = self.inner.read().await;

        inner
            .connections
            .get(&node_id)
            .map(|conn| NodeConnectionInfo {
                node_id: conn.node_id,
                organization_id: conn.organization_id,
                connected_at: conn.connected_at,
                status: conn.status,
                active_tasks: conn.active_tasks,
            })
    }

    /// Get all connected nodes for an organization.
    pub async fn get_org_nodes(&self, organization_id: Uuid) -> Vec<NodeConnectionInfo> {
        let inner = self.inner.read().await;

        inner
            .org_nodes
            .get(&organization_id)
            .map(|node_ids| {
                node_ids
                    .iter()
                    .filter_map(|id| {
                        inner.connections.get(id).map(|conn| NodeConnectionInfo {
                            node_id: conn.node_id,
                            organization_id: conn.organization_id,
                            connected_at: conn.connected_at,
                            status: conn.status,
                            active_tasks: conn.active_tasks,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Check if a node is connected.
    pub async fn is_connected(&self, node_id: Uuid) -> bool {
        let inner = self.inner.read().await;
        inner.connections.contains_key(&node_id)
    }

    /// Get the total number of connected nodes.
    pub async fn connection_count(&self) -> usize {
        let inner = self.inner.read().await;
        inner.connections.len()
    }

    /// Find an available node for task execution in an organization.
    /// Returns the node with the lowest active task count.
    pub async fn find_available_node(&self, organization_id: Uuid) -> Option<NodeConnectionInfo> {
        let inner = self.inner.read().await;

        inner
            .org_nodes
            .get(&organization_id)?
            .iter()
            .filter_map(|id| inner.connections.get(id))
            .filter(|conn| matches!(conn.status, NodeStatus::Online))
            .min_by_key(|conn| conn.active_tasks)
            .map(|conn| NodeConnectionInfo {
                node_id: conn.node_id,
                organization_id: conn.organization_id,
                connected_at: conn.connected_at,
                status: conn.status,
                active_tasks: conn.active_tasks,
            })
    }
}

/// Public connection info (without the sender channel).
#[derive(Debug, Clone)]
pub struct NodeConnectionInfo {
    pub node_id: Uuid,
    pub organization_id: Uuid,
    pub connected_at: DateTime<Utc>,
    pub status: NodeStatus,
    pub active_tasks: u32,
}

/// Error when sending to a node.
#[derive(Debug, thiserror::Error)]
pub enum SendError {
    #[error("node not connected")]
    NotConnected,
    #[error("channel closed")]
    ChannelClosed,
}
