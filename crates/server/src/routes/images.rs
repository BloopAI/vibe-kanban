use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{header, StatusCode},
    response::{Json as ResponseJson, Response},
    routing::{delete, get, post},
    Router,
};
use chrono::{DateTime, Utc};
use db::models::image::Image;
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::image::ImageError;
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{error::ApiError, DeploymentImpl};

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

pub async fn upload_image(
    State(deployment): State<DeploymentImpl>,
    mut multipart: Multipart,
) -> Result<ResponseJson<ApiResponse<ImageResponse>>, ApiError> {
    let image_service = deployment.image();
    while let Some(field) = multipart.next_field().await? {
        if field.name() == Some("image") {
            let filename = field
                .file_name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "image.png".to_string());

            let data = field.bytes().await?;
            let image = image_service.store_image(&data, &filename).await?;

            deployment
                .track_if_analytics_allowed(
                    "image_uploaded",
                    serde_json::json!({
                        "image_id": image.id.to_string(),
                        "size_bytes": image.size_bytes,
                        "mime_type": image.mime_type,
                    }),
                )
                .await;

            let image_response = ImageResponse::from_image(image);
            return Ok(ResponseJson(ApiResponse::success(image_response)));
        }
    }

    Err(ApiError::Image(ImageError::NotFound))
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

pub fn routes() -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/upload",
            post(upload_image).layer(DefaultBodyLimit::max(20 * 1024 * 1024)), // 20MB limit
        )
        .route("/{id}/file", get(serve_image))
        .route("/{id}", delete(delete_image))
        .route("/task/{task_id}", get(get_task_images))
}
