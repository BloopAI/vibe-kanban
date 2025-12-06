//! Node cache service for syncing node/project data from the hive.
//!
//! This service fetches all nodes and their projects from the hive
//! and caches them locally in SQLite. This allows the frontend to show a unified
//! view of all projects across all nodes in the organization.
//!
//! The sync can be triggered:
//! - On user login (to sync their organizations)
//! - Periodically as a background task
//! - On-demand when the user views the unified projects page

use std::sync::Arc;
use std::time::Duration;

use db::models::{
    cached_node::{CachedNode, CachedNodeCapabilities, CachedNodeInput, CachedNodeStatus},
    project::Project,
};
use remote::nodes::Node;
use sqlx::SqlitePool;
use tokio::sync::RwLock;
use tokio::time::{self, MissedTickBehavior};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use super::remote_client::{RemoteClient, RemoteClientError};

/// Default sync interval (5 minutes)
const DEFAULT_SYNC_INTERVAL: Duration = Duration::from_secs(300);

/// Sync nodes and projects for an organization.
///
/// This is a stateless function that can be called from anywhere.
/// It fetches nodes and projects from the remote API and caches them locally.
pub async fn sync_organization(
    pool: &SqlitePool,
    remote_client: &RemoteClient,
    organization_id: Uuid,
) -> Result<SyncStats, NodeCacheSyncError> {
    let syncer = NodeCacheSyncer::new(pool, remote_client, organization_id);
    syncer.sync().await
}

/// Sync all organizations the user has access to.
///
/// Fetches the list of organizations from the remote API and syncs nodes
/// for each one.
pub async fn sync_all_organizations(
    pool: &SqlitePool,
    remote_client: &RemoteClient,
) -> Result<Vec<(Uuid, SyncStats)>, NodeCacheSyncError> {
    debug!("fetching organizations for node cache sync");

    let orgs = match remote_client.list_organizations().await {
        Ok(orgs) => orgs,
        Err(e) => {
            warn!(error = %e, "failed to fetch organizations for node cache sync");
            return Err(NodeCacheSyncError::Remote(e));
        }
    };

    if orgs.organizations.is_empty() {
        info!("no organizations found, skipping node cache sync");
        return Ok(vec![]);
    }

    info!(
        org_count = orgs.organizations.len(),
        "fetched organizations for node cache sync"
    );

    let mut results = Vec::with_capacity(orgs.organizations.len());

    for org in orgs.organizations {
        match sync_organization(pool, remote_client, org.id).await {
            Ok(stats) => {
                info!(
                    organization_id = %org.id,
                    organization_name = %org.name,
                    nodes_synced = stats.nodes_synced,
                    "synced organization nodes"
                );
                results.push((org.id, stats));
            }
            Err(e) => {
                warn!(
                    organization_id = %org.id,
                    error = %e,
                    "failed to sync organization nodes"
                );
            }
        }
    }

    Ok(results)
}

/// Internal syncer for a single organization.
struct NodeCacheSyncer<'a> {
    pool: &'a SqlitePool,
    remote_client: &'a RemoteClient,
    organization_id: Uuid,
}

impl<'a> NodeCacheSyncer<'a> {
    fn new(pool: &'a SqlitePool, remote_client: &'a RemoteClient, organization_id: Uuid) -> Self {
        Self {
            pool,
            remote_client,
            organization_id,
        }
    }

    /// Perform a single sync operation
    async fn sync(&self) -> Result<SyncStats, NodeCacheSyncError> {
        let org_id = self.organization_id;
        let mut stats = SyncStats::default();

        debug!(organization_id = %org_id, "fetching nodes for organization");

        // Fetch all nodes from the hive
        let nodes = match self.remote_client.list_nodes(org_id).await {
            Ok(nodes) => nodes,
            Err(e) => {
                warn!(organization_id = %org_id, error = %e, "failed to fetch nodes from hive");
                return Err(NodeCacheSyncError::Remote(e));
            }
        };

        info!(
            organization_id = %org_id,
            node_count = nodes.len(),
            "fetched nodes from hive"
        );

        let mut synced_node_ids = Vec::with_capacity(nodes.len());

        // Upsert each node
        for node in nodes {
            let node_id = node.id;
            synced_node_ids.push(node_id);

            // Convert and upsert the node
            let input = self.node_to_input(&node);
            match CachedNode::upsert(self.pool, input).await {
                Ok(cached) => {
                    debug!(
                        cached_node_id = %cached.id,
                        cached_node_name = %cached.name,
                        "successfully cached node"
                    );
                    stats.nodes_synced += 1;
                }
                Err(e) => {
                    tracing::error!(
                        node_id = %node_id,
                        error = %e,
                        "failed to upsert cached node"
                    );
                    return Err(NodeCacheSyncError::Database(e));
                }
            }

            // Fetch and sync projects for this node
            match self.sync_node_projects(&node).await {
                Ok(project_stats) => {
                    stats.projects_synced += project_stats.0;
                    stats.projects_removed += project_stats.1;
                }
                Err(e) => {
                    warn!(node_id = %node_id, error = %e, "failed to sync projects for node");
                }
            }
        }

        // Remove stale nodes (nodes no longer in the hive)
        let removed = CachedNode::remove_stale(self.pool, org_id, &synced_node_ids)
            .await
            .map_err(NodeCacheSyncError::Database)?;
        stats.nodes_removed = removed as usize;

        Ok(stats)
    }

    /// Sync projects for a specific node into the unified projects table
    async fn sync_node_projects(&self, node: &Node) -> Result<(usize, usize), NodeCacheSyncError> {
        let projects = self
            .remote_client
            .list_node_projects(node.id)
            .await
            .map_err(NodeCacheSyncError::Remote)?;

        debug!(node_id = %node.id, project_count = projects.len(), "fetched projects for node");

        let mut synced_count = 0;
        let mut synced_remote_project_ids = Vec::with_capacity(projects.len());

        for project in projects {
            synced_remote_project_ids.push(project.project_id);

            // Extract project name from git repo path
            let project_name = std::path::Path::new(&project.git_repo_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string();

            // Convert node status to string for storage
            let node_status = match node.status {
                remote::nodes::NodeStatus::Pending => "pending",
                remote::nodes::NodeStatus::Online => "online",
                remote::nodes::NodeStatus::Offline => "offline",
                remote::nodes::NodeStatus::Busy => "busy",
                remote::nodes::NodeStatus::Draining => "draining",
            }
            .to_string();

            match Project::upsert_remote_project(
                self.pool,
                Uuid::new_v4(), // local_id for new projects
                project.project_id,
                project_name.clone(),
                project.git_repo_path.clone(),
                node.id,
                node.name.clone(),
                node.public_url.clone(),
                Some(node_status),
            )
            .await
            {
                Ok(cached) => {
                    debug!(
                        cached_id = %cached.id,
                        project_name = %cached.name,
                        source_node_id = ?cached.source_node_id,
                        "successfully synced remote project to unified table"
                    );
                    synced_count += 1;
                }
                Err(e) => {
                    tracing::error!(
                        node_id = %node.id,
                        project_id = %project.project_id,
                        error = %e,
                        "failed to upsert remote project"
                    );
                    return Err(NodeCacheSyncError::Database(e));
                }
            }
        }

        // Remove stale remote projects (those no longer in the hive)
        // Note: We pass all synced project IDs across all nodes to avoid
        // accidentally deleting projects from other nodes
        let removed =
            Project::delete_stale_remote_projects(self.pool, &synced_remote_project_ids).await?;

        Ok((synced_count, removed as usize))
    }

    /// Convert a remote Node to a CachedNodeInput
    fn node_to_input(&self, node: &Node) -> CachedNodeInput {
        CachedNodeInput {
            id: node.id,
            organization_id: node.organization_id,
            name: node.name.clone(),
            machine_id: node.machine_id.clone(),
            status: self.convert_status(&node.status),
            capabilities: CachedNodeCapabilities {
                executors: node.capabilities.executors.clone(),
                max_concurrent_tasks: node.capabilities.max_concurrent_tasks,
                os: node.capabilities.os.clone(),
                arch: node.capabilities.arch.clone(),
                version: node.capabilities.version.clone(),
            },
            public_url: node.public_url.clone(),
            last_heartbeat_at: node.last_heartbeat_at,
            connected_at: node.connected_at,
            disconnected_at: node.disconnected_at,
            created_at: node.created_at,
            updated_at: node.updated_at,
        }
    }

    /// Convert remote NodeStatus to CachedNodeStatus
    fn convert_status(&self, status: &remote::nodes::NodeStatus) -> CachedNodeStatus {
        match status {
            remote::nodes::NodeStatus::Pending => CachedNodeStatus::Pending,
            remote::nodes::NodeStatus::Online => CachedNodeStatus::Online,
            remote::nodes::NodeStatus::Offline => CachedNodeStatus::Offline,
            remote::nodes::NodeStatus::Busy => CachedNodeStatus::Busy,
            remote::nodes::NodeStatus::Draining => CachedNodeStatus::Draining,
        }
    }
}

/// Background sync service that periodically syncs all organizations.
pub struct NodeCacheSyncService {
    pool: SqlitePool,
    remote_client: RemoteClient,
    sync_interval: Duration,
    /// Stop signal
    stop: Arc<RwLock<bool>>,
}

impl NodeCacheSyncService {
    /// Create a new background sync service
    pub fn new(pool: SqlitePool, remote_client: RemoteClient) -> Self {
        Self {
            pool,
            remote_client,
            sync_interval: DEFAULT_SYNC_INTERVAL,
            stop: Arc::new(RwLock::new(false)),
        }
    }

    /// Set the sync interval
    pub fn with_interval(mut self, interval: Duration) -> Self {
        self.sync_interval = interval;
        self
    }

    /// Run the background sync loop
    pub async fn run(self) {
        let mut interval = time::interval(self.sync_interval);
        interval.set_missed_tick_behavior(MissedTickBehavior::Delay);

        // Sync immediately on startup
        self.do_sync().await;

        loop {
            interval.tick().await;

            if *self.stop.read().await {
                info!("node cache sync service stopped");
                break;
            }

            self.do_sync().await;
        }
    }

    async fn do_sync(&self) {
        match sync_all_organizations(&self.pool, &self.remote_client).await {
            Ok(results) => {
                let total_nodes: usize = results.iter().map(|(_, s)| s.nodes_synced).sum();
                let total_projects: usize = results.iter().map(|(_, s)| s.projects_synced).sum();
                info!(
                    organizations = results.len(),
                    nodes = total_nodes,
                    projects = total_projects,
                    "node cache sync completed"
                );
            }
            Err(e) => {
                warn!(error = %e, "node cache sync failed");
            }
        }
    }

    /// Request the service to stop
    pub async fn stop(&self) {
        *self.stop.write().await = true;
    }
}

/// Statistics from a sync operation
#[derive(Debug, Default, Clone)]
pub struct SyncStats {
    pub nodes_synced: usize,
    pub nodes_removed: usize,
    pub projects_synced: usize,
    pub projects_removed: usize,
}

/// Errors from the node cache sync service
#[derive(Debug, thiserror::Error)]
pub enum NodeCacheSyncError {
    #[error("remote client error: {0}")]
    Remote(#[from] RemoteClientError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
