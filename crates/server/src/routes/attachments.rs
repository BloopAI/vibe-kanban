use axum::{
    Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{StatusCode, header},
    response::{Json as ResponseJson, Response},
    routing::{delete, get, post},
};
use chrono::{DateTime, Utc};
use db::models::file::{File, WorkspaceAttachment};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::file::FileError;
use tokio::fs::File as TokioFile;
use tokio_util::io::ReaderStream;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub(crate) fn content_type_and_disposition_for_attachment(
    mime_type: &str,
) -> (&str, Option<&'static str>) {
    if is_safe_inline_attachment_mime_type(mime_type) {
        (mime_type, None)
    } else {
        ("application/octet-stream", Some("attachment"))
    }
}

fn is_safe_inline_attachment_mime_type(mime_type: &str) -> bool {
    matches!(
        mime_type,
        "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp"
            | "image/bmp"
            | "image/x-icon"
            | "image/tiff"
    )
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct AttachmentResponse {
    pub id: Uuid,
    pub file_path: String, // relative path to display in markdown
    pub original_name: String,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub hash: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl AttachmentResponse {
    pub fn from_file(file: File) -> Self {
        let markdown_path = format!("{}/{}", utils::path::VIBE_ATTACHMENTS_DIR, file.file_path);
        Self {
            id: file.id,
            file_path: markdown_path,
            original_name: file.original_name,
            mime_type: file.mime_type,
            size_bytes: file.size_bytes,
            hash: file.hash,
            created_at: file.created_at,
            updated_at: file.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct AttachmentMetadata {
    pub exists: bool,
    pub file_name: Option<String>,
    pub path: Option<String>,
    pub size_bytes: Option<i64>,
    pub format: Option<String>,
    pub proxy_url: Option<String>,
}

pub async fn upload_file(
    State(deployment): State<DeploymentImpl>,
    multipart: Multipart,
) -> Result<ResponseJson<ApiResponse<AttachmentResponse>>, ApiError> {
    let file_response = process_file_upload(&deployment, multipart, None).await?;
    Ok(ResponseJson(ApiResponse::success(file_response)))
}

pub(crate) async fn process_file_upload(
    deployment: &DeploymentImpl,
    mut multipart: Multipart,
    link_workspace_id: Option<Uuid>,
) -> Result<AttachmentResponse, ApiError> {
    let file_service = deployment.file();

    while let Some(field) = multipart.next_field().await? {
        if field.name() == Some("image") {
            let filename = field
                .file_name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "file.bin".to_string());

            let data = field.bytes().await?;
            let file = file_service.store_file(&data, &filename).await?;

            if let Some(workspace_id) = link_workspace_id {
                WorkspaceAttachment::associate_many_dedup(
                    &deployment.db().pool,
                    workspace_id,
                    std::slice::from_ref(&file.id),
                )
                .await?;
            }

            deployment
                .track_if_analytics_allowed(
                    "file_uploaded",
                    serde_json::json!({
                        "file_id": file.id.to_string(),
                        "size_bytes": file.size_bytes,
                        "mime_type": file.mime_type,
                        "workspace_id": link_workspace_id.map(|id| id.to_string()),
                    }),
                )
                .await;

            return Ok(AttachmentResponse::from_file(file));
        }
    }

    Err(ApiError::File(FileError::NotFound))
}

pub async fn serve_file(
    Path(file_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<Response, ApiError> {
    let file_service = deployment.file();
    let file_record = file_service
        .get_file(file_id)
        .await?
        .ok_or_else(|| ApiError::File(FileError::NotFound))?;
    let file_path = file_service.get_absolute_path(&file_record);

    let file = TokioFile::open(&file_path).await?;
    let metadata = file.metadata().await?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let content_type = file_record
        .mime_type
        .as_deref()
        .unwrap_or("application/octet-stream");
    let (content_type, content_disposition) =
        content_type_and_disposition_for_attachment(content_type);

    let mut response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, metadata.len())
        .header(header::CACHE_CONTROL, "public, max-age=31536000")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff");
    if let Some(content_disposition) = content_disposition {
        response = response.header(header::CONTENT_DISPOSITION, content_disposition);
    }
    let response = response
        .body(body)
        .map_err(|e| ApiError::File(FileError::ResponseBuildError(e.to_string())))?;

    Ok(response)
}

pub async fn delete_file(
    Path(file_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let file_service = deployment.file();
    file_service.delete_file(file_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub fn routes() -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/upload",
            post(upload_file).layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .route("/{id}/file", get(serve_file))
        .route("/{id}", delete(delete_file))
}

#[cfg(test)]
mod tests {
    use axum::http::header;

    use super::content_type_and_disposition_for_attachment;

    #[test]
    fn allows_safe_images_inline() {
        let (content_type, disposition) = content_type_and_disposition_for_attachment("image/png");
        assert_eq!(content_type, "image/png");
        assert_eq!(disposition, None);
    }

    #[test]
    fn forces_html_to_download() {
        let (content_type, disposition) = content_type_and_disposition_for_attachment("text/html");
        assert_eq!(content_type, "application/octet-stream");
        assert_eq!(disposition, Some("attachment"));
    }

    #[test]
    fn forces_svg_to_download() {
        let (content_type, disposition) =
            content_type_and_disposition_for_attachment("image/svg+xml");
        assert_eq!(content_type, "application/octet-stream");
        assert_eq!(disposition, Some("attachment"));
    }

    #[test]
    fn forces_pdf_to_download() {
        let (content_type, disposition) =
            content_type_and_disposition_for_attachment("application/pdf");
        assert_eq!(content_type, "application/octet-stream");
        assert_eq!(disposition, Some("attachment"));
    }

    #[test]
    fn forces_unknown_types_to_download() {
        let (content_type, disposition) =
            content_type_and_disposition_for_attachment("application/octet-stream");
        assert_eq!(content_type, "application/octet-stream");
        assert_eq!(disposition, Some("attachment"));
    }

    #[test]
    fn nosniff_header_name_matches_expected() {
        assert_eq!(
            header::X_CONTENT_TYPE_OPTIONS.as_str(),
            "x-content-type-options"
        );
    }
}
