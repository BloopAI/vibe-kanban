pub mod error;
pub mod file_reader;
pub mod mcp;
pub mod middleware;
pub mod routes;

// #[cfg(feature = "cloud")]
// type DeploymentImpl = vibe_kanban_cloud::deployment::CloudDeployment;
// #[cfg(not(feature = "cloud"))]
pub type DeploymentImpl = local_deployment::LocalDeployment;
