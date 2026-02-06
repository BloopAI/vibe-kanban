use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use db::models::meeting::{MeetingMessage, RefinementMeeting};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateMeetingRequest {
    pub project_id: Uuid,
    pub title: String,
}

#[derive(Debug, Deserialize)]
pub struct ListMeetingsQuery {
    pub project_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct AddMessageRequest {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub error: String,
}

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/meetings", post(create_meeting))
        .route("/meetings", get(list_meetings))
        .route("/meetings/{id}", get(get_meeting))
        .route("/meetings/{id}/messages", post(add_message))
        .route("/meetings/{id}/messages", get(list_messages))
}

async fn create_meeting(
    State(pool): State<SqlitePool>,
    Json(req): Json<CreateMeetingRequest>,
) -> Result<Json<RefinementMeeting>, (StatusCode, Json<ApiError>)> {
    RefinementMeeting::create(&pool, req.project_id, req.title)
        .await
        .map(Json)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError {
                    error: e.to_string(),
                }),
            )
        })
}

async fn list_meetings(
    State(pool): State<SqlitePool>,
    axum::extract::Query(query): axum::extract::Query<ListMeetingsQuery>,
) -> Result<Json<Vec<RefinementMeeting>>, (StatusCode, Json<ApiError>)> {
    RefinementMeeting::find_by_project(&pool, query.project_id)
        .await
        .map(Json)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError {
                    error: e.to_string(),
                }),
            )
        })
}

async fn get_meeting(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<Json<RefinementMeeting>, (StatusCode, Json<ApiError>)> {
    RefinementMeeting::find_by_id(&pool, id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError {
                    error: e.to_string(),
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ApiError {
                    error: "Meeting not found".to_string(),
                }),
            )
        })
        .map(Json)
}

async fn add_message(
    State(pool): State<SqlitePool>,
    Path(meeting_id): Path<Uuid>,
    Json(req): Json<AddMessageRequest>,
) -> Result<Json<MeetingMessage>, (StatusCode, Json<ApiError>)> {
    // Verify meeting exists
    RefinementMeeting::find_by_id(&pool, meeting_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError {
                    error: e.to_string(),
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ApiError {
                    error: "Meeting not found".to_string(),
                }),
            )
        })?;

    MeetingMessage::create(&pool, meeting_id, req.role, req.content)
        .await
        .map(Json)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError {
                    error: e.to_string(),
                }),
            )
        })
}

async fn list_messages(
    State(pool): State<SqlitePool>,
    Path(meeting_id): Path<Uuid>,
) -> Result<Json<Vec<MeetingMessage>>, (StatusCode, Json<ApiError>)> {
    MeetingMessage::find_by_meeting(&pool, meeting_id)
        .await
        .map(Json)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError {
                    error: e.to_string(),
                }),
            )
        })
}
