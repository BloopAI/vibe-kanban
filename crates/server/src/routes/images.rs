use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{header, StatusCode},
    response::{Json as ResponseJson, Response},
    routing::{delete, get, post},
    Router,
};
use db::models::image::Image;
use deployment::Deployment;
use services::services::image::{ImageError, ImageService};
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{error::ApiError, DeploymentImpl};

pub async fn upload_image(
    State(deployment): State<DeploymentImpl>,
    mut multipart: Multipart,
) -> Result<ResponseJson<ApiResponse<Image>>, ApiError> {
    let image_service = ImageService::new(deployment.db().pool.clone())?;

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

            return Ok(ResponseJson(ApiResponse::success(image)));
        }
    }

    Err(ApiError::Image(ImageError::NotFound))
}

/// Serve an image file by ID
pub async fn serve_image(
    Path(image_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<Response, ApiError> {
    let image_service = ImageService::new(deployment.db().pool.clone())?;
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
    let image_service = ImageService::new(deployment.db().pool.clone())?;
    image_service.delete_image(image_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn get_task_images(
    Path(task_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Image>>>, ApiError> {
    let images = Image::find_by_task_id(&deployment.db().pool, task_id).await?;
    Ok(ResponseJson(ApiResponse::success(images)))
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
