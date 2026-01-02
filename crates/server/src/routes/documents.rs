use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::get,
};
use db::models::document::{
    CreateDocument, CreateDocumentFolder, Document, DocumentFolder, UpdateDocument,
    UpdateDocumentFolder,
};
use db::models::team::Team;
use deployment::Deployment;
use serde::Deserialize;
use services::services::document_storage::DocumentStorageService;
use ts_rs::TS;
use utils::assets::asset_dir;
use utils::response::ApiResponse;
use uuid::Uuid;

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

    // Create document record in DB (without content)
    let document = Document::create(&deployment.db().pool, &payload).await?;

    // Write content to filesystem (use team's custom path if configured)
    let file_info = storage
        .write_document_with_path(
            team.id,
            document.id,
            &content,
            &file_type,
            team.document_storage_path.as_deref(),
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

    // If content was provided, write to filesystem (use team's custom path if configured)
    if let Some(ref content) = payload.content {
        let file_info = storage
            .write_document_with_path(
                team.id,
                document.id,
                content,
                &document.file_type,
                team.document_storage_path.as_deref(),
            )
            .await
            .map_err(|e| ApiError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

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

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    // Routes with only team_id (can use middleware)
    let documents_list_router = Router::new()
        .route("/", get(get_documents).post(create_document))
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    let folders_list_router = Router::new()
        .route("/", get(get_folders).post(create_folder))
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
        .nest("/folders", folders_router);

    // Match teams router pattern: /teams + /{team_id}
    let inner = Router::new().nest("/{team_id}", team_documents_router);
    Router::new().nest("/teams", inner)
}
