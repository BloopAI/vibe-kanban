use api_types::{DeleteResponse, MutationResponse, Notification, UpdateNotificationRequest};
use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    routing::post,
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::error::ErrorResponse;
use crate::{
    AppState,
    auth::RequestContext,
    db::{get_txid, notifications::NotificationRepository},
    mutation_definition::{MutationBuilder, NoCreate},
};

#[derive(Debug, Serialize)]
pub struct ListNotificationsResponse {
    pub notifications: Vec<Notification>,
}

#[derive(Debug, Deserialize)]
pub struct ListNotificationsQuery {
    #[serde(default)]
    pub include_dismissed: bool,
}

#[derive(Debug, Deserialize)]
pub struct BulkUpdateNotificationItem {
    pub id: Uuid,
    #[serde(flatten)]
    pub changes: UpdateNotificationRequest,
}

#[derive(Debug, Deserialize)]
pub struct BulkUpdateNotificationsRequest {
    pub updates: Vec<BulkUpdateNotificationItem>,
}

#[derive(Debug, Serialize)]
pub struct BulkUpdateNotificationsResponse {
    pub data: Vec<Notification>,
    pub txid: i64,
}

pub fn mutation() -> MutationBuilder<Notification, NoCreate, UpdateNotificationRequest> {
    MutationBuilder::new("notifications")
        .list(list_notifications)
        .get(get_notification)
        .update(update_notification)
        .delete(delete_notification)
}

pub fn router() -> Router<AppState> {
    mutation()
        .router()
        .route("/notifications/bulk", post(bulk_update_notifications))
}

#[instrument(
    name = "notifications.list",
    skip(state, ctx),
    fields(user_id = %ctx.user.id)
)]
async fn list_notifications(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListNotificationsQuery>,
) -> Result<Json<ListNotificationsResponse>, ErrorResponse> {
    let notifications =
        NotificationRepository::list_by_user(state.pool(), ctx.user.id, query.include_dismissed)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to list notifications");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list notifications",
                )
            })?;

    Ok(Json(ListNotificationsResponse { notifications }))
}

#[instrument(
    name = "notifications.get",
    skip(state, ctx),
    fields(notification_id = %notification_id, user_id = %ctx.user.id)
)]
async fn get_notification(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(notification_id): Path<Uuid>,
) -> Result<Json<Notification>, ErrorResponse> {
    let notification = NotificationRepository::find_by_id(state.pool(), notification_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %notification_id, "failed to load notification");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load notification",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "notification not found"))?;

    if notification.user_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "notification not found",
        ));
    }

    Ok(Json(notification))
}

#[instrument(
    name = "notifications.update",
    skip(state, ctx, payload),
    fields(notification_id = %notification_id, user_id = %ctx.user.id)
)]
async fn update_notification(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(notification_id): Path<Uuid>,
    Json(payload): Json<UpdateNotificationRequest>,
) -> Result<Json<MutationResponse<Notification>>, ErrorResponse> {
    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let existing = NotificationRepository::find_by_id(&mut *tx, notification_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %notification_id, "failed to load notification");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load notification",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "notification not found"))?;

    if existing.user_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "notification not found",
        ));
    }

    let data = NotificationRepository::update(&mut *tx, notification_id, payload.seen)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update notification");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    let txid = get_txid(&mut *tx).await.map_err(|error| {
        tracing::error!(?error, "failed to get txid");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    tx.commit().await.map_err(|error| {
        tracing::error!(?error, "failed to commit transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(MutationResponse { data, txid }))
}

#[instrument(
    name = "notifications.delete",
    skip(state, ctx),
    fields(notification_id = %notification_id, user_id = %ctx.user.id)
)]
async fn delete_notification(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(notification_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let notification = NotificationRepository::find_by_id(&mut *tx, notification_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %notification_id, "failed to load notification");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load notification",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "notification not found"))?;

    if notification.user_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "notification not found",
        ));
    }

    NotificationRepository::delete(&mut *tx, notification_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete notification");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    let txid = get_txid(&mut *tx).await.map_err(|error| {
        tracing::error!(?error, "failed to get txid");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    tx.commit().await.map_err(|error| {
        tracing::error!(?error, "failed to commit transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(DeleteResponse { txid }))
}

#[instrument(
    name = "notifications.bulk_update",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, count = payload.updates.len())
)]
async fn bulk_update_notifications(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<BulkUpdateNotificationsRequest>,
) -> Result<Json<BulkUpdateNotificationsResponse>, ErrorResponse> {
    if payload.updates.is_empty() {
        return Ok(Json(BulkUpdateNotificationsResponse {
            data: vec![],
            txid: 0,
        }));
    }

    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let first_notification = NotificationRepository::find_by_id(&mut *tx, payload.updates[0].id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to find first notification");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to find notification",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "notification not found"))?;

    let user_id = first_notification.user_id;
    if user_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "notification not found",
        ));
    }

    let mut results = Vec::with_capacity(payload.updates.len());

    for item in payload.updates {
        let existing = NotificationRepository::find_by_id(&mut *tx, item.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, notification_id = %item.id, "failed to find notification");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to find notification",
                )
            })?
            .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "notification not found"))?;

        if existing.user_id != user_id {
            return Err(ErrorResponse::new(
                StatusCode::BAD_REQUEST,
                "all notifications must belong to the same user",
            ));
        }

        let updated = NotificationRepository::update(&mut *tx, item.id, item.changes.seen)
            .await
            .map_err(|error| {
                tracing::error!(?error, notification_id = %item.id, "failed to update notification");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
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

    Ok(Json(BulkUpdateNotificationsResponse {
        data: results,
        txid,
    }))
}
