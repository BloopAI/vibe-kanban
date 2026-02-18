use axum::{
    Router,
    extract::{Json, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::project::Project;
use deployment::Deployment;
use services::services::migration::{MigrationRequest, MigrationResponse, MigrationService};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/migration/start", post(start_migration))
        .route("/migration/projects", get(list_projects))
}

async fn start_migration(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<MigrationRequest>,
) -> Result<ResponseJson<ApiResponse<MigrationResponse>>, ApiError> {
    let remote_client = deployment.remote_client()?;
    let sqlite_pool = deployment.db().pool.clone();

    let service = MigrationService::new(sqlite_pool, remote_client);
    let project_ids = request.project_id_set();
    let report = service
        .run_migration(request.organization_id, project_ids)
        .await?;

    Ok(ResponseJson(ApiResponse::success(MigrationResponse {
        report,
    })))
}

async fn list_projects(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Project>>>, ApiError> {
    let pool = &deployment.db().pool;
    let projects = Project::find_all(pool).await?;

    Ok(ResponseJson(ApiResponse::success(projects)))
}
