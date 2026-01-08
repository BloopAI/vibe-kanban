use std::path::{Path, PathBuf};

use db::models::repo::Repo as RepoModel;
use sqlx::PgPool;
use thiserror::Error;
use utils::path::expand_tilde;
use uuid::Uuid;

use super::git::{GitService, GitServiceError};

#[derive(Debug, Error)]
pub enum RepoError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("Path does not exist: {0}")]
    PathNotFound(PathBuf),
    #[error("Path is not a directory: {0}")]
    PathNotDirectory(PathBuf),
    #[error("Path is not a git repository: {0}")]
    NotGitRepository(PathBuf),
    #[error("Repository not found")]
    NotFound,
    #[error("Directory already exists: {0}")]
    DirectoryAlreadyExists(PathBuf),
    #[error("Git error: {0}")]
    Git(#[from] GitServiceError),
    #[error("Invalid folder name: {0}")]
    InvalidFolderName(String),
}

pub type Result<T> = std::result::Result<T, RepoError>;

#[derive(Clone, Default)]
pub struct RepoService;

impl RepoService {
    pub fn new() -> Self {
        Self
    }

    pub fn validate_git_repo_path(&self, path: &Path) -> Result<()> {
        if !path.exists() {
            return Err(RepoError::PathNotFound(path.to_path_buf()));
        }

        if !path.is_dir() {
            return Err(RepoError::PathNotDirectory(path.to_path_buf()));
        }

        if !path.join(".git").exists() {
            return Err(RepoError::NotGitRepository(path.to_path_buf()));
        }

        Ok(())
    }

    pub fn normalize_path(&self, path: &str) -> std::io::Result<PathBuf> {
        std::path::absolute(expand_tilde(path))
    }

    pub async fn register(
        &self,
        pool: &PgPool,
        path: &str,
        display_name: Option<&str>,
    ) -> Result<RepoModel> {
        let normalized_path = self.normalize_path(path)?;
        self.validate_git_repo_path(&normalized_path)?;

        let name = normalized_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unnamed".to_string());

        let display_name = display_name.unwrap_or(&name);

        let repo = RepoModel::find_or_create(pool, &normalized_path, display_name).await?;
        Ok(repo)
    }

    pub async fn find_by_id(&self, pool: &PgPool, repo_id: Uuid) -> Result<Option<RepoModel>> {
        let repo = RepoModel::find_by_id(pool, repo_id).await?;
        Ok(repo)
    }

    pub async fn get_by_id(&self, pool: &PgPool, repo_id: Uuid) -> Result<RepoModel> {
        self.find_by_id(pool, repo_id)
            .await?
            .ok_or(RepoError::NotFound)
    }

    pub async fn init_repo(
        &self,
        pool: &PgPool,
        git: &GitService,
        parent_path: &str,
        folder_name: &str,
    ) -> Result<RepoModel> {
        if folder_name.is_empty()
            || folder_name.contains('/')
            || folder_name.contains('\\')
            || folder_name == "."
            || folder_name == ".."
        {
            return Err(RepoError::InvalidFolderName(folder_name.to_string()));
        }

        let normalized_parent = self.normalize_path(parent_path)?;
        if !normalized_parent.exists() {
            return Err(RepoError::PathNotFound(normalized_parent));
        }
        if !normalized_parent.is_dir() {
            return Err(RepoError::PathNotDirectory(normalized_parent));
        }

        let repo_path = normalized_parent.join(folder_name);
        if repo_path.exists() {
            return Err(RepoError::DirectoryAlreadyExists(repo_path));
        }

        git.initialize_repo_with_main_branch(&repo_path)?;

        let repo = RepoModel::find_or_create(pool, &repo_path, folder_name).await?;
        Ok(repo)
    }
}
