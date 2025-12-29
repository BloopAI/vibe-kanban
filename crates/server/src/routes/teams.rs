use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{delete, get, post},
};
use db::models::team::{CreateTeam, Team, TeamProject, TeamProjectAssignment, UpdateTeam};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_team_middleware};

/// Get all teams
pub async fn get_teams(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Team>>>, ApiError> {
    let teams = Team::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(teams)))
}

/// Get a single team by ID
pub async fn get_team(
    Extension(team): Extension<Team>,
) -> Result<ResponseJson<ApiResponse<Team>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(team)))
}

/// Create a new team
pub async fn create_team(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTeam>,
) -> Result<ResponseJson<ApiResponse<Team>>, ApiError> {
    let team = Team::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "team_created",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "team_name": team.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(team)))
}

/// Update an existing team
pub async fn update_team(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTeam>,
) -> Result<ResponseJson<ApiResponse<Team>>, ApiError> {
    let updated_team = Team::update(&deployment.db().pool, team.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "team_updated",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "team_name": updated_team.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_team)))
}

/// Delete a team
pub async fn delete_team(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = Team::delete(&deployment.db().pool, team.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "team_deleted",
                serde_json::json!({
                    "team_id": team.id.to_string(),
                }),
            )
            .await;
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

/// Get all project IDs assigned to a team
pub async fn get_team_projects(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Uuid>>>, ApiError> {
    let project_ids = Team::get_projects(&deployment.db().pool, team.id).await?;
    Ok(ResponseJson(ApiResponse::success(project_ids)))
}

/// Assign a project to a team
pub async fn assign_project_to_team(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<TeamProjectAssignment>,
) -> Result<ResponseJson<ApiResponse<TeamProject>>, ApiError> {
    let team_project =
        Team::assign_project(&deployment.db().pool, team.id, payload.project_id).await?;

    deployment
        .track_if_analytics_allowed(
            "team_project_assigned",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "project_id": payload.project_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(team_project)))
}

/// Remove a project from a team
pub async fn remove_project_from_team(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, project_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = Team::remove_project(&deployment.db().pool, team.id, project_id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "team_project_removed",
                serde_json::json!({
                    "team_id": team.id.to_string(),
                    "project_id": project_id.to_string(),
                }),
            )
            .await;
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let team_router = Router::new()
        .route("/", get(get_team).put(update_team).delete(delete_team))
        .route("/projects", get(get_team_projects).post(assign_project_to_team))
        .route("/projects/{project_id}", delete(remove_project_from_team))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    let inner = Router::new()
        .route("/", get(get_teams).post(create_team))
        .nest("/{team_id}", team_router);

    Router::new().nest("/teams", inner)
}
