use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    routing::post,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::{
    error::{ErrorResponse, db_error},
    organization_members::ensure_project_access,
};
use api_types::{DeleteResponse, MutationResponse};
use crate::{
    AppState,
    auth::RequestContext,
    db::{get_txid, project_statuses::ProjectStatusRepository, types::is_valid_hsl_color},
    mutation_definition::MutationBuilder,
};
use api_types::{
    CreateProjectStatusRequest, ListProjectStatusesQuery, ListProjectStatusesResponse,
    ProjectStatus, UpdateProjectStatusRequest,
};

/// Mutation definition for ProjectStatus - provides both router and TypeScript metadata.
pub fn mutation() -> MutationBuilder<ProjectStatus, CreateProjectStatusRequest, UpdateProjectStatusRequest> {
    MutationBuilder::new("project_statuses")
        .list(list_project_statuses)
        .get(get_project_status)
        .create(create_project_status)
        .update(update_project_status)
        .delete(delete_project_status)
}

/// Router for project status endpoints including bulk update
pub fn router() -> axum::Router<AppState> {
    mutation()
        .router()
        .route("/project_statuses/bulk", post(bulk_update_project_statuses))
}

#[instrument(
    name = "project_statuses.list_project_statuses",
    skip(state, ctx),
    fields(project_id = %query.project_id, user_id = %ctx.user.id)
)]
async fn list_project_statuses(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListProjectStatusesQuery>,
) -> Result<Json<ListProjectStatusesResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let project_statuses = ProjectStatusRepository::list_by_project(state.pool(), query.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, project_id = %query.project_id, "failed to list project statuses");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list project statuses",
            )
        })?;

    Ok(Json(ListProjectStatusesResponse { project_statuses }))
}

#[instrument(
    name = "project_statuses.get_project_status",
    skip(state, ctx),
    fields(project_status_id = %project_status_id, user_id = %ctx.user.id)
)]
async fn get_project_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_status_id): Path<Uuid>,
) -> Result<Json<ProjectStatus>, ErrorResponse> {
    let status = ProjectStatusRepository::find_by_id(state.pool(), project_status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_status_id, "failed to load project status");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load project status",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, status.project_id).await?;

    Ok(Json(status))
}

#[instrument(
    name = "project_statuses.create_project_status",
    skip(state, ctx, payload),
    fields(project_id = %payload.project_id, user_id = %ctx.user.id)
)]
async fn create_project_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateProjectStatusRequest>,
) -> Result<Json<MutationResponse<ProjectStatus>>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, payload.project_id).await?;

    if !is_valid_hsl_color(&payload.color) {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Invalid color format. Expected HSL format: 'H S% L%'",
        ));
    }

    let response = ProjectStatusRepository::create(
        state.pool(),
        payload.id,
        payload.project_id,
        payload.name,
        payload.color,
        payload.sort_order,
        payload.hidden,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create project status");
        db_error(error, "failed to create project status")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "project_statuses.update_project_status",
    skip(state, ctx, payload),
    fields(project_status_id = %project_status_id, user_id = %ctx.user.id)
)]
async fn update_project_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_status_id): Path<Uuid>,
    Json(payload): Json<UpdateProjectStatusRequest>,
) -> Result<Json<MutationResponse<ProjectStatus>>, ErrorResponse> {
    let status = ProjectStatusRepository::find_by_id(state.pool(), project_status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_status_id, "failed to load project status");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load project status",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, status.project_id).await?;

    if let Some(ref color) = payload.color
        && !is_valid_hsl_color(color)
    {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Invalid color format. Expected HSL format: 'H S% L%'",
        ));
    }

    let response = ProjectStatusRepository::update(
        state.pool(),
        project_status_id,
        payload.name,
        payload.color,
        payload.sort_order,
        payload.hidden,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update project status");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "project_statuses.delete_project_status",
    skip(state, ctx),
    fields(project_status_id = %project_status_id, user_id = %ctx.user.id)
)]
async fn delete_project_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_status_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let status = ProjectStatusRepository::find_by_id(state.pool(), project_status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_status_id, "failed to load project status");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load project status",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, status.project_id).await?;

    let response = ProjectStatusRepository::delete(state.pool(), project_status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete project status");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}

#[derive(Debug, Deserialize)]
pub struct BulkUpdateProjectStatusItem {
    pub id: Uuid,
    #[serde(flatten)]
    pub changes: UpdateProjectStatusRequest,
}

#[derive(Debug, Deserialize)]
pub struct BulkUpdateProjectStatusesRequest {
    pub updates: Vec<BulkUpdateProjectStatusItem>,
}

#[derive(Debug, Serialize)]
pub struct BulkUpdateProjectStatusesResponse {
    pub data: Vec<ProjectStatus>,
    pub txid: i64,
}

#[instrument(
    name = "project_statuses.bulk_update",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, count = payload.updates.len())
)]
async fn bulk_update_project_statuses(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<BulkUpdateProjectStatusesRequest>,
) -> Result<Json<BulkUpdateProjectStatusesResponse>, ErrorResponse> {
    if payload.updates.is_empty() {
        return Ok(Json(BulkUpdateProjectStatusesResponse {
            data: vec![],
            txid: 0,
        }));
    }

    // Get first status to determine project_id for access check
    let first_status = ProjectStatusRepository::find_by_id(state.pool(), payload.updates[0].id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to find first project status");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to find status")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

    let project_id = first_status.project_id;
    ensure_project_access(state.pool(), ctx.user.id, project_id).await?;

    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let mut results = Vec::with_capacity(payload.updates.len());

    for item in payload.updates {
        // Verify status belongs to the same project
        let status = ProjectStatusRepository::find_by_id(state.pool(), item.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, status_id = %item.id, "failed to find project status");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to find status")
            })?
            .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

        if status.project_id != project_id {
            return Err(ErrorResponse::new(
                StatusCode::BAD_REQUEST,
                "all statuses must belong to the same project",
            ));
        }

        // Validate color if provided
        if let Some(ref color) = item.changes.color
            && !is_valid_hsl_color(color)
        {
            return Err(ErrorResponse::new(
                StatusCode::BAD_REQUEST,
                "Invalid color format. Expected HSL format: 'H S% L%'",
            ));
        }

        // Update the status within the transaction
        let updated = sqlx::query_as!(
            ProjectStatus,
            r#"
            UPDATE project_statuses
            SET
                name = COALESCE($1, name),
                color = COALESCE($2, color),
                sort_order = COALESCE($3, sort_order),
                hidden = COALESCE($4, hidden)
            WHERE id = $5
            RETURNING
                id              AS "id!: Uuid",
                project_id      AS "project_id!: Uuid",
                name            AS "name!",
                color           AS "color!",
                sort_order      AS "sort_order!",
                hidden          AS "hidden!",
                created_at      AS "created_at!: DateTime<Utc>"
            "#,
            item.changes.name,
            item.changes.color,
            item.changes.sort_order,
            item.changes.hidden,
            item.id
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| {
            tracing::error!(?error, status_id = %item.id, "failed to update project status");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to update project status",
            )
        })?;

        results.push(updated);
    }

    let txid = get_txid(&mut *tx).await.map_err(|error| {
        tracing::error!(?error, "failed to get txid");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;
    tx.commit().await.map_err(|error| {
        tracing::error!(?error, "failed to commit transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(BulkUpdateProjectStatusesResponse {
        data: results,
        txid,
    }))
}
