use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_project_access};
use crate::{
    AppState,
    auth::RequestContext,
    linear::crypto,
    slack::{client, db},
};

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/slack/connect", post(connect))
        .route("/slack/connections/{id}", delete(disconnect))
        .route("/slack/status", get(status))
}

// ── Request / response types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ConnectRequest {
    project_id: Uuid,
    bot_token: String,
    channel_id: String,
}

#[derive(Debug, Serialize)]
struct ConnectResponse {
    connection_id: Uuid,
    channel_id: String,
}

#[derive(Debug, Deserialize)]
struct StatusQuery {
    project_id: Uuid,
}

#[derive(Debug, Serialize)]
struct StatusResponse {
    connected: bool,
    connection_id: Option<Uuid>,
    channel_id: Option<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn connect(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(req): Json<ConnectRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let enc_key = state
        .config()
        .linear_encryption_key
        .as_ref()
        .ok_or_else(|| {
            ErrorResponse::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "Slack integration not configured",
            )
        })?;

    ensure_project_access(state.pool(), ctx.user.id, req.project_id).await?;

    // Validate token before storing
    client::auth_test(&state.http_client, &req.bot_token)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Slack auth_test failed");
            ErrorResponse::new(StatusCode::UNPROCESSABLE_ENTITY, "Invalid Slack bot token")
        })?;

    let encrypted_token =
        crypto::encrypt(enc_key.expose_secret(), &req.bot_token).map_err(|e| {
            tracing::error!(error = %e, "failed to encrypt Slack token");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "encryption failed")
        })?;

    let connection_id = db::upsert_connection(
        state.pool(),
        db::UpsertConnectionInput {
            project_id: req.project_id,
            channel_id: req.channel_id.clone(),
            encrypted_bot_token: encrypted_token,
        },
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "failed to upsert Slack connection");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
    })?;

    Ok((
        StatusCode::CREATED,
        Json(ConnectResponse {
            connection_id,
            channel_id: req.channel_id,
        }),
    ))
}

async fn disconnect(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let conn = db::get_connection_by_id(state.pool(), id)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, %id, "failed to fetch Slack connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "connection not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, conn.project_id).await?;

    db::delete_connection(state.pool(), id).await.map_err(|e| {
        tracing::error!(error = %e, %id, "failed to delete Slack connection");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
    })?;

    Ok(StatusCode::NO_CONTENT)
}

async fn status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<StatusQuery>,
) -> Result<Json<StatusResponse>, ErrorResponse> {
    state
        .config()
        .linear_encryption_key
        .as_ref()
        .ok_or_else(|| {
            ErrorResponse::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "Slack integration not configured",
            )
        })?;

    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let conn = db::get_connection_for_project(state.pool(), query.project_id)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "failed to fetch Slack status");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?;

    Ok(Json(match conn {
        Some(c) => StatusResponse {
            connected: true,
            connection_id: Some(c.id),
            channel_id: Some(c.channel_id),
        },
        None => StatusResponse {
            connected: false,
            connection_id: None,
            channel_id: None,
        },
    }))
}
