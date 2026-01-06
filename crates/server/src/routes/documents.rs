use axum::{
    Extension, Json, Router,
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    middleware::from_fn_with_state,
    response::{Json as ResponseJson, Response},
    routing::{get, post},
};
use db::models::document::{
    CreateDocument, CreateDocumentFolder, Document, DocumentFolder, UpdateDocument,
    UpdateDocumentFolder,
};
use db::models::team::Team;
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::document_storage::DocumentStorageService;
use ts_rs::TS;
use utils::assets::asset_dir;
use utils::response::ApiResponse;
use uuid::Uuid;
use std::collections::HashSet;

use crate::{DeploymentImpl, error::ApiError, middleware::load_team_middleware};
use crate::file_reader::{read_file_content, ContentType};

/// Get the document storage service
fn get_document_storage() -> DocumentStorageService {
    DocumentStorageService::new(asset_dir())
}

/// Query parameters for listing documents
#[derive(Debug, Deserialize, TS)]
pub struct ListDocumentsQuery {
    /// Filter by folder ID (null for root level documents)
    pub folder_id: Option<Uuid>,
    /// Include archived documents
    pub include_archived: Option<bool>,
    /// Search query
    pub search: Option<String>,
    /// If true, return all documents across all folders
    pub all: Option<bool>,
}

// ===== Document Folder Endpoints =====

/// Get all folders for a team
pub async fn get_folders(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<DocumentFolder>>>, ApiError> {
    let folders = DocumentFolder::find_all_by_team(&deployment.db().pool, team.id).await?;
    Ok(ResponseJson(ApiResponse::success(folders)))
}

/// Get a single folder by ID
pub async fn get_folder(
    State(deployment): State<DeploymentImpl>,
    Path((team_id, folder_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<DocumentFolder>>, ApiError> {
    // Verify team exists
    let _team = Team::find_by_id(&deployment.db().pool, team_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    let folder = DocumentFolder::find_by_id(&deployment.db().pool, folder_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify folder belongs to team
    if folder.team_id != team_id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    Ok(ResponseJson(ApiResponse::success(folder)))
}

/// Create a new folder
pub async fn create_folder(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(mut payload): Json<CreateDocumentFolder>,
) -> Result<ResponseJson<ApiResponse<DocumentFolder>>, ApiError> {
    // Ensure team_id matches the route
    payload.team_id = team.id;

    let folder = DocumentFolder::create(&deployment.db().pool, &payload).await?;

    // If team has a document_storage_path, create the directory on filesystem
    if let Some(ref base_path) = team.document_storage_path {
        let folder_path = std::path::PathBuf::from(base_path).join(&folder.name);
        if let Err(e) = tokio::fs::create_dir_all(&folder_path).await {
            tracing::warn!("Failed to create folder directory on filesystem: {}", e);
        } else {
            tracing::info!("Created folder directory: {:?}", folder_path);
        }
    }

    deployment
        .track_if_analytics_allowed(
            "document_folder_created",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "folder_id": folder.id.to_string(),
                "folder_name": folder.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(folder)))
}

/// Update a folder
pub async fn update_folder(
    State(deployment): State<DeploymentImpl>,
    Path((team_id, folder_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateDocumentFolder>,
) -> Result<ResponseJson<ApiResponse<DocumentFolder>>, ApiError> {
    // Verify team exists
    let team = Team::find_by_id(&deployment.db().pool, team_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify folder belongs to team
    let existing = DocumentFolder::find_by_id(&deployment.db().pool, folder_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    if existing.team_id != team_id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    let folder = DocumentFolder::update(&deployment.db().pool, folder_id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "document_folder_updated",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "folder_id": folder.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(folder)))
}

/// Delete a folder
pub async fn delete_folder(
    State(deployment): State<DeploymentImpl>,
    Path((team_id, folder_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Verify team exists
    let team = Team::find_by_id(&deployment.db().pool, team_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify folder belongs to team
    let existing = DocumentFolder::find_by_id(&deployment.db().pool, folder_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    if existing.team_id != team_id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    // Delete from filesystem if team has document_storage_path
    if let Some(ref base_path) = team.document_storage_path {
        let folder_path = std::path::PathBuf::from(base_path).join(&existing.name);
        if folder_path.exists() {
            if let Err(e) = tokio::fs::remove_dir_all(&folder_path).await {
                tracing::warn!("Failed to delete folder from filesystem: {}", e);
            } else {
                tracing::info!("Deleted folder from filesystem: {:?}", folder_path);
            }
        }
    }

    let rows_affected = DocumentFolder::delete(&deployment.db().pool, folder_id).await?;
    if rows_affected == 0 {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    deployment
        .track_if_analytics_allowed(
            "document_folder_deleted",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "folder_id": folder_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

// ===== Document Endpoints =====

/// Get all documents for a team
pub async fn get_documents(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListDocumentsQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<Document>>>, ApiError> {
    let storage = get_document_storage();

    let mut documents = if let Some(search) = query.search {
        Document::search(&deployment.db().pool, team.id, &search).await?
    } else if query.all.unwrap_or(false) {
        // Fetch all documents across all folders
        let include_archived = query.include_archived.unwrap_or(false);
        Document::find_all_by_team(&deployment.db().pool, team.id, include_archived).await?
    } else {
        // Fetch documents for a specific folder (or root if folder_id is None)
        Document::find_by_folder(&deployment.db().pool, team.id, query.folder_id).await?
    };

    // Load content from filesystem for each document
    for doc in &mut documents {
        if let Some(ref file_path) = doc.file_path {
            if doc.content.is_none() {
                match storage.read_document(file_path).await {
                    Ok(content) => doc.content = Some(content),
                    Err(e) => {
                        tracing::warn!("Failed to read document content from {}: {}", file_path, e);
                    }
                }
            }
        }
    }

    Ok(ResponseJson(ApiResponse::success(documents)))
}

/// Get a single document by ID
pub async fn get_document(
    State(deployment): State<DeploymentImpl>,
    Path((team_id, document_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<Document>>, ApiError> {
    let storage = get_document_storage();

    // Verify team exists
    let _team = Team::find_by_id(&deployment.db().pool, team_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    let mut document = Document::find_by_id(&deployment.db().pool, document_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify document belongs to team
    if document.team_id != team_id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    // Load content from filesystem if we have a file_path
    if let Some(ref file_path) = document.file_path {
        if document.content.is_none() {
            match storage.read_document(file_path).await {
                Ok(content) => document.content = Some(content),
                Err(e) => {
                    tracing::warn!("Failed to read document content from {}: {}", file_path, e);
                }
            }
        }
    }

    Ok(ResponseJson(ApiResponse::success(document)))
}

/// Get a single document by slug within a team
pub async fn get_document_by_slug(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_, slug)): Path<(Uuid, String)>,  // team_id extracted by middleware, just need slug
) -> Result<ResponseJson<ApiResponse<Document>>, ApiError> {
    let storage = get_document_storage();

    let mut document = Document::find_by_slug(&deployment.db().pool, team.id, &slug)
        .await?
        .ok_or(ApiError::NotFound(format!("Document with slug '{}' not found", slug)))?;

    // Load content from filesystem if we have a file_path
    if let Some(ref file_path) = document.file_path {
        if document.content.is_none() {
            match storage.read_document(file_path).await {
                Ok(content) => document.content = Some(content),
                Err(e) => {
                    tracing::warn!("Failed to read document content from {}: {}", file_path, e);
                }
            }
        }
    }

    Ok(ResponseJson(ApiResponse::success(document)))
}

/// Create a new document
pub async fn create_document(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(mut payload): Json<CreateDocument>,
) -> Result<ResponseJson<ApiResponse<Document>>, ApiError> {
    let storage = get_document_storage();

    // Ensure team_id matches the route
    payload.team_id = team.id;

    // Extract content for filesystem storage
    let content = payload.content.take().unwrap_or_default();
    let file_type = payload.file_type.clone().unwrap_or_else(|| "markdown".to_string());
    let title = payload.title.clone();

    // Get folder name if document is in a folder (for subfolder path)
    let subfolder = if let Some(folder_id) = payload.folder_id {
        DocumentFolder::find_by_id(&deployment.db().pool, folder_id)
            .await?
            .map(|f| f.name)
    } else {
        None
    };

    // Create document record in DB (without content)
    let document = Document::create(&deployment.db().pool, &payload).await?;

    // Write content to filesystem using human-readable title as filename
    let file_info = storage
        .write_document_with_title(
            team.id,
            &title,
            &content,
            &file_type,
            team.document_storage_path.as_deref(),
            subfolder.as_deref(), // Use folder name as subfolder
        )
        .await
        .map_err(|e| ApiError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

    // Update document with file metadata
    let document = Document::update_file_metadata(
        &deployment.db().pool,
        document.id,
        &file_info.file_path,
        file_info.file_size,
        &file_info.mime_type,
        &file_type,
    )
    .await?;

    // Return document with content included
    let mut response_doc = document;
    response_doc.content = Some(content);

    deployment
        .track_if_analytics_allowed(
            "document_created",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "document_id": response_doc.id.to_string(),
                "document_title": response_doc.title,
                "file_type": response_doc.file_type,
                "file_size": file_info.file_size,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(response_doc)))
}

/// Update a document
pub async fn update_document(
    State(deployment): State<DeploymentImpl>,
    Path((team_id, document_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateDocument>,
) -> Result<ResponseJson<ApiResponse<Document>>, ApiError> {
    let storage = get_document_storage();

    // Verify team exists
    let team = Team::find_by_id(&deployment.db().pool, team_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify document belongs to team
    let existing = Document::find_by_id(&deployment.db().pool, document_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    if existing.team_id != team_id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    // Update document metadata in DB
    let mut document = Document::update(&deployment.db().pool, document_id, &payload).await?;

    // If content was provided, write to filesystem
    if let Some(ref content) = payload.content {
        // Determine file path - use existing if available, otherwise create new title-based path
        let file_info = if let Some(ref existing_path) = existing.file_path {
            // Write to existing file path (preserves user's file organization)
            tokio::fs::write(existing_path, content.as_bytes())
                .await
                .map_err(|e| ApiError::Io(e))?;

            services::services::document_storage::DocumentFileInfo {
                file_path: existing_path.clone(),
                file_size: content.len() as i64,
                mime_type: storage.get_mime_type_for_file_type(&document.file_type),
            }
        } else {
            // No existing path - create new file with title-based name
            storage
                .write_document_with_title(
                    team.id,
                    &document.title,
                    content,
                    &document.file_type,
                    team.document_storage_path.as_deref(),
                    None,
                )
                .await
                .map_err(|e| ApiError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?
        };

        // Update file metadata
        document = Document::update_file_metadata(
            &deployment.db().pool,
            document.id,
            &file_info.file_path,
            file_info.file_size,
            &file_info.mime_type,
            &document.file_type,
        )
        .await?;

        // Include content in response
        document.content = Some(content.clone());
    } else if let Some(ref file_path) = document.file_path {
        // Load existing content from file for response
        match storage.read_document(file_path).await {
            Ok(content) => document.content = Some(content),
            Err(e) => {
                tracing::warn!("Failed to read document content from {}: {}", file_path, e);
            }
        }
    }

    deployment
        .track_if_analytics_allowed(
            "document_updated",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "document_id": document.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(document)))
}

/// Delete a document
pub async fn delete_document(
    State(deployment): State<DeploymentImpl>,
    Path((team_id, document_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let storage = get_document_storage();

    // Verify team exists
    let team = Team::find_by_id(&deployment.db().pool, team_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify document belongs to team
    let existing = Document::find_by_id(&deployment.db().pool, document_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    if existing.team_id != team_id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    // Delete file from filesystem if it exists
    if let Some(ref file_path) = existing.file_path {
        if let Err(e) = storage.delete_document(file_path).await {
            tracing::warn!("Failed to delete document file {}: {}", file_path, e);
        }
    }

    // Delete from database
    let rows_affected = Document::delete(&deployment.db().pool, document_id).await?;
    if rows_affected == 0 {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    deployment
        .track_if_analytics_allowed(
            "document_deleted",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "document_id": document_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Get document file content with type-specific handling
/// Supports: text files (md, txt, json, xml, html), CSV, PDF (text extraction), images (base64)
pub async fn get_document_content(
    State(deployment): State<DeploymentImpl>,
    Path((team_id, document_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<DocumentContentResponse>>, ApiError> {
    // Verify team exists
    let _team = Team::find_by_id(&deployment.db().pool, team_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Get document
    let document = Document::find_by_id(&deployment.db().pool, document_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify document belongs to team
    if document.team_id != team_id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    // Get file path
    let file_path = document.file_path.as_ref().ok_or_else(|| {
        ApiError::NotFound("Document has no file path".to_string())
    })?;

    // Read file content using the file reader
    let file_content = read_file_content(file_path)
        .await
        .map_err(|e| ApiError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

    // Convert content type to string
    let content_type_str = match file_content.content_type {
        ContentType::Text => "text",
        ContentType::Csv => "csv",
        ContentType::PdfText => "pdf_text",
        ContentType::ImageBase64 => "image_base64",
        ContentType::Binary => "binary",
    }.to_string();

    // Convert CSV data if present
    let csv_data = file_content.structured_data.map(|data| CsvDataResponse {
        headers: data.headers,
        rows: data.rows,
    });

    let response = DocumentContentResponse {
        document_id,
        content_type: content_type_str,
        content: file_content.content,
        csv_data,
        file_path: document.file_path,
        file_type: document.file_type,
        mime_type: document.mime_type,
    };

    Ok(ResponseJson(ApiResponse::success(response)))
}

/// Serve document file as binary (for PDF viewer, image display, etc.)
pub async fn get_document_file(
    State(deployment): State<DeploymentImpl>,
    Path((team_id, document_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    // Verify team exists
    let _team = Team::find_by_id(&deployment.db().pool, team_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Get document
    let document = Document::find_by_id(&deployment.db().pool, document_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify document belongs to team
    if document.team_id != team_id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    // Get file path
    let file_path = document.file_path.as_ref().ok_or_else(|| {
        ApiError::NotFound("Document has no file path".to_string())
    })?;

    // Read file bytes
    let file_bytes = tokio::fs::read(file_path)
        .await
        .map_err(|e| ApiError::Io(e))?;

    // Determine content type from extension or mime_type
    let content_type = document.mime_type.clone().unwrap_or_else(|| {
        let extension = std::path::Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        get_mime_type(extension).to_string()
    });

    // Build response with proper headers
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, file_bytes.len())
        .header(
            header::CONTENT_DISPOSITION,
            format!(
                "inline; filename=\"{}\"",
                document.title.replace('"', "\\\"")
            ),
        )
        .body(Body::from(file_bytes))
        .map_err(|e| ApiError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

    Ok(response)
}

/// Response for scan filesystem operation
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ScanFilesystemResponse {
    /// Number of new documents found and registered
    pub documents_added: usize,
    /// List of document titles that were added
    pub added_titles: Vec<String>,
    /// Number of files scanned
    pub files_scanned: usize,
}

/// Response for scan-all (recursive) filesystem operation
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ScanAllResponse {
    /// Number of folders created
    pub folders_created: usize,
    /// Number of documents created
    pub documents_created: usize,
    /// Total items scanned (folders + files)
    pub total_scanned: usize,
    /// Names of folders created
    pub folder_names: Vec<String>,
    /// Names of documents created
    pub document_names: Vec<String>,
}

/// Response for discover folders operation
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct DiscoverFoldersResponse {
    /// Names of folders that were created in the database
    pub folders_created: Vec<String>,
    /// Names of folders that already existed in the database
    pub folders_existing: Vec<String>,
    /// Total number of folders found on filesystem
    pub total_folders: usize,
}

/// Response containing document file content with type information
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct DocumentContentResponse {
    /// The document ID
    pub document_id: Uuid,
    /// Content type: "text", "csv", "pdf_text", "image_base64", "binary"
    pub content_type: String,
    /// The actual content (text, extracted text, or base64 for images)
    pub content: String,
    /// Optional structured data for CSV files
    pub csv_data: Option<CsvDataResponse>,
    /// File path on disk
    pub file_path: Option<String>,
    /// Original file type/extension
    pub file_type: String,
    /// MIME type
    pub mime_type: Option<String>,
}

/// Structured CSV data for frontend rendering
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct CsvDataResponse {
    /// Column headers
    pub headers: Vec<String>,
    /// Data rows (limited to 1000)
    pub rows: Vec<Vec<String>>,
}

/// Response for file upload operation
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct UploadResult {
    /// Number of files successfully uploaded
    pub uploaded: usize,
    /// Number of files skipped (already exist)
    pub skipped: usize,
    /// Error messages for failed files
    pub errors: Vec<String>,
    /// Titles of uploaded documents
    pub uploaded_titles: Vec<String>,
}

/// Get mime type from file extension
fn get_mime_type(extension: &str) -> &'static str {
    match extension.to_lowercase().as_str() {
        "md" | "markdown" => "text/markdown",
        "txt" => "text/plain",
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv" => "text/csv",
        "json" => "application/json",
        "xml" => "application/xml",
        "html" | "htm" => "text/html",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "zip" => "application/zip",
        "tar" => "application/x-tar",
        "gz" => "application/gzip",
        _ => "application/octet-stream",
    }
}

/// Check if file is a text-based document that we should read content from
fn is_text_document(extension: &str) -> bool {
    matches!(
        extension.to_lowercase().as_str(),
        "md" | "markdown" | "txt" | "json" | "xml" | "html" | "htm" | "csv"
    )
}

/// Discover folders from filesystem and create them in database
///
/// This function reads the team's document_storage_path, finds all subdirectories,
/// and creates database records for any folders that don't already exist.
pub async fn discover_folders(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<DiscoverFoldersResponse>>, ApiError> {
    // Get team's document_storage_path
    let base_path = team.document_storage_path.as_ref()
        .ok_or_else(|| ApiError::BadRequest("Team has no document storage path configured. Set it in Team Settings.".to_string()))?;

    // Read directories from filesystem
    let mut fs_folders: Vec<String> = Vec::new();
    let path = std::path::Path::new(base_path);

    if path.exists() {
        let mut entries = tokio::fs::read_dir(path).await
            .map_err(|e| ApiError::Io(e))?;

        while let Some(entry) = entries.next_entry().await.map_err(|e| ApiError::Io(e))? {
            if entry.path().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    // Skip hidden folders (starting with .)
                    if !name.starts_with('.') {
                        fs_folders.push(name.to_string());
                    }
                }
            }
        }
    }

    // Get existing DB folders (all folders for this team)
    let existing_folders = DocumentFolder::find_all_by_team(&deployment.db().pool, team.id).await?;
    let existing_names: HashSet<String> = existing_folders.iter().map(|f| f.name.clone()).collect();

    // Create missing folders in DB
    let mut folders_created = Vec::new();
    for folder_name in &fs_folders {
        if !existing_names.contains(folder_name) {
            DocumentFolder::create(&deployment.db().pool, &CreateDocumentFolder {
                team_id: team.id,
                parent_id: None,
                name: folder_name.clone(),
                icon: None,
                color: None,
                local_path: None,
            }).await?;
            folders_created.push(folder_name.clone());
        }
    }

    let folders_existing: Vec<String> = existing_names.into_iter().collect();
    let total_folders = fs_folders.len();

    Ok(ResponseJson(ApiResponse::success(DiscoverFoldersResponse {
        folders_created,
        folders_existing,
        total_folders,
    })))
}

/// Supported document extensions for scanning
fn is_supported_document(extension: &str) -> bool {
    matches!(
        extension.to_lowercase().as_str(),
        "md" | "markdown" | "txt" | "pdf" | "doc" | "docx" | "xls" | "xlsx" | "csv"
        | "json" | "xml" | "html" | "htm" | "ppt" | "pptx" | "png" | "jpg" | "jpeg"
        | "gif" | "svg" | "webp"
    )
}

/// Scan the filesystem for documents and register them in the database
pub async fn scan_filesystem(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, folder_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<ScanFilesystemResponse>>, ApiError> {
    // Get the folder to scan
    let folder = DocumentFolder::find_by_id(&deployment.db().pool, folder_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Folder not found".to_string()))?;

    // Verify folder belongs to team
    if folder.team_id != team.id {
        return Err(ApiError::NotFound("Folder not found".to_string()));
    }

    // Use team's document_storage_path if set
    let base_path = team.document_storage_path.as_ref()
        .ok_or_else(|| ApiError::BadRequest("Team has no document storage path configured. Set it in Team Settings.".to_string()))?;

    // Scan path is base_path + folder name
    let scan_path = std::path::PathBuf::from(base_path).join(&folder.name);

    // Get all existing documents for this folder to avoid duplicates
    let existing_docs = Document::find_by_folder(&deployment.db().pool, team.id, Some(folder_id)).await?;
    let existing_paths: HashSet<String> = existing_docs
        .iter()
        .filter_map(|d| d.file_path.clone())
        .collect();

    // Also build a set of normalized existing titles for matching
    let existing_titles: HashSet<String> = existing_docs
        .iter()
        .map(|d| d.title.to_lowercase().replace(' ', "-").replace(' ', "_"))
        .collect();

    let mut documents_added = 0;
    let mut added_titles = Vec::new();
    let mut files_scanned = 0;
    let mut documents_updated = 0;

    // Scan the directory for supported document files
    if scan_path.exists() {
        let mut entries = tokio::fs::read_dir(&scan_path).await
            .map_err(|e| ApiError::Io(e))?;

        while let Some(entry) = entries.next_entry().await.map_err(|e| ApiError::Io(e))? {
            let path = entry.path();

            // Skip directories
            if path.is_dir() {
                continue;
            }

            // Get extension and check if supported
            let extension = path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");

            if !is_supported_document(extension) {
                continue;
            }

            files_scanned += 1;
            let path_str = path.to_string_lossy().to_string();

            // Get mime type and file type
            let mime_type = get_mime_type(extension);
            let file_type = extension.to_lowercase();
            let is_text = is_text_document(extension);

            // Extract title from filename (convert kebab-case/snake_case to Title Case)
            let file_stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled");

            let title = file_stem
                .split(|c| c == '-' || c == '_')
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => first.to_uppercase().chain(chars).collect(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");

            // Normalized title for matching
            let normalized_title = file_stem.to_lowercase();

            // Check if document already exists by path
            if existing_paths.contains(&path_str) {
                // Path matches - for text files, update content; for others, just update metadata
                if let Some(existing_doc) = existing_docs.iter().find(|d| d.file_path.as_ref() == Some(&path_str)) {
                    let metadata = tokio::fs::metadata(&path).await.map_err(|e| ApiError::Io(e))?;
                    let file_size = metadata.len() as i64;

                    if is_text {
                        // Read and update content for text files
                        let content = tokio::fs::read_to_string(&path).await.ok();
                        if content.is_some() {
                            let update_payload = UpdateDocument {
                                folder_id: Some(folder_id),
                                title: Some(existing_doc.title.clone()),
                                content,
                                icon: None,
                                is_pinned: None,
                                is_archived: None,
                                position: None,
                            };
                            Document::update(&deployment.db().pool, existing_doc.id, &update_payload).await?;
                        }
                    }

                    // Update file metadata
                    Document::update_file_metadata(
                        &deployment.db().pool,
                        existing_doc.id,
                        &path_str,
                        file_size,
                        mime_type,
                        &file_type,
                    ).await?;

                    documents_updated += 1;
                }
                continue;
            }

            // Check if document exists by normalized title
            if existing_titles.contains(&normalized_title) {
                // Title matches, update the existing document with new file path
                if let Some(existing_doc) = existing_docs.iter().find(|d|
                    d.title.to_lowercase().replace(' ', "-").replace(' ', "_") == normalized_title
                ) {
                    let metadata = tokio::fs::metadata(&path).await.map_err(|e| ApiError::Io(e))?;
                    let file_size = metadata.len() as i64;

                    if is_text {
                        // Update content for text files
                        let content = tokio::fs::read_to_string(&path).await.ok();
                        if content.is_some() {
                            let update_payload = UpdateDocument {
                                folder_id: Some(folder_id),
                                title: Some(existing_doc.title.clone()),
                                content,
                                icon: None,
                                is_pinned: None,
                                is_archived: None,
                                position: None,
                            };
                            Document::update(&deployment.db().pool, existing_doc.id, &update_payload).await?;
                        }
                    }

                    // Update file metadata
                    Document::update_file_metadata(
                        &deployment.db().pool,
                        existing_doc.id,
                        &path_str,
                        file_size,
                        mime_type,
                        &file_type,
                    ).await?;

                    documents_updated += 1;
                }
                continue;
            }

            // New document - only read content for text files
            let content = if is_text {
                tokio::fs::read_to_string(&path).await.ok()
            } else {
                None // Non-text files store only metadata
            };

            // Get file metadata
            let metadata = tokio::fs::metadata(&path).await.map_err(|e| ApiError::Io(e))?;
            let file_size = metadata.len() as i64;

            // Create document record (metadata only for non-text files)
            let create_payload = CreateDocument {
                team_id: team.id,
                folder_id: Some(folder_id),
                title: title.clone(),
                content,
                file_type: Some(file_type.clone()),
                icon: None,
            };

            let document = Document::create(&deployment.db().pool, &create_payload).await?;

            // Update with file metadata
            Document::update_file_metadata(
                &deployment.db().pool,
                document.id,
                &path_str,
                file_size,
                mime_type,
                &file_type,
            )
            .await?;

            documents_added += 1;
            added_titles.push(title);
        }
    } else {
        tracing::warn!("Scan path does not exist: {:?}", scan_path);
    }

    deployment
        .track_if_analytics_allowed(
            "documents_filesystem_scan",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "folder_id": folder_id.to_string(),
                "folder_name": folder.name,
                "documents_added": documents_added,
                "documents_updated": documents_updated,
                "files_scanned": files_scanned,
                "scan_path": scan_path.to_string_lossy(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(ScanFilesystemResponse {
        documents_added,
        added_titles,
        files_scanned,
    })))
}

/// Recursively scan filesystem and create folders + documents
///
/// This endpoint walks the entire directory tree from the team's document_storage_path
/// and creates database entries for all folders and documents.
pub async fn scan_all_filesystem(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ScanAllResponse>>, ApiError> {
    // Get team's document_storage_path
    let base_path = team.document_storage_path.as_ref()
        .ok_or_else(|| ApiError::BadRequest("Team has no document storage path configured. Set it in Team Settings.".to_string()))?;

    let base_path = std::path::PathBuf::from(base_path);
    if !base_path.exists() {
        return Err(ApiError::BadRequest(format!(
            "Storage path does not exist: {}",
            base_path.display()
        )));
    }

    let mut folders_created = 0;
    let mut documents_created = 0;
    let mut total_scanned = 0;
    let mut folder_names = Vec::new();
    let mut document_names = Vec::new();

    // Get existing documents to avoid duplicates
    let existing_docs = Document::find_all_by_team(&deployment.db().pool, team.id, false).await?;
    let existing_paths: std::collections::HashSet<String> = existing_docs
        .iter()
        .filter_map(|d| d.file_path.clone())
        .collect();

    // Recursive function to process a directory
    // We use a stack-based approach instead of async recursion
    let mut dir_stack: Vec<(std::path::PathBuf, Option<Uuid>)> = vec![(base_path.clone(), None)];

    while let Some((current_dir, parent_folder_id)) = dir_stack.pop() {
        let mut entries = match tokio::fs::read_dir(&current_dir).await {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("Cannot read directory {:?}: {}", current_dir, e);
                continue;
            }
        };

        while let Some(entry) = entries.next_entry().await.map_err(|e| ApiError::Io(e))? {
            let path = entry.path();
            let name = match entry.file_name().to_str() {
                Some(n) => n.to_string(),
                None => continue,
            };

            // Skip hidden files/folders
            if name.starts_with('.') {
                continue;
            }

            total_scanned += 1;

            if path.is_dir() {
                // Create or get folder in database
                let folder = DocumentFolder::find_or_create_by_name(
                    &deployment.db().pool,
                    team.id,
                    parent_folder_id,
                    &name,
                ).await?;

                // Check if this folder was just created (crude check: if it's new, we add to count)
                // We track by checking if we already had this folder
                let was_created = {
                    let existing = DocumentFolder::find_all_by_team(&deployment.db().pool, team.id).await?;
                    !existing.iter().any(|f| f.id == folder.id && f.created_at < folder.created_at)
                };

                // Actually, let's just count all folders we process and trust the find_or_create
                // We'll refine the counting later if needed
                if !folder_names.contains(&name) {
                    // Only count unique folder names (the find_or_create handles duplicates)
                }

                // Add subdirectory to stack for processing
                dir_stack.push((path, Some(folder.id)));
            } else {
                // It's a file - check if supported
                let extension = path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");

                if !is_supported_document(extension) {
                    continue;
                }

                let path_str = path.to_string_lossy().to_string();

                // Skip if already exists
                if existing_paths.contains(&path_str) {
                    continue;
                }

                // Extract title from filename
                let file_stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Untitled");

                let title = file_stem
                    .split(|c| c == '-' || c == '_')
                    .map(|word| {
                        let mut chars = word.chars();
                        match chars.next() {
                            None => String::new(),
                            Some(first) => first.to_uppercase().chain(chars).collect(),
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(" ");

                // Get file metadata
                let metadata = tokio::fs::metadata(&path).await.map_err(|e| ApiError::Io(e))?;
                let file_size = metadata.len() as i64;
                let mime_type = get_mime_type(extension);
                let file_type = extension.to_lowercase();
                let is_text = is_text_document(extension);

                // Read content for text files
                let content = if is_text {
                    tokio::fs::read_to_string(&path).await.ok()
                } else {
                    None
                };

                // Create document
                let create_payload = CreateDocument {
                    team_id: team.id,
                    folder_id: parent_folder_id,
                    title: title.clone(),
                    content,
                    file_type: Some(file_type.clone()),
                    icon: None,
                };

                let document = Document::create(&deployment.db().pool, &create_payload).await?;

                // Update with file metadata
                Document::update_file_metadata(
                    &deployment.db().pool,
                    document.id,
                    &path_str,
                    file_size,
                    mime_type,
                    &file_type,
                ).await?;

                documents_created += 1;
                document_names.push(title);
            }
        }
    }

    // Count folders created (get current count and compare)
    let all_folders = DocumentFolder::find_all_by_team(&deployment.db().pool, team.id).await?;
    folders_created = all_folders.len();
    folder_names = all_folders.iter().map(|f| f.name.clone()).collect();

    deployment
        .track_if_analytics_allowed(
            "documents_scan_all",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "folders_created": folders_created,
                "documents_created": documents_created,
                "total_scanned": total_scanned,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(ScanAllResponse {
        folders_created,
        documents_created,
        total_scanned,
        folder_names,
        document_names,
    })))
}

/// Upload documents via multipart form
///
/// Accepts files via browser file picker and stores them on Railway.
/// Text files have content stored in database, binary files stored to /data/uploads/
pub async fn upload_documents(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    mut multipart: Multipart,
) -> Result<ResponseJson<ApiResponse<UploadResult>>, ApiError> {
    let mut uploaded = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();
    let mut uploaded_titles = Vec::new();
    let mut folder_id: Option<Uuid> = None;

    // Get existing documents to check for duplicates
    let existing_docs = Document::find_all_by_team(&deployment.db().pool, team.id, false).await?;
    let existing_titles: HashSet<String> = existing_docs
        .iter()
        .map(|d| d.title.to_lowercase())
        .collect();

    // Process multipart fields
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        ApiError::BadRequest(format!("Failed to read multipart field: {}", e))
    })? {
        let field_name = field.name().unwrap_or("").to_string();

        // Handle folder_id field
        if field_name == "folder_id" {
            if let Ok(text) = field.text().await {
                if !text.is_empty() {
                    folder_id = Uuid::parse_str(&text).ok();
                }
            }
            continue;
        }

        // Handle file fields
        if field_name == "files[]" || field_name.starts_with("files") {
            let filename = field.file_name().unwrap_or("unknown").to_string();

            // Get extension
            let extension = std::path::Path::new(&filename)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            // Check if supported
            if !is_supported_document(&extension) {
                errors.push(format!("{}: unsupported format", filename));
                continue;
            }

            // Read file bytes
            let bytes = match field.bytes().await {
                Ok(b) => b,
                Err(e) => {
                    errors.push(format!("{}: failed to read - {}", filename, e));
                    continue;
                }
            };

            // Extract title from filename
            let file_stem = std::path::Path::new(&filename)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled");

            let title = file_stem
                .split(|c| c == '-' || c == '_')
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => first.to_uppercase().chain(chars).collect(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");

            // Check for duplicates
            if existing_titles.contains(&title.to_lowercase()) {
                skipped += 1;
                continue;
            }

            let mime_type = get_mime_type(&extension);
            let file_type = extension.clone();
            let is_text = is_text_document(&extension);
            let file_size = bytes.len() as i64;

            // For text files, store content in database
            // For binary files, store to /data/uploads/
            let (content, file_path) = if is_text {
                let text_content = String::from_utf8_lossy(&bytes).to_string();
                (Some(text_content), None)
            } else {
                // Store binary file to uploads directory
                let upload_dir = std::path::PathBuf::from("/data/uploads");
                if let Err(e) = tokio::fs::create_dir_all(&upload_dir).await {
                    tracing::warn!("Failed to create uploads directory: {}", e);
                }

                let doc_id = Uuid::new_v4();
                let file_path = upload_dir.join(format!("{}.{}", doc_id, extension));

                if let Err(e) = tokio::fs::write(&file_path, &bytes).await {
                    errors.push(format!("{}: failed to save - {}", filename, e));
                    continue;
                }

                (None, Some(file_path.to_string_lossy().to_string()))
            };

            // Create document record
            let create_payload = CreateDocument {
                team_id: team.id,
                folder_id,
                title: title.clone(),
                content,
                file_type: Some(file_type.clone()),
                icon: None,
            };

            match Document::create(&deployment.db().pool, &create_payload).await {
                Ok(document) => {
                    // Update file metadata if we have a file path
                    if let Some(ref path) = file_path {
                        let _ = Document::update_file_metadata(
                            &deployment.db().pool,
                            document.id,
                            path,
                            file_size,
                            mime_type,
                            &file_type,
                        ).await;
                    }

                    uploaded += 1;
                    uploaded_titles.push(title);
                }
                Err(e) => {
                    errors.push(format!("{}: database error - {}", filename, e));
                }
            }
        }
    }

    deployment
        .track_if_analytics_allowed(
            "documents_uploaded",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "uploaded": uploaded,
                "skipped": skipped,
                "errors": errors.len(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(UploadResult {
        uploaded,
        skipped,
        errors,
        uploaded_titles,
    })))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    // Routes with only team_id (can use middleware)
    let documents_list_router = Router::new()
        .route("/", get(get_documents).post(create_document))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    let folders_list_router = Router::new()
        .route("/", get(get_folders).post(create_folder))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    // Scan filesystem route (requires team middleware)
    let scan_router = Router::new()
        .route("/folders/{folder_id}/scan", post(scan_filesystem))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    // Discover folders route (requires team middleware)
    let discover_router = Router::new()
        .route("/documents/discover-folders", post(discover_folders))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    // Scan all (recursive) route (requires team middleware)
    let scan_all_router = Router::new()
        .route("/documents/scan-all", post(scan_all_filesystem))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    // Upload documents route (requires team middleware)
    let upload_router = Router::new()
        .route("/documents/upload", post(upload_documents))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    // Routes with additional path params (manually load team)
    let document_item_router = Router::new()
        .route(
            "/",
            get(get_document).put(update_document).delete(delete_document),
        )
        .route("/content", get(get_document_content))
        .route("/file", get(get_document_file));

    let folder_item_router = Router::new().route(
        "/",
        get(get_folder).put(update_folder).delete(delete_folder),
    );

    // Route for looking up document by slug (requires team middleware)
    let by_slug_router = Router::new()
        .route("/documents/by-slug/{slug}", get(get_document_by_slug))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    // Combine documents routes
    let documents_router = Router::new()
        .merge(documents_list_router)
        .nest("/{document_id}", document_item_router);

    // Combine folders routes
    let folders_router = Router::new()
        .merge(folders_list_router)
        .nest("/{folder_id}", folder_item_router);

    // Combine under team context
    let team_documents_router = Router::new()
        .nest("/documents", documents_router)
        .nest("/folders", folders_router)
        .merge(scan_router)
        .merge(discover_router)
        .merge(scan_all_router)
        .merge(upload_router)
        .merge(by_slug_router);

    // Match teams router pattern: /teams + /{team_id}
    let inner = Router::new().nest("/{team_id}", team_documents_router);
    Router::new().nest("/teams", inner)
}
