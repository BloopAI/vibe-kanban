use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
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
    } else if query.folder_id.is_some() || query.folder_id.is_none() {
        Document::find_by_folder(&deployment.db().pool, team.id, query.folder_id).await?
    } else {
        let include_archived = query.include_archived.unwrap_or(false);
        Document::find_all_by_team(&deployment.db().pool, team.id, include_archived).await?
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
            None, // No subfolder for new documents
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

    // Use folder's local_path if set, otherwise fall back to default path
    let scan_path = if let Some(ref local_path) = folder.local_path {
        std::path::PathBuf::from(local_path)
    } else {
        // Default fallback: dev_assets/documents/{team_id}/
        let base_path = asset_dir();
        base_path.join("documents").join(team.id.to_string())
    };

    // Get all existing documents for this folder to avoid duplicates
    let existing_docs = Document::find_by_folder(&deployment.db().pool, team.id, Some(folder_id)).await?;
    let existing_paths: HashSet<String> = existing_docs
        .iter()
        .filter_map(|d| d.file_path.clone())
        .collect();

    // Also build a set of normalized existing titles for matching
    let existing_titles: HashSet<String> = existing_docs
        .iter()
        .map(|d| d.title.to_lowercase().replace(' ', "-"))
        .collect();

    let mut documents_added = 0;
    let mut added_titles = Vec::new();
    let mut files_scanned = 0;
    let mut documents_updated = 0;

    // Scan the directory for markdown files
    if scan_path.exists() {
        let mut entries = tokio::fs::read_dir(&scan_path).await
            .map_err(|e| ApiError::Io(e))?;

        while let Some(entry) = entries.next_entry().await.map_err(|e| ApiError::Io(e))? {
            let path = entry.path();

            // Only process .md files
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }

            files_scanned += 1;
            let path_str = path.to_string_lossy().to_string();

            // Extract title from filename (remove .md extension, convert kebab-case to Title Case)
            let file_stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled");

            let title = file_stem
                .split('-')
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
                // Path matches, update content from file
                if let Some(existing_doc) = existing_docs.iter().find(|d| d.file_path.as_ref() == Some(&path_str)) {
                    // Read file content
                    let content = tokio::fs::read_to_string(&path).await.ok();
                    if content.is_some() {
                        // Update document content
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
                        documents_updated += 1;
                    }
                }
                continue;
            }

            // Check if document exists by normalized title
            if existing_titles.contains(&normalized_title) {
                // Title matches, update the existing document with new file path and content
                if let Some(existing_doc) = existing_docs.iter().find(|d|
                    d.title.to_lowercase().replace(' ', "-") == normalized_title
                ) {
                    let content = tokio::fs::read_to_string(&path).await.ok();
                    let metadata = tokio::fs::metadata(&path).await.map_err(|e| ApiError::Io(e))?;
                    let file_size = metadata.len() as i64;

                    // Update content
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

                    // Update file metadata
                    Document::update_file_metadata(
                        &deployment.db().pool,
                        existing_doc.id,
                        &path_str,
                        file_size,
                        "text/markdown",
                        "markdown",
                    ).await?;

                    documents_updated += 1;
                }
                continue;
            }

            // New document - read content from file
            let content = tokio::fs::read_to_string(&path).await.ok();

            // Get file metadata
            let metadata = tokio::fs::metadata(&path).await.map_err(|e| ApiError::Io(e))?;
            let file_size = metadata.len() as i64;

            // Create document record with content
            let create_payload = CreateDocument {
                team_id: team.id,
                folder_id: Some(folder_id),
                title: title.clone(),
                content,
                file_type: Some("markdown".to_string()),
                icon: None,
            };

            let document = Document::create(&deployment.db().pool, &create_payload).await?;

            // Update with file metadata
            Document::update_file_metadata(
                &deployment.db().pool,
                document.id,
                &path_str,
                file_size,
                "text/markdown",
                "markdown",
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
                "documents_added": documents_added,
                "documents_updated": documents_updated,
                "files_scanned": files_scanned,
                "local_path": folder.local_path,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(ScanFilesystemResponse {
        documents_added,
        added_titles,
        files_scanned,
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

    // Routes with additional path params (manually load team)
    let document_item_router = Router::new().route(
        "/",
        get(get_document).put(update_document).delete(delete_document),
    );

    let folder_item_router = Router::new().route(
        "/",
        get(get_folder).put(update_folder).delete(delete_folder),
    );

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
        .merge(scan_router);

    // Match teams router pattern: /teams + /{team_id}
    let inner = Router::new().nest("/{team_id}", team_documents_router);
    Router::new().nest("/teams", inner)
}
