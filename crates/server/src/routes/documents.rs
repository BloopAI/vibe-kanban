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
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_team_middleware};

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
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, folder_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<DocumentFolder>>, ApiError> {
    let folder = DocumentFolder::find_by_id(&deployment.db().pool, folder_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify folder belongs to team
    if folder.team_id != team.id {
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
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, folder_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateDocumentFolder>,
) -> Result<ResponseJson<ApiResponse<DocumentFolder>>, ApiError> {
    // Verify folder belongs to team
    let existing = DocumentFolder::find_by_id(&deployment.db().pool, folder_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    if existing.team_id != team.id {
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
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, folder_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Verify folder belongs to team
    let existing = DocumentFolder::find_by_id(&deployment.db().pool, folder_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    if existing.team_id != team.id {
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
    let documents = if let Some(search) = query.search {
        Document::search(&deployment.db().pool, team.id, &search).await?
    } else if query.folder_id.is_some() || query.folder_id.is_none() {
        Document::find_by_folder(&deployment.db().pool, team.id, query.folder_id).await?
    } else {
        let include_archived = query.include_archived.unwrap_or(false);
        Document::find_all_by_team(&deployment.db().pool, team.id, include_archived).await?
    };

    Ok(ResponseJson(ApiResponse::success(documents)))
}

/// Get a single document by ID
pub async fn get_document(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, document_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<Document>>, ApiError> {
    let document = Document::find_by_id(&deployment.db().pool, document_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify document belongs to team
    if document.team_id != team.id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    Ok(ResponseJson(ApiResponse::success(document)))
}

/// Create a new document
pub async fn create_document(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Json(mut payload): Json<CreateDocument>,
) -> Result<ResponseJson<ApiResponse<Document>>, ApiError> {
    // Ensure team_id matches the route
    payload.team_id = team.id;

    let document = Document::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "document_created",
            serde_json::json!({
                "team_id": team.id.to_string(),
                "document_id": document.id.to_string(),
                "document_title": document.title,
                "file_type": document.file_type,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(document)))
}

/// Update a document
pub async fn update_document(
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, document_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateDocument>,
) -> Result<ResponseJson<ApiResponse<Document>>, ApiError> {
    // Verify document belongs to team
    let existing = Document::find_by_id(&deployment.db().pool, document_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    if existing.team_id != team.id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    let document = Document::update(&deployment.db().pool, document_id, &payload).await?;

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
    Extension(team): Extension<Team>,
    State(deployment): State<DeploymentImpl>,
    Path((_team_id, document_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Verify document belongs to team
    let existing = Document::find_by_id(&deployment.db().pool, document_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    if existing.team_id != team.id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

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
    // Routes under /teams/{team_id}/documents
    let documents_router = Router::new()
        .route("/", get(get_documents).post(create_document))
        .route(
            "/{document_id}",
            get(get_document).put(update_document).delete(delete_document),
        );

    // Routes under /teams/{team_id}/folders
    let folders_router = Router::new()
        .route("/", get(get_folders).post(create_folder))
        .route(
            "/{folder_id}",
            get(get_folder).put(update_folder).delete(delete_folder),
        );

    // Combine under team context with middleware
    let team_documents_router = Router::new()
        .nest("/documents", documents_router)
        .nest("/folders", folders_router)
        .layer(from_fn_with_state(deployment.clone(), load_team_middleware));

    Router::new().nest("/teams/{team_id}", team_documents_router)
}
