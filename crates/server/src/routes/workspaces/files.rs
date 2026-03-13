use std::path::Path;

use axum::{
    Extension, Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Query, Request, State},
    http::{StatusCode, header},
    middleware::{Next, from_fn_with_state},
    response::{Json as ResponseJson, Response},
    routing::{get, post},
};
use db::models::{file::File, session::Session, workspace::Workspace};
use deployment::Deployment;
use mime_guess::MimeGuess;
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService,
    file::{FileError, FileService},
    remote_client::RemoteClient,
};
use tokio::fs::File as TokioFile;
use tokio_util::io::ReaderStream;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    error::ApiError,
    middleware::load_workspace_middleware,
    routes::files::{FileMetadata, FileResponse, process_file_upload},
};

#[derive(Debug, Deserialize)]
pub struct FileMetadataQuery {
    /// Path relative to worktree root, e.g., ".vibe-images/screenshot.png"
    pub path: String,
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct SessionScopedQuery {
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct AssociateWorkspaceFilesRequest {
    pub file_ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct ImportIssueAttachmentsRequest {
    pub issue_id: Uuid,
}

#[derive(Debug, Serialize, TS)]
pub struct ImportIssueAttachmentsResponse {
    pub file_ids: Vec<Uuid>,
}

#[derive(Debug, Clone)]
pub(crate) struct ImportedIssueFile {
    pub attachment_id: Uuid,
    pub file: File,
}

pub async fn get_workspace_files(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<FileResponse>>>, ApiError> {
    let files = File::find_by_workspace_id(&deployment.db().pool, workspace.id).await?;
    let file_responses = files.into_iter().map(FileResponse::from_file).collect();
    Ok(ResponseJson(ApiResponse::success(file_responses)))
}

pub async fn upload_file(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<SessionScopedQuery>,
    multipart: Multipart,
) -> Result<ResponseJson<ApiResponse<FileResponse>>, ApiError> {
    let file_response = process_file_upload(&deployment, multipart, Some(workspace.id)).await?;

    let base_path = resolve_session_base_path(&deployment, &workspace, query.session_id).await?;
    deployment
        .file()
        .copy_files_by_ids_to_worktree(&base_path, &[file_response.id])
        .await?;

    Ok(ResponseJson(ApiResponse::success(file_response)))
}

pub async fn associate_workspace_files(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    axum::Json(payload): axum::Json<AssociateWorkspaceFilesRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let managed_workspace = deployment
        .workspace_manager()
        .load_managed_workspace(workspace)
        .await?;
    managed_workspace.associate_files(&payload.file_ids).await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn import_issue_attachments(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    axum::Json(payload): axum::Json<ImportIssueAttachmentsRequest>,
) -> Result<ResponseJson<ApiResponse<ImportIssueAttachmentsResponse>>, ApiError> {
    let client = deployment.remote_client()?;
    let imported_files =
        import_issue_attachment_files(&client, deployment.file(), payload.issue_id).await?;
    let file_ids = imported_files
        .iter()
        .map(|imported| imported.file.id)
        .collect::<Vec<_>>();

    let managed_workspace = deployment
        .workspace_manager()
        .load_managed_workspace(workspace)
        .await?;
    managed_workspace.associate_files(&file_ids).await?;

    Ok(ResponseJson(ApiResponse::success(
        ImportIssueAttachmentsResponse { file_ids },
    )))
}

pub async fn get_file_metadata(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<FileMetadataQuery>,
) -> Result<ResponseJson<ApiResponse<FileMetadata>>, ApiError> {
    let vibe_images_prefix = format!("{}/", utils::path::VIBE_IMAGES_DIR);
    if !query.path.starts_with(&vibe_images_prefix) {
        return Ok(ResponseJson(ApiResponse::success(FileMetadata {
            exists: false,
            file_name: None,
            path: Some(query.path),
            size_bytes: None,
            format: None,
            proxy_url: None,
        })));
    }

    if query.path.contains("..") {
        return Ok(ResponseJson(ApiResponse::success(FileMetadata {
            exists: false,
            file_name: None,
            path: Some(query.path),
            size_bytes: None,
            format: None,
            proxy_url: None,
        })));
    }

    let base_path = resolve_session_base_path(&deployment, &workspace, query.session_id).await?;
    let full_path = base_path.join(&query.path);

    let metadata = match tokio::fs::metadata(&full_path).await {
        Ok(m) if m.is_file() => m,
        _ => {
            return Ok(ResponseJson(ApiResponse::success(FileMetadata {
                exists: false,
                file_name: None,
                path: Some(query.path),
                size_bytes: None,
                format: None,
                proxy_url: None,
            })));
        }
    };

    let file_name = Path::new(&query.path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string());

    let format = Path::new(&query.path)
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase());

    let file_path = query.path.strip_prefix(&vibe_images_prefix).unwrap_or("");
    let proxy_url = format!(
        "/api/workspaces/{}/images/file/{}?session_id={}",
        workspace.id, file_path, query.session_id
    );

    Ok(ResponseJson(ApiResponse::success(FileMetadata {
        exists: true,
        file_name,
        path: Some(query.path),
        size_bytes: Some(metadata.len() as i64),
        format,
        proxy_url: Some(proxy_url),
    })))
}

pub async fn serve_file(
    axum::extract::Path((_id, path)): axum::extract::Path<(Uuid, String)>,
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<SessionScopedQuery>,
) -> Result<Response, ApiError> {
    if path.contains("..") {
        return Err(ApiError::File(FileError::NotFound));
    }
    let base_path = resolve_session_base_path(&deployment, &workspace, query.session_id).await?;
    let vibe_images_dir = base_path.join(utils::path::VIBE_IMAGES_DIR);
    let full_path = vibe_images_dir.join(&path);

    let canonical_path = tokio::fs::canonicalize(&full_path)
        .await
        .map_err(|_| ApiError::File(FileError::NotFound))?;

    let canonical_vibe_images = tokio::fs::canonicalize(&vibe_images_dir)
        .await
        .map_err(|_| ApiError::File(FileError::NotFound))?;

    if !canonical_path.starts_with(&canonical_vibe_images) {
        return Err(ApiError::File(FileError::NotFound));
    }

    let file = TokioFile::open(&canonical_path)
        .await
        .map_err(|_| ApiError::File(FileError::NotFound))?;

    let metadata = file
        .metadata()
        .await
        .map_err(|_| ApiError::File(FileError::NotFound))?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let content_type = MimeGuess::from_path(&path)
        .first_raw()
        .unwrap_or("application/octet-stream");

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, metadata.len())
        .header(header::CACHE_CONTROL, "public, max-age=31536000")
        .body(body)
        .map_err(|e| ApiError::File(FileError::ResponseBuildError(e.to_string())))?;

    Ok(response)
}

async fn resolve_session_base_path(
    deployment: &DeploymentImpl,
    workspace: &Workspace,
    session_id: Uuid,
) -> Result<std::path::PathBuf, ApiError> {
    let session = Session::find_by_id(&deployment.db().pool, session_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Session not found".to_string()))?;

    if session.workspace_id != workspace.id {
        return Err(ApiError::BadRequest(
            "Session does not belong to workspace".to_string(),
        ));
    }

    let container_ref = deployment
        .container()
        .ensure_container_exists(workspace)
        .await?;
    let workspace_path = std::path::PathBuf::from(container_ref);
    let base_path = match session.agent_working_dir.as_deref() {
        Some(dir) if !dir.is_empty() => workspace_path.join(dir),
        _ => workspace_path,
    };
    Ok(base_path)
}

/// Middleware to load Workspace for routes with wildcard path params.
async fn load_workspace_with_wildcard(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path((id, _path)): axum::extract::Path<(Uuid, String)>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let attempt = match Workspace::find_by_id(&deployment.db().pool, id).await {
        Ok(Some(a)) => a,
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };
    request.extensions_mut().insert(attempt);
    Ok(next.run(request).await)
}

pub(crate) async fn import_issue_attachment_files(
    client: &RemoteClient,
    file_service: &FileService,
    issue_id: Uuid,
) -> Result<Vec<ImportedIssueFile>, ApiError> {
    let response = client
        .list_issue_attachments(issue_id)
        .await
        .map_err(ApiError::from)?;

    let mut imported_files = Vec::new();

    for entry in response.attachments {
        let Some(file_url) = entry.file_url.as_deref() else {
            tracing::warn!(
                "No file_url for attachment {}, skipping",
                entry.attachment.id
            );
            continue;
        };

        let bytes = match client.download_from_url(file_url).await {
            Ok(bytes) => bytes,
            Err(error) => {
                tracing::warn!(
                    "Failed to download attachment {}: {}",
                    entry.attachment.id,
                    error
                );
                continue;
            }
        };

        let file = match file_service
            .store_file(&bytes, &entry.attachment.original_name)
            .await
        {
            Ok(file) => file,
            Err(error) => {
                tracing::warn!(
                    "Failed to store imported file '{}': {}",
                    entry.attachment.original_name,
                    error
                );
                continue;
            }
        };

        imported_files.push(ImportedIssueFile {
            attachment_id: entry.attachment.id,
            file,
        });
    }

    Ok(imported_files)
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let metadata_router = Router::new()
        .route("/", get(get_workspace_files))
        .route("/associate", post(associate_workspace_files))
        .route("/import-issue-attachments", post(import_issue_attachments))
        .route("/metadata", get(get_file_metadata))
        .route(
            "/upload",
            post(upload_file).layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .layer(from_fn_with_state(
            deployment.clone(),
            load_workspace_middleware,
        ));

    let file_router =
        Router::new()
            .route("/file/{*path}", get(serve_file))
            .layer(from_fn_with_state(
                deployment.clone(),
                load_workspace_with_wildcard,
            ));

    metadata_router.merge(file_router)
}
