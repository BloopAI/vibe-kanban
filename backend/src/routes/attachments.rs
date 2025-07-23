use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use tokio::fs;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{attachment::Attachment, ApiResponse},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/upload/:task_id", post(upload_attachment))
        .route("/:attachment_id", get(download_attachment))
        .route("/:attachment_id", axum::routing::delete(delete_attachment))
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024)) // 10MB limit
}

async fn upload_attachment(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, StatusCode> {
    let uploads_dir = crate::utils::uploads_dir();
    fs::create_dir_all(&uploads_dir)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut attachments = Vec::new();

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let original_filename = field
            .file_name()
            .ok_or(StatusCode::BAD_REQUEST)?
            .to_string();

        let content_type = field
            .content_type()
            .ok_or(StatusCode::BAD_REQUEST)?
            .to_string();

        // Validate content type is an image
        if !content_type.starts_with("image/") {
            return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
        }

        let mut file_content = Vec::new();
        let mut size = 0;

        // Read file in chunks
        while let Some(chunk) = field
            .chunk()
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        {
            size += chunk.len();
            file_content.extend_from_slice(&chunk);
        }

        // Generate unique filename
        let file_extension = original_filename
            .split('.')
            .last()
            .unwrap_or("png")
            .to_string();
        let filename = format!("{}.{}", Uuid::new_v4(), file_extension);
        let file_path = uploads_dir.join(&filename);

        // Save file to disk
        fs::write(&file_path, &file_content)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Create attachment record
        let attachment = Attachment::create(
            &state.db_pool,
            task_id,
            filename,
            original_filename,
            content_type,
            size as i64,
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        attachments.push(attachment);
    }

    Ok(Json(ApiResponse::success(attachments)))
}

async fn download_attachment(
    State(state): State<AppState>,
    Path(attachment_id): Path<Uuid>,
) -> Result<Response, StatusCode> {
    let attachment = Attachment::find_by_id(&state.db_pool, attachment_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let file_path = crate::utils::uploads_dir().join(&attachment.filename);
    let file_content = fs::read(&file_path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let body = Body::from(file_content);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, &attachment.content_type)
        .header(
            header::CONTENT_DISPOSITION,
            format!(
                "inline; filename=\"{}\"",
                attachment.original_filename
            ),
        )
        .body(body)
        .unwrap())
}

async fn delete_attachment(
    State(state): State<AppState>,
    Path(attachment_id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let attachment = Attachment::find_by_id(&state.db_pool, attachment_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Delete file from disk
    let file_path = crate::utils::uploads_dir().join(&attachment.filename);
    let _ = fs::remove_file(&file_path).await;

    // Delete from database
    Attachment::delete(&state.db_pool, attachment_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ApiResponse::success(())))
}