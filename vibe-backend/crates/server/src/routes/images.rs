use std::path::Path as StdPath;

use axum::{
    Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{StatusCode, header},
    response::{Json as ResponseJson, Response},
    routing::{delete, get, post},
};
use chrono::{DateTime, Utc};
use db::models::{
    image::{Image, TaskImage},
    task::Task,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::image::ImageError;
use sqlx::Error as SqlxError;
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ImageResponse {
    pub id: Uuid,
    pub file_path: String, // relative path to display in markdown
    pub original_name: String,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub hash: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ImageResponse {
    pub fn from_image(image: Image) -> Self {
        // special relative path for images
        let markdown_path = format!("{}/{}", utils::path::VIBE_IMAGES_DIR, image.file_path);
        Self {
            id: image.id,
            file_path: markdown_path,
            original_name: image.original_name,
            mime_type: image.mime_type,
            size_bytes: image.size_bytes,
            hash: image.hash,
            created_at: image.created_at,
            updated_at: image.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ImageMetadataQuery {
    /// Path relative to worktree root, e.g., ".vibe-images/screenshot.png"
    pub path: String,
}

/// Metadata response for image files, used for rendering in WYSIWYG editor
#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImageMetadata {
    pub exists: bool,
    pub file_name: Option<String>,
    pub path: Option<String>,
    pub size_bytes: Option<i64>,
    pub format: Option<String>,
    pub proxy_url: Option<String>,
}

pub async fn upload_image(
    State(deployment): State<DeploymentImpl>,
    multipart: Multipart,
) -> Result<ResponseJson<ApiResponse<ImageResponse>>, ApiError> {
    let image_response = process_image_upload(&deployment, multipart, None).await?;
    Ok(ResponseJson(ApiResponse::success(image_response)))
}

pub(crate) async fn process_image_upload(
    deployment: &DeploymentImpl,
    mut multipart: Multipart,
    link_task_id: Option<Uuid>,
) -> Result<ImageResponse, ApiError> {
    let image_service = deployment.image();

    while let Some(field) = multipart.next_field().await? {
        if field.name() == Some("image") {
            let filename = field
                .file_name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "image.png".to_string());

            let data = field.bytes().await?;
            let image = image_service.store_image(&data, &filename).await?;

            if let Some(task_id) = link_task_id {
                TaskImage::associate_many_dedup(
                    &deployment.db().pool,
                    task_id,
                    std::slice::from_ref(&image.id),
                )
                .await?;
            }

            deployment
                .track_if_analytics_allowed(
                    "image_uploaded",
                    serde_json::json!({
                        "image_id": image.id.to_string(),
                        "size_bytes": image.size_bytes,
                        "mime_type": image.mime_type,
                        "task_id": link_task_id.map(|id| id.to_string()),
                    }),
                )
                .await;

            return Ok(ImageResponse::from_image(image));
        }
    }

    Err(ApiError::Image(ImageError::NotFound))
}

pub async fn upload_task_image(
    Path(task_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    multipart: Multipart,
) -> Result<ResponseJson<ApiResponse<ImageResponse>>, ApiError> {
    Task::find_by_id(&deployment.db().pool, task_id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    let image_response = process_image_upload(&deployment, multipart, Some(task_id)).await?;
    Ok(ResponseJson(ApiResponse::success(image_response)))
}

/// Serve an image file by ID
pub async fn serve_image(
    Path(image_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<Response, ApiError> {
    let image_service = deployment.image();
    let image = image_service
        .get_image(image_id)
        .await?
        .ok_or_else(|| ApiError::Image(ImageError::NotFound))?;
    let file_path = image_service.get_absolute_path(&image);

    let file = File::open(&file_path).await?;
    let metadata = file.metadata().await?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let content_type = image
        .mime_type
        .as_deref()
        .unwrap_or("application/octet-stream");

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, metadata.len())
        .header(header::CACHE_CONTROL, "public, max-age=31536000") // Cache for 1 year
        .body(body)
        .map_err(|e| ApiError::Image(ImageError::ResponseBuildError(e.to_string())))?;

    Ok(response)
}

pub async fn delete_image(
    Path(image_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let image_service = deployment.image();
    image_service.delete_image(image_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn get_task_images(
    Path(task_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ImageResponse>>>, ApiError> {
    let images = Image::find_by_task_id(&deployment.db().pool, task_id).await?;
    let image_responses = images.into_iter().map(ImageResponse::from_image).collect();
    Ok(ResponseJson(ApiResponse::success(image_responses)))
}

/// Get metadata for an image associated with a task.
/// The path should be in the format `.vibe-images/{uuid}.{ext}`.
pub async fn get_task_image_metadata(
    Path(task_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ImageMetadataQuery>,
) -> Result<ResponseJson<ApiResponse<ImageMetadata>>, ApiError> {
    let not_found_response = || ImageMetadata {
        exists: false,
        file_name: None,
        path: Some(query.path.clone()),
        size_bytes: None,
        format: None,
        proxy_url: None,
    };

    // Validate path starts with .vibe-images/
    let vibe_images_prefix = format!("{}/", utils::path::VIBE_IMAGES_DIR);
    if !query.path.starts_with(&vibe_images_prefix) {
        return Ok(ResponseJson(ApiResponse::success(not_found_response())));
    }

    // Reject paths with .. to prevent traversal
    if query.path.contains("..") {
        return Ok(ResponseJson(ApiResponse::success(not_found_response())));
    }

    // Extract the filename from the path (e.g., "uuid.png" from ".vibe-images/uuid.png")
    let file_name = match query.path.strip_prefix(&vibe_images_prefix) {
        Some(name) if !name.is_empty() => name,
        _ => return Ok(ResponseJson(ApiResponse::success(not_found_response()))),
    };

    // Look up the image by file_path (which is just the filename in the images table)
    let image = match Image::find_by_file_path(&deployment.db().pool, file_name).await? {
        Some(img) => img,
        None => return Ok(ResponseJson(ApiResponse::success(not_found_response()))),
    };

    // Verify the image is associated with this task
    let is_associated = TaskImage::is_associated(&deployment.db().pool, task_id, image.id).await?;
    if !is_associated {
        return Ok(ResponseJson(ApiResponse::success(not_found_response())));
    }

    // Get format from extension
    let format = StdPath::new(file_name)
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase());

    // Build the proxy URL
    let proxy_url = format!("/api/images/{}/file", image.id);

    Ok(ResponseJson(ApiResponse::success(ImageMetadata {
        exists: true,
        file_name: Some(image.original_name),
        path: Some(query.path),
        size_bytes: Some(image.size_bytes),
        format,
        proxy_url: Some(proxy_url),
    })))
}

pub fn routes() -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/upload",
            post(upload_image).layer(DefaultBodyLimit::max(20 * 1024 * 1024)), // 20MB limit
        )
        .route("/{id}/file", get(serve_image))
        .route("/{id}", delete(delete_image))
        .route("/task/{task_id}", get(get_task_images))
        .route("/task/{task_id}/metadata", get(get_task_image_metadata))
        .route(
            "/task/{task_id}/upload",
            post(upload_task_image).layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
}
