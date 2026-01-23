use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::error::ErrorResponse;
use crate::{
    AppState,
    auth::RequestContext,
    db::notifications::{Notification, NotificationRepository},
    entities::UpdateNotificationRequest,
};

#[derive(Debug, Serialize)]
pub struct ListNotificationsResponse {
    pub notifications: Vec<Notification>,
}

#[derive(Debug, Serialize)]
pub struct UnreadCountResponse {
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct MarkAllSeenResponse {
    pub updated: u64,
}

#[derive(Debug, Deserialize)]
pub struct ListNotificationsQuery {
    #[serde(default)]
    pub include_dismissed: bool,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notifications", get(list_notifications))
        .route("/notifications/unread-count", get(unread_count))
        .route("/notifications/mark-all-seen", post(mark_all_seen))
        .route(
            "/notifications/{notification_id}",
            get(get_notification)
                .patch(update_notification)
                .delete(delete_notification),
        )
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
) -> Result<Json<Notification>, ErrorResponse> {
    let existing = NotificationRepository::find_by_id(state.pool(), notification_id)
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

    let notification = NotificationRepository::update(state.pool(), notification_id, payload.seen)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update notification");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(notification))
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
) -> Result<StatusCode, ErrorResponse> {
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

    NotificationRepository::delete(state.pool(), notification_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete notification");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[instrument(
    name = "notifications.mark_all_seen",
    skip(state, ctx),
    fields(user_id = %ctx.user.id)
)]
async fn mark_all_seen(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<MarkAllSeenResponse>, ErrorResponse> {
    let updated = NotificationRepository::mark_all_seen(state.pool(), ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to mark all notifications as seen");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(MarkAllSeenResponse { updated }))
}

#[instrument(
    name = "notifications.unread_count",
    skip(state, ctx),
    fields(user_id = %ctx.user.id)
)]
async fn unread_count(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<UnreadCountResponse>, ErrorResponse> {
    let count = NotificationRepository::unread_count(state.pool(), ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get unread notification count");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(UnreadCountResponse { count }))
}
