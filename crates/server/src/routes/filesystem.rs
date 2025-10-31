use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use deployment::Deployment;
use serde::Deserialize;
use services::services::filesystem::{DirectoryEntry, DirectoryListResponse, FilesystemError};
use services::services::slash_commands::SlashCommandService;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ListDirectoryQuery {
    path: Option<String>,
}

pub async fn list_directory(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListDirectoryQuery>,
) -> Result<ResponseJson<ApiResponse<DirectoryListResponse>>, ApiError> {
    match deployment.filesystem().list_directory(query.path).await {
        Ok(response) => Ok(ResponseJson(ApiResponse::success(response))),
        Err(FilesystemError::DirectoryDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("Directory does not exist")))
        }
        Err(FilesystemError::PathIsNotDirectory) => {
            Ok(ResponseJson(ApiResponse::error("Path is not a directory")))
        }
        Err(FilesystemError::Io(e)) => {
            tracing::error!("Failed to read directory: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to read directory: {}",
                e
            ))))
        }
    }
}

pub async fn list_git_repos(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListDirectoryQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<DirectoryEntry>>>, ApiError> {
    let res = if let Some(ref path) = query.path {
        deployment
            .filesystem()
            .list_git_repos(Some(path.clone()), 800, 1200, Some(3))
            .await
    } else {
        deployment
            .filesystem()
            .list_common_git_repos(800, 1200, Some(4))
            .await
    };
    match res {
        Ok(response) => Ok(ResponseJson(ApiResponse::success(response))),
        Err(FilesystemError::DirectoryDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("Directory does not exist")))
        }
        Err(FilesystemError::PathIsNotDirectory) => {
            Ok(ResponseJson(ApiResponse::error("Path is not a directory")))
        }
        Err(FilesystemError::Io(e)) => {
            tracing::error!("Failed to read directory: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to read directory: {}",
                e
            ))))
        }
    }
}

pub async fn get_slash_commands(
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<serde_json::Value>>>, ApiError> {
    let service = SlashCommandService::new();
    match service.get_commands().await {
        Ok(commands) => {
            let json_commands: Vec<serde_json::Value> = commands
                .into_iter()
                .filter_map(|cmd| match serde_json::to_value(cmd) {
                    Ok(value) => Some(value),
                    Err(e) => {
                        tracing::error!("Failed to serialize slash command: {}", e);
                        None
                    }
                })
                .collect();
            Ok(ResponseJson(ApiResponse::success(json_commands)))
        }
        Err(e) => {
            tracing::error!("Failed to load slash commands: {}", e);
            Err(ApiError::Io(e))
        }
    }
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/filesystem/directory", get(list_directory))
        .route("/filesystem/git-repos", get(list_git_repos))
        .route("/filesystem/slash-commands", get(get_slash_commands))
}
