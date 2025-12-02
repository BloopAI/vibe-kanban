//! Task dispatcher for streaming task assignments to nodes.
//!
//! This module handles the assignment and dispatch of tasks to connected nodes.

use sqlx::PgPool;
use uuid::Uuid;

use super::{
    connection::ConnectionManager,
    message::{HiveMessage, TaskAssignMessage, TaskDetails},
};
use crate::nodes::service::{NodeError, NodeServiceImpl};

/// Dispatcher for sending tasks to nodes.
#[derive(Clone)]
pub struct TaskDispatcher {
    pool: PgPool,
    connections: ConnectionManager,
}

impl TaskDispatcher {
    /// Create a new task dispatcher.
    pub fn new(pool: PgPool, connections: ConnectionManager) -> Self {
        Self { pool, connections }
    }

    /// Assign a task to a node.
    ///
    /// This will:
    /// 1. Find the node linked to the task's project
    /// 2. Create a task assignment record
    /// 3. Send the assignment to the node via WebSocket
    pub async fn assign_task(
        &self,
        task_id: Uuid,
        project_id: Uuid,
        task_details: TaskDetails,
    ) -> Result<AssignResult, DispatchError> {
        let service = NodeServiceImpl::new(self.pool.clone());

        // Find the node linked to this project
        let project_link = service
            .get_project_link(project_id)
            .await?
            .ok_or(DispatchError::NoNodeForProject)?;

        // Check if node is connected
        if !self.connections.is_connected(project_link.node_id).await {
            return Err(DispatchError::NodeNotConnected);
        }

        // Create the assignment
        let assignment = service
            .assign_task(task_id, project_link.node_id, project_link.id)
            .await?;

        // Build the assign message
        let message = HiveMessage::TaskAssign(TaskAssignMessage {
            message_id: Uuid::new_v4(),
            assignment_id: assignment.id,
            task_id,
            node_project_id: project_link.id,
            local_project_id: project_link.local_project_id,
            task: task_details,
        });

        // Send to the node
        self.connections
            .send_to_node(project_link.node_id, message)
            .await
            .map_err(|e| DispatchError::SendFailed(e.to_string()))?;

        tracing::info!(
            task_id = %task_id,
            node_id = %project_link.node_id,
            assignment_id = %assignment.id,
            "task assigned to node"
        );

        Ok(AssignResult {
            assignment_id: assignment.id,
            node_id: project_link.node_id,
        })
    }

    /// Cancel a task on a node.
    ///
    /// Note: This currently only marks the assignment as cancelled in the database.
    /// Sending the cancel message to the node requires knowing which node has the assignment,
    /// which will be implemented when we add assignment tracking.
    pub async fn cancel_task(
        &self,
        assignment_id: Uuid,
        _reason: Option<String>,
    ) -> Result<(), DispatchError> {
        let service = NodeServiceImpl::new(self.pool.clone());

        // Mark the assignment as cancelled in the database
        service
            .update_assignment_status(assignment_id, "cancelled")
            .await?;

        // TODO: Send cancel message to the node once we have assignment->node tracking
        // let message = HiveMessage::TaskCancel(TaskCancelMessage {
        //     message_id: Uuid::new_v4(),
        //     assignment_id,
        //     reason,
        // });

        tracing::info!(assignment_id = %assignment_id, "task cancellation requested");

        Ok(())
    }

    /// Find an available node for a project and assign the task.
    pub async fn dispatch_to_available_node(
        &self,
        task_id: Uuid,
        organization_id: Uuid,
        task_details: TaskDetails,
    ) -> Result<AssignResult, DispatchError> {
        // Find an available node in the organization
        let node_info = self
            .connections
            .find_available_node(organization_id)
            .await
            .ok_or(DispatchError::NoAvailableNode)?;

        let service = NodeServiceImpl::new(self.pool.clone());

        // Get the node's projects to find a suitable one
        let projects = service.list_node_projects(node_info.node_id).await?;

        if projects.is_empty() {
            return Err(DispatchError::NoProjectOnNode);
        }

        // Use the first project (in production, we'd match based on requirements)
        let project_link = &projects[0];

        // Create the assignment
        let assignment = service
            .assign_task(task_id, node_info.node_id, project_link.id)
            .await?;

        // Build the assign message
        let message = HiveMessage::TaskAssign(TaskAssignMessage {
            message_id: Uuid::new_v4(),
            assignment_id: assignment.id,
            task_id,
            node_project_id: project_link.id,
            local_project_id: project_link.local_project_id,
            task: task_details,
        });

        // Send to the node
        self.connections
            .send_to_node(node_info.node_id, message)
            .await
            .map_err(|e| DispatchError::SendFailed(e.to_string()))?;

        tracing::info!(
            task_id = %task_id,
            node_id = %node_info.node_id,
            assignment_id = %assignment.id,
            "task dispatched to available node"
        );

        Ok(AssignResult {
            assignment_id: assignment.id,
            node_id: node_info.node_id,
        })
    }
}

/// Result of a successful task assignment.
#[derive(Debug, Clone)]
pub struct AssignResult {
    /// The assignment ID
    pub assignment_id: Uuid,
    /// The node that received the task
    pub node_id: Uuid,
}

/// Error when dispatching a task.
#[derive(Debug, thiserror::Error)]
pub enum DispatchError {
    #[error("no node is linked to this project")]
    NoNodeForProject,
    #[error("the linked node is not connected")]
    NodeNotConnected,
    #[error("no available node in the organization")]
    NoAvailableNode,
    #[error("the node has no linked projects")]
    NoProjectOnNode,
    #[error("failed to send to node: {0}")]
    SendFailed(String),
    #[error("node service error: {0}")]
    NodeService(#[from] NodeError),
}
