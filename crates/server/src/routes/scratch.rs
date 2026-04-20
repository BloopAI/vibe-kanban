use axum::{
    Json, Router,
    extract::{Path, State, ws::Message},
    response::{IntoResponse, Json as ResponseJson},
    routing::get,
};
use chrono::Utc;
use db::models::scratch::{CreateScratch, Scratch, ScratchType, UpdateScratch};
use deployment::Deployment;
use futures_util::{StreamExt, TryStreamExt};
use serde::Deserialize;
use std::{
    collections::HashMap,
    sync::{Arc, OnceLock},
};
use tokio::sync::Mutex;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    error::ApiError,
    middleware::signed_ws::{MaybeSignedWebSocket, SignedWsUpgrade},
};

/// Path parameters for scratch routes with composite key
#[derive(Deserialize)]
pub struct ScratchPath {
    scratch_type: ScratchType,
    id: Uuid,
}

#[derive(Clone)]
struct PendingUiPreferencesWrite {
    payload: UpdateScratch,
}

static UI_PREFERENCES_WRITE_BUFFER: OnceLock<
    Arc<Mutex<HashMap<Uuid, PendingUiPreferencesWrite>>>,
> = OnceLock::new();

fn ui_preferences_write_buffer() -> &'static Arc<Mutex<HashMap<Uuid, PendingUiPreferencesWrite>>> {
    UI_PREFERENCES_WRITE_BUFFER.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

async fn enqueue_ui_preferences_flush(
    deployment: DeploymentImpl,
    id: Uuid,
    scratch_type: ScratchType,
) {
    tokio::time::sleep(std::time::Duration::from_millis(750)).await;

    let pending = {
        let mut pending = ui_preferences_write_buffer().lock().await;
        pending.remove(&id)
    };

    let Some(pending) = pending else {
        return;
    };

    match Scratch::update(&deployment.db().pool, id, &scratch_type, &pending.payload).await {
        Ok(scratch) => {
            deployment
                .events()
                .msg_store()
                .push_patch(services::services::events::scratch_patch::replace(&scratch));
        }
        Err(err) => {
            tracing::error!(
                scratch_id = %id,
                scratch_type = %scratch_type,
                ?err,
                "Failed to flush queued UI preferences scratch update"
            );
        }
    }
}

pub async fn list_scratch(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Scratch>>>, ApiError> {
    let scratch_items = Scratch::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(scratch_items)))
}

pub async fn get_scratch(
    State(deployment): State<DeploymentImpl>,
    Path(ScratchPath { scratch_type, id }): Path<ScratchPath>,
) -> Result<ResponseJson<ApiResponse<Scratch>>, ApiError> {
    let scratch = Scratch::find_by_id(&deployment.db().pool, id, &scratch_type)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Scratch not found".to_string()))?;
    Ok(ResponseJson(ApiResponse::success(scratch)))
}

pub async fn create_scratch(
    State(deployment): State<DeploymentImpl>,
    Path(ScratchPath { scratch_type, id }): Path<ScratchPath>,
    Json(payload): Json<CreateScratch>,
) -> Result<ResponseJson<ApiResponse<Scratch>>, ApiError> {
    // Reject edits to draft_follow_up if a message is queued for this workspace
    if matches!(scratch_type, ScratchType::DraftFollowUp)
        && deployment.queued_message_service().has_queued(id)
    {
        return Err(ApiError::BadRequest(
            "Cannot edit scratch while a message is queued".to_string(),
        ));
    }

    // Validate that payload type matches URL type
    payload
        .payload
        .validate_type(scratch_type)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let scratch = Scratch::create(&deployment.db().pool, id, &payload).await?;
    deployment
        .events()
        .msg_store()
        .push_patch(services::services::events::scratch_patch::add(&scratch));
    Ok(ResponseJson(ApiResponse::success(scratch)))
}

pub async fn update_scratch(
    State(deployment): State<DeploymentImpl>,
    Path(ScratchPath { scratch_type, id }): Path<ScratchPath>,
    Json(payload): Json<UpdateScratch>,
) -> Result<ResponseJson<ApiResponse<Scratch>>, ApiError> {
    // Reject edits to draft_follow_up if a message is queued for this workspace
    if matches!(scratch_type, ScratchType::DraftFollowUp)
        && deployment.queued_message_service().has_queued(id)
    {
        return Err(ApiError::BadRequest(
            "Cannot edit scratch while a message is queued".to_string(),
        ));
    }

    // Validate that payload type matches URL type
    payload
        .payload
        .validate_type(scratch_type)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    if matches!(scratch_type, ScratchType::UiPreferences) {
        let existing = Scratch::find_by_id(&deployment.db().pool, id, &scratch_type).await?;
        let now = Utc::now();
        let scratch = Scratch {
            id,
            payload: payload.payload.clone(),
            created_at: existing.as_ref().map(|s| s.created_at).unwrap_or(now),
            updated_at: now,
        };

        let should_spawn = {
            let mut pending = ui_preferences_write_buffer().lock().await;
            let should_spawn = !pending.contains_key(&id);
            pending.insert(
                id,
                PendingUiPreferencesWrite {
                    payload: payload.clone(),
                },
            );
            should_spawn
        };

        deployment
            .events()
            .msg_store()
            .push_patch(services::services::events::scratch_patch::replace(&scratch));

        if should_spawn {
            tokio::spawn(enqueue_ui_preferences_flush(
                deployment.clone(),
                id,
                scratch_type,
            ));
        }

        return Ok(ResponseJson(ApiResponse::success(scratch)));
    }

    // Upsert: creates if not exists, updates if exists
    let scratch = Scratch::update(&deployment.db().pool, id, &scratch_type, &payload).await?;
    deployment
        .events()
        .msg_store()
        .push_patch(services::services::events::scratch_patch::replace(&scratch));
    Ok(ResponseJson(ApiResponse::success(scratch)))
}

pub async fn delete_scratch(
    State(deployment): State<DeploymentImpl>,
    Path(ScratchPath { scratch_type, id }): Path<ScratchPath>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows = Scratch::delete(&deployment.db().pool, id, &scratch_type).await?;
    if rows == 0 {
        return Err(ApiError::BadRequest("Scratch not found".to_string()));
    }
    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn stream_scratch_ws(
    ws: SignedWsUpgrade,
    State(deployment): State<DeploymentImpl>,
    Path(ScratchPath { scratch_type, id }): Path<ScratchPath>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_scratch_ws(socket, deployment, id, scratch_type).await {
            tracing::warn!("scratch WS closed: {}", e);
        }
    })
}

async fn handle_scratch_ws(
    mut socket: MaybeSignedWebSocket,
    deployment: DeploymentImpl,
    id: Uuid,
    scratch_type: ScratchType,
) -> anyhow::Result<()> {
    let mut stream = deployment
        .events()
        .stream_scratch_raw(id, &scratch_type)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    loop {
        tokio::select! {
            item = stream.next() => {
                match item {
                    Some(Ok(msg)) => {
                        if socket.send(msg).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        tracing::error!("scratch stream error: {}", e);
                        break;
                    }
                    None => break,
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Ok(Some(Message::Close(_))) => break,
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
    }
    Ok(())
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/scratch", get(list_scratch))
        .route(
            "/scratch/{scratch_type}/{id}",
            get(get_scratch)
                .post(create_scratch)
                .put(update_scratch)
                .delete(delete_scratch),
        )
        .route(
            "/scratch/{scratch_type}/{id}/stream/ws",
            get(stream_scratch_ws),
        )
}
