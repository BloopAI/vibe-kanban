use std::path::{Path, PathBuf};

use db::models::repo::Repo as RepoModel;
use sqlx::SqlitePool;
use thiserror::Error;
use utils::path::expand_tilde;
use uuid::Uuid;

use super::git::{GitCli, GitCliError, GitService, GitServiceError};

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
    #[error("Git CLI error: {0}")]
    GitCli(#[from] GitCliError),
    #[error("Invalid folder name: {0}")]
    InvalidFolderName(String),
    #[error("Invalid git URL: {0}")]
    InvalidGitUrl(String),
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
        pool: &SqlitePool,
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

    pub async fn find_by_id(&self, pool: &SqlitePool, repo_id: Uuid) -> Result<Option<RepoModel>> {
        let repo = RepoModel::find_by_id(pool, repo_id).await?;
        Ok(repo)
    }

    pub async fn get_by_id(&self, pool: &SqlitePool, repo_id: Uuid) -> Result<RepoModel> {
        self.find_by_id(pool, repo_id)
            .await?
            .ok_or(RepoError::NotFound)
    }

    pub async fn init_repo(
        &self,
        pool: &SqlitePool,
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

    /// Clone a git repository from a URL to the default repos directory.
    /// Returns the registered repository.
    pub async fn clone_repo(
        &self,
        pool: &SqlitePool,
        url: &str,
        display_name: Option<&str>,
    ) -> Result<RepoModel> {
        // Extract repo name from URL
        let repo_name = Self::extract_repo_name_from_url(url)
            .ok_or_else(|| RepoError::InvalidGitUrl(url.to_string()))?;

        // Get the repos directory (create if it doesn't exist)
        let repos_dir = Self::get_repos_dir();
        if !repos_dir.exists() {
            std::fs::create_dir_all(&repos_dir)?;
        }

        let target_path = repos_dir.join(&repo_name);
        if target_path.exists() {
            return Err(RepoError::DirectoryAlreadyExists(target_path));
        }

        // Clone the repository using git CLI
        let git_cli = GitCli::new();
        git_cli.clone(url, &target_path)?;

        // Verify it's a valid git repo
        self.validate_git_repo_path(&target_path)?;

        // Register the repo in the database
        let display = display_name.unwrap_or(&repo_name);
        let repo = RepoModel::find_or_create(pool, &target_path, display).await?;

        Ok(repo)
    }

    /// Get the default directory for cloned repositories
    pub fn get_repos_dir() -> PathBuf {
        utils::path::get_vibe_kanban_temp_dir().join("repos")
    }

    /// Extract repository name from a git URL.
    /// Handles both HTTPS and SSH URLs:
    /// - https://github.com/user/repo.git -> repo
    /// - git@github.com:user/repo.git -> repo
    /// - https://github.com/user/repo -> repo
    fn extract_repo_name_from_url(url: &str) -> Option<String> {
        let url = url.trim();
        if url.is_empty() {
            return None;
        }

        // Handle SSH format: git@github.com:user/repo.git
        let path = if url.contains(':') && !url.starts_with("http") {
            url.split(':').last()?
        } else {
            // Handle HTTPS format: https://github.com/user/repo.git
            url.split('/').last()?
        };

        // Remove .git suffix if present
        let name = path.strip_suffix(".git").unwrap_or(path);

        if name.is_empty() || name == "." || name == ".." {
            return None;
        }

        Some(name.to_string())
    }
}
