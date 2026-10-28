//! Local-only kanban data. Uses the same origin and relay protections as other local APIs.
use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{get, put},
};
use db::models::task::TaskStatus;
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Serialize, FromRow)]
struct LocalBoard {
    id: String,
    name: String,
}

#[derive(Serialize, FromRow)]
struct LocalTask {
    id: String,
    board_id: String,
    title: String,
    description: String,
    status: String,
}

#[derive(Deserialize)]
struct BoardInput {
    name: String,
}

#[derive(Deserialize)]
struct TaskInput {
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    status: TaskStatus,
}

fn checked_text(value: &str, max: usize, field: &str) -> Result<String, ApiError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max {
        return Err(ApiError::BadRequest(format!(
            "{field} must contain 1–{max} characters"
        )));
    }
    Ok(value.to_owned())
}

async fn board(pool: &SqlitePool, id: Uuid) -> Result<LocalBoard, ApiError> {
    Ok(
        sqlx::query_as("SELECT id, name FROM local_boards WHERE id = ?")
            .bind(id.to_string())
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| ApiError::NotFound("Local project not found".into()))?,
    )
}

async fn task(pool: &SqlitePool, board_id: Uuid, task_id: Uuid) -> Result<LocalTask, ApiError> {
    Ok(sqlx::query_as("SELECT id, board_id, title, description, status FROM local_board_tasks WHERE board_id = ? AND id = ?")
        .bind(board_id.to_string()).bind(task_id.to_string()).fetch_optional(pool).await?
        .ok_or_else(|| ApiError::NotFound("Local task not found".into()))?)
}

async fn list_boards(
    State(app): State<DeploymentImpl>,
) -> Result<Json<ApiResponse<Vec<LocalBoard>>>, ApiError> {
    let boards = sqlx::query_as("SELECT id, name FROM local_boards ORDER BY rowid")
        .fetch_all(&app.db().pool)
        .await?;
    Ok(Json(ApiResponse::success(boards)))
}

async fn create_board(
    State(app): State<DeploymentImpl>,
    Json(input): Json<BoardInput>,
) -> Result<Json<ApiResponse<LocalBoard>>, ApiError> {
    let name = checked_text(&input.name, 200, "Project name")?;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO local_boards (id, name) VALUES (?, ?)")
        .bind(id.to_string())
        .bind(name)
        .execute(&app.db().pool)
        .await?;
    Ok(Json(ApiResponse::success(board(&app.db().pool, id).await?)))
}

async fn update_board(
    State(app): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(input): Json<BoardInput>,
) -> Result<Json<ApiResponse<LocalBoard>>, ApiError> {
    let name = checked_text(&input.name, 200, "Project name")?;
    let result = sqlx::query("UPDATE local_boards SET name = ? WHERE id = ?")
        .bind(name)
        .bind(id.to_string())
        .execute(&app.db().pool)
        .await?;
    require_row(result.rows_affected())?;
    Ok(Json(ApiResponse::success(board(&app.db().pool, id).await?)))
}

fn require_row(rows: u64) -> Result<(), ApiError> {
    if rows == 0 {
        Err(ApiError::NotFound("Local project or task not found".into()))
    } else {
        Ok(())
    }
}

async fn delete_board(
    State(app): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let result = sqlx::query("DELETE FROM local_boards WHERE id = ?")
        .bind(id.to_string())
        .execute(&app.db().pool)
        .await?;
    require_row(result.rows_affected())?;
    Ok(Json(ApiResponse::success(())))
}

async fn list_tasks(
    State(app): State<DeploymentImpl>,
    Path(board_id): Path<Uuid>,
) -> Result<Json<ApiResponse<Vec<LocalTask>>>, ApiError> {
    board(&app.db().pool, board_id).await?;
    let tasks = sqlx::query_as("SELECT id, board_id, title, description, status FROM local_board_tasks WHERE board_id = ? ORDER BY created_at, rowid")
        .bind(board_id.to_string()).fetch_all(&app.db().pool).await?;
    Ok(Json(ApiResponse::success(tasks)))
}

fn checked_task(input: &TaskInput) -> Result<String, ApiError> {
    if input.description.chars().count() > 100_000 {
        return Err(ApiError::BadRequest(
            "Description is too long (maximum 100000 characters)".into(),
        ));
    }
    checked_text(&input.title, 500, "Task title")
}

async fn create_task(
    State(app): State<DeploymentImpl>,
    Path(board_id): Path<Uuid>,
    Json(input): Json<TaskInput>,
) -> Result<Json<ApiResponse<LocalTask>>, ApiError> {
    let title = checked_task(&input)?;
    board(&app.db().pool, board_id).await?;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO local_board_tasks (id, board_id, title, description, status) VALUES (?, ?, ?, ?, ?)")
        .bind(id.to_string()).bind(board_id.to_string()).bind(title)
        .bind(input.description).bind(input.status.to_string()).execute(&app.db().pool).await?;
    Ok(Json(ApiResponse::success(
        task(&app.db().pool, board_id, id).await?,
    )))
}

async fn update_task(
    State(app): State<DeploymentImpl>,
    Path((board_id, id)): Path<(Uuid, Uuid)>,
    Json(input): Json<TaskInput>,
) -> Result<Json<ApiResponse<LocalTask>>, ApiError> {
    let title = checked_task(&input)?;
    let result = sqlx::query("UPDATE local_board_tasks SET title = ?, description = ?, status = ? WHERE board_id = ? AND id = ?")
        .bind(title).bind(input.description).bind(input.status.to_string())
        .bind(board_id.to_string()).bind(id.to_string()).execute(&app.db().pool).await?;
    require_row(result.rows_affected())?;
    Ok(Json(ApiResponse::success(
        task(&app.db().pool, board_id, id).await?,
    )))
}

async fn delete_task(
    State(app): State<DeploymentImpl>,
    Path((board_id, id)): Path<(Uuid, Uuid)>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let result = sqlx::query("DELETE FROM local_board_tasks WHERE board_id = ? AND id = ?")
        .bind(board_id.to_string())
        .bind(id.to_string())
        .execute(&app.db().pool)
        .await?;
    require_row(result.rows_affected())?;
    Ok(Json(ApiResponse::success(())))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/local-boards", get(list_boards).post(create_board))
        .route(
            "/local-boards/{board_id}",
            put(update_board).delete(delete_board),
        )
        .route(
            "/local-boards/{board_id}/tasks",
            get(list_tasks).post(create_task),
        )
        .route(
            "/local-boards/{board_id}/tasks/{task_id}",
            put(update_task).delete(delete_task),
        )
}
