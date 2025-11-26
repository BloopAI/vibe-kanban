use std::path::{Path, PathBuf};

use db::models::{
    project::{CreateProject, Project, ProjectError, SearchMatchType, SearchResult, UpdateProject},
    project_repository::{CreateProjectRepository, ProjectRepository},
    task::Task,
};
use ignore::WalkBuilder;
use sqlx::SqlitePool;
use thiserror::Error;
use utils::{api::projects::RemoteProject, path::expand_tilde};
use uuid::Uuid;

use super::{
    file_ranker::FileRanker,
    file_search_cache::{CacheError, FileSearchCache, SearchMode, SearchQuery},
    git::GitService,
    share::{ShareError, link_shared_tasks_to_project},
};

#[derive(Debug, Error)]
pub enum ProjectServiceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Project(#[from] ProjectError),
    #[error(transparent)]
    Share(#[from] ShareError),
    #[error("Path does not exist: {0}")]
    PathNotFound(PathBuf),
    #[error("Path is not a directory: {0}")]
    PathNotDirectory(PathBuf),
    #[error("Path is not a git repository: {0}")]
    NotGitRepository(PathBuf),
    #[error("Duplicate git repository path")]
    DuplicateGitRepoPath,
    #[error("Duplicate repository name in project")]
    DuplicateRepositoryName,
    #[error("Cannot delete the last repository in a project")]
    CannotDeleteLastRepository,
    #[error("Repository not found")]
    RepositoryNotFound,
    #[error("Git operation failed: {0}")]
    GitError(String),
    #[error("Project has no repositories configured")]
    NoRepositoriesConfigured,
    #[error("Remote client error: {0}")]
    RemoteClient(String),
}

pub type Result<T> = std::result::Result<T, ProjectServiceError>;

#[derive(Clone, Default)]
pub struct ProjectService;

impl ProjectService {
    pub fn new() -> Self {
        Self
    }

    /// Validate that a path exists and is a git repository
    pub fn validate_git_repo_path(&self, path: &Path) -> Result<()> {
        if !path.exists() {
            return Err(ProjectServiceError::PathNotFound(path.to_path_buf()));
        }

        if !path.is_dir() {
            return Err(ProjectServiceError::PathNotDirectory(path.to_path_buf()));
        }

        if !path.join(".git").exists() {
            return Err(ProjectServiceError::NotGitRepository(path.to_path_buf()));
        }

        Ok(())
    }

    /// Expand tilde and convert to absolute path
    pub fn normalize_path(&self, path: &str) -> std::io::Result<PathBuf> {
        std::path::absolute(expand_tilde(path))
    }

    pub async fn create_project(
        &self,
        pool: &SqlitePool,
        git_service: &GitService,
        payload: CreateProject,
    ) -> Result<Project> {
        let path = self.normalize_path(&payload.git_repo_path)?;

        if Project::find_by_git_repo_path(pool, path.to_string_lossy().as_ref())
            .await?
            .is_some()
        {
            return Err(ProjectServiceError::DuplicateGitRepoPath);
        }

        if payload.use_existing_repo {
            self.validate_git_repo_path(&path)?;
            git_service
                .ensure_main_branch_exists(&path)
                .map_err(|e| ProjectServiceError::GitError(e.to_string()))?;
        } else {
            // For new repos, create directory and initialize git
            if !path.exists() {
                std::fs::create_dir_all(&path)?;
            }

            // Check if it's already a git repo, if not initialize it
            if !path.join(".git").exists() {
                git_service
                    .initialize_repo_with_main_branch(&path)
                    .map_err(|e| ProjectServiceError::GitError(e.to_string()))?;
            }
        }

        let id = Uuid::new_v4();
        let project = Project::create(
            pool,
            &CreateProject {
                name: payload.name,
                git_repo_path: path.to_string_lossy().to_string(),
                use_existing_repo: payload.use_existing_repo,
                setup_script: payload.setup_script,
                dev_script: payload.dev_script,
                cleanup_script: payload.cleanup_script,
                copy_files: payload.copy_files,
            },
            id,
        )
        .await
        .map_err(|e| ProjectServiceError::Project(ProjectError::CreateFailed(e.to_string())))?;

        Ok(project)
    }

    pub async fn update_project(
        &self,
        pool: &SqlitePool,
        existing: &Project,
        payload: UpdateProject,
    ) -> Result<Project> {
        let git_repo_path = if let Some(ref new_path) = payload.git_repo_path {
            let expanded = expand_tilde(new_path);
            if expanded != existing.git_repo_path {
                // Check for duplicates
                if Project::find_by_git_repo_path_excluding_id(
                    pool,
                    expanded.to_string_lossy().as_ref(),
                    existing.id,
                )
                .await?
                .is_some()
                {
                    return Err(ProjectServiceError::DuplicateGitRepoPath);
                }
                expanded
            } else {
                existing.git_repo_path.clone()
            }
        } else {
            existing.git_repo_path.clone()
        };

        let project = Project::update(
            pool,
            existing.id,
            payload.name.unwrap_or_else(|| existing.name.clone()),
            git_repo_path.to_string_lossy().to_string(),
            payload.setup_script,
            payload.dev_script,
            payload.cleanup_script,
            payload.copy_files,
        )
        .await?;

        Ok(project)
    }

    /// Link a project to a remote project and sync shared tasks
    pub async fn link_to_remote(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        remote_project: RemoteProject,
        current_user_id: Option<Uuid>,
    ) -> Result<Project> {
        Project::set_remote_project_id(pool, project_id, Some(remote_project.id)).await?;

        link_shared_tasks_to_project(pool, current_user_id, project_id, remote_project.id).await?;

        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(ProjectError::ProjectNotFound)?;

        Ok(project)
    }

    pub async fn unlink_from_remote(
        &self,
        pool: &SqlitePool,
        project: &Project,
    ) -> Result<Project> {
        if let Some(remote_project_id) = project.remote_project_id {
            let mut tx = pool.begin().await?;

            Task::clear_shared_task_ids_for_remote_project(&mut *tx, remote_project_id).await?;
            Project::set_remote_project_id_tx(&mut *tx, project.id, None).await?;

            tx.commit().await?;
        }

        let updated = Project::find_by_id(pool, project.id)
            .await?
            .ok_or(ProjectError::ProjectNotFound)?;

        Ok(updated)
    }

    pub async fn add_repository(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        payload: &CreateProjectRepository,
    ) -> Result<ProjectRepository> {
        let path = self.normalize_path(&payload.git_repo_path)?;

        self.validate_git_repo_path(&path)?;

        if ProjectRepository::find_by_project_and_name(pool, project_id, &payload.name)
            .await?
            .is_some()
        {
            return Err(ProjectServiceError::DuplicateRepositoryName);
        }

        if ProjectRepository::find_by_project_and_path(pool, project_id, &path.to_string_lossy())
            .await?
            .is_some()
        {
            return Err(ProjectServiceError::DuplicateGitRepoPath);
        }

        let repository = ProjectRepository::create(
            pool,
            project_id,
            &CreateProjectRepository {
                name: payload.name.clone(),
                git_repo_path: path.to_string_lossy().to_string(),
            },
        )
        .await?;

        Ok(repository)
    }

    pub async fn delete_repository(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<()> {
        let existing = ProjectRepository::find_by_id(pool, repo_id)
            .await?
            .ok_or(ProjectServiceError::RepositoryNotFound)?;

        if existing.project_id != project_id {
            return Err(ProjectServiceError::RepositoryNotFound);
        }

        // Don't allow deleting the last repository
        let count = ProjectRepository::count_by_project_id(pool, project_id).await?;
        if count <= 1 {
            return Err(ProjectServiceError::CannotDeleteLastRepository);
        }

        ProjectRepository::delete(pool, repo_id).await?;
        Ok(())
    }

    pub async fn get_repositories(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<ProjectRepository>> {
        let repos = ProjectRepository::find_by_project_id(pool, project_id).await?;
        Ok(repos)
    }

    pub async fn search_files(
        &self,
        cache: &FileSearchCache,
        repo_path: &Path,
        query: &SearchQuery,
    ) -> Result<Vec<SearchResult>> {
        let query_str = query.q.trim();
        if query_str.is_empty() {
            return Ok(vec![]);
        }

        // Try cache first
        match cache.search(repo_path, query_str, query.mode.clone()).await {
            Ok(results) => Ok(results),
            Err(CacheError::Miss) | Err(CacheError::BuildError(_)) => {
                // Fall back to filesystem search
                self.search_files_in_repo(repo_path, query_str, query.mode.clone())
                    .await
            }
        }
    }

    async fn search_files_in_repo(
        &self,
        repo_path: &Path,
        query: &str,
        mode: SearchMode,
    ) -> Result<Vec<SearchResult>> {
        if !repo_path.exists() {
            return Err(ProjectServiceError::PathNotFound(repo_path.to_path_buf()));
        }

        let mut results = Vec::new();
        let query_lower = query.to_lowercase();

        let walker = match mode {
            SearchMode::Settings => {
                // Settings mode: Include ignored files but exclude performance killers
                WalkBuilder::new(repo_path)
                    .git_ignore(false)
                    .git_global(false)
                    .git_exclude(false)
                    .hidden(false)
                    .filter_entry(|entry| {
                        let name = entry.file_name().to_string_lossy();
                        name != ".git"
                            && name != "node_modules"
                            && name != "target"
                            && name != "dist"
                            && name != "build"
                    })
                    .build()
            }
            SearchMode::TaskForm => WalkBuilder::new(repo_path)
                .git_ignore(true)
                .git_global(true)
                .git_exclude(true)
                .hidden(false)
                .filter_entry(|entry| {
                    let name = entry.file_name().to_string_lossy();
                    name != ".git"
                })
                .build(),
        };

        for result in walker {
            let entry = result.map_err(std::io::Error::other)?;
            let path = entry.path();

            // Skip the root directory itself
            if path == repo_path {
                continue;
            }

            let relative_path = path
                .strip_prefix(repo_path)
                .map_err(std::io::Error::other)?;
            let relative_path_str = relative_path.to_string_lossy().to_lowercase();

            let file_name = path
                .file_name()
                .map(|name| name.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            if file_name.contains(&query_lower) {
                results.push(SearchResult {
                    path: relative_path.to_string_lossy().to_string(),
                    is_file: path.is_file(),
                    match_type: SearchMatchType::FileName,
                });
            } else if relative_path_str.contains(&query_lower) {
                let match_type = if path
                    .parent()
                    .and_then(|p| p.file_name())
                    .map(|name| name.to_string_lossy().to_lowercase())
                    .unwrap_or_default()
                    .contains(&query_lower)
                {
                    SearchMatchType::DirectoryName
                } else {
                    SearchMatchType::FullPath
                };

                results.push(SearchResult {
                    path: relative_path.to_string_lossy().to_string(),
                    is_file: path.is_file(),
                    match_type,
                });
            }
        }

        // Apply git history-based ranking
        let file_ranker = FileRanker::new();
        match file_ranker.get_stats(repo_path).await {
            Ok(stats) => {
                file_ranker.rerank(&mut results, &stats);
            }
            Err(_) => {
                // Fallback to basic priority sorting
                results.sort_by(|a, b| {
                    let priority = |match_type: &SearchMatchType| match match_type {
                        SearchMatchType::FileName => 0,
                        SearchMatchType::DirectoryName => 1,
                        SearchMatchType::FullPath => 2,
                    };

                    priority(&a.match_type)
                        .cmp(&priority(&b.match_type))
                        .then_with(|| a.path.cmp(&b.path))
                });
            }
        }

        results.truncate(10);
        Ok(results)
    }
}
