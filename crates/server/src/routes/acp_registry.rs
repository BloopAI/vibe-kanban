use axum::{Router, response::Json as ResponseJson, routing::get};
use executors::executors::acp::registry::{self, RegistryAgent};
use serde::Serialize;
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/acp-registry/agents", get(list_agents))
}

/// An agent from the ACP registry that can be installed
#[derive(Debug, Clone, Serialize, TS)]
pub struct AcpRegistryAgent {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub icon: Option<String>,
}

impl From<RegistryAgent> for AcpRegistryAgent {
    fn from(agent: RegistryAgent) -> Self {
        Self {
            id: agent.id,
            name: agent.name,
            version: agent.version,
            description: agent.description,
            icon: agent.icon,
        }
    }
}

async fn list_agents() -> Result<ResponseJson<ApiResponse<Vec<AcpRegistryAgent>>>, ApiError> {
    let agents = registry::refresh().await?;
    Ok(ResponseJson(ApiResponse::success(
        agents.into_iter().map(AcpRegistryAgent::from).collect(),
    )))
}
