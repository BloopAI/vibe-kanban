use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use db::models::{
    project::{CreateProject, Project, ProjectError, SearchMatchType, SearchResult, UpdateProject},
    project_repo::{CreateProjectRepo, ProjectRepo},
    repo::Repo,
    task::Task,
};
use ignore::WalkBuilder;
use sqlx::SqlitePool;
use thiserror::Error;
use utils::api::projects::RemoteProject;
use uuid::Uuid;

use super::{
    file_ranker::FileRanker,
    file_search_cache::{CacheError, FileSearchCache, SearchMode, SearchQuery},
    repo::{RepoError, RepoService},
    share::ShareError,
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
    #[error("Repository not found")]
    RepositoryNotFound,
    #[error("Git operation failed: {0}")]
    GitError(String),
    #[error("Remote client error: {0}")]
    RemoteClient(String),
}

pub type Result<T> = std::result::Result<T, ProjectServiceError>;

impl From<RepoError> for ProjectServiceError {
    fn from(e: RepoError) -> Self {
        match e {
            RepoError::PathNotFound(p) => Self::PathNotFound(p),
            RepoError::PathNotDirectory(p) => Self::PathNotDirectory(p),
            RepoError::NotGitRepository(p) => Self::NotGitRepository(p),
            RepoError::Io(e) => Self::Io(e),
            RepoError::Database(e) => Self::Database(e),
            _ => Self::RepositoryNotFound,
        }
    }
}

#[derive(Clone, Default)]
pub struct ProjectService;

impl ProjectService {
    pub fn new() -> Self {
        Self
    }

    pub async fn create_project(
        &self,
        pool: &SqlitePool,
        repo_service: &RepoService,
        payload: CreateProject,
    ) -> Result<Project> {
        // Validate all repository paths and check for duplicates within the payload
        let mut seen_names = HashSet::new();
        let mut seen_paths = HashSet::new();
        let mut normalized_repos = Vec::new();

        for repo in &payload.repositories {
            let path = repo_service.normalize_path(&repo.git_repo_path)?;
            repo_service.validate_git_repo_path(&path)?;

            let normalized_path = path.to_string_lossy().to_string();

            if !seen_names.insert(repo.display_name.clone()) {
                return Err(ProjectServiceError::DuplicateRepositoryName);
            }

            if !seen_paths.insert(normalized_path.clone()) {
                return Err(ProjectServiceError::DuplicateGitRepoPath);
            }

            normalized_repos.push(CreateProjectRepo {
                display_name: repo.display_name.clone(),
                git_repo_path: normalized_path,
            });
        }

        let id = Uuid::new_v4();

        let project = Project::create(pool, &payload, id)
            .await
            .map_err(|e| ProjectServiceError::Project(ProjectError::CreateFailed(e.to_string())))?;

        let mut created_repo: Option<Repo> = None;
        for repo in &normalized_repos {
            let repo_entity =
                Repo::find_or_create(pool, Path::new(&repo.git_repo_path), &repo.display_name)
                    .await?;
            ProjectRepo::create(pool, project.id, repo_entity.id).await?;
            if created_repo.is_none() {
                created_repo = Some(repo_entity);
            }
        }

        if normalized_repos.len() == 1
            && let Some(repo) = created_repo
        {
            Project::update(
                pool,
                project.id,
                &UpdateProject {
                    name: None,
                    dev_script: None,
                    dev_script_working_dir: None,
                    default_agent_working_dir: Some(repo.name),
                },
            )
            .await?;
        }

        Ok(project)
    }

    pub async fn update_project(
        &self,
        pool: &SqlitePool,
        existing: &Project,
        payload: UpdateProject,
    ) -> Result<Project> {
        let project = Project::update(pool, existing.id, &payload).await?;

        Ok(project)
    }

    /// Link a project to a remote project and sync shared tasks
    pub async fn link_to_remote(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        remote_project: RemoteProject,
    ) -> Result<Project> {
        Project::set_remote_project_id(pool, project_id, Some(remote_project.id)).await?;

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
        repo_service: &RepoService,
        project_id: Uuid,
        payload: &CreateProjectRepo,
    ) -> Result<Repo> {
        tracing::debug!(
            "Adding repository '{}' to project {} (path: {})",
            payload.display_name,
            project_id,
            payload.git_repo_path
        );

        let path = repo_service.normalize_path(&payload.git_repo_path)?;
        repo_service.validate_git_repo_path(&path)?;

        // Count repos before adding
        let repo_count_before = ProjectRepo::find_by_project_id(pool, project_id)
            .await?
            .len();

        let repository = ProjectRepo::add_repo_to_project(
            pool,
            project_id,
            &path.to_string_lossy(),
            &payload.display_name,
        )
        .await
        .map_err(|e| match e {
            db::models::project_repo::ProjectRepoError::AlreadyExists => {
                ProjectServiceError::DuplicateGitRepoPath
            }
            db::models::project_repo::ProjectRepoError::Database(e) => {
                ProjectServiceError::Database(e)
            }
            _ => ProjectServiceError::RepositoryNotFound,
        })?;

        // If project just went from 1 to 2 repos, clear default_agent_working_dir
        if repo_count_before == 1 {
            Project::clear_default_agent_working_dir(pool, project_id).await?;
        }

        tracing::info!(
            "Added repository {} to project {} (path: {})",
            repository.id,
            project_id,
            repository.path.display()
        );

        Ok(repository)
    }

    pub async fn delete_repository(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<()> {
        tracing::debug!(
            "Removing repository {} from project {}",
            repo_id,
            project_id
        );

        ProjectRepo::remove_repo_from_project(pool, project_id, repo_id)
            .await
            .map_err(|e| match e {
                db::models::project_repo::ProjectRepoError::NotFound => {
                    ProjectServiceError::RepositoryNotFound
                }
                db::models::project_repo::ProjectRepoError::Database(e) => {
                    ProjectServiceError::Database(e)
                }
                _ => ProjectServiceError::RepositoryNotFound,
            })?;

        if let Err(e) = Repo::delete_orphaned(pool).await {
            tracing::error!("Failed to delete orphaned repos: {}", e);
        }

        tracing::info!("Removed repository {} from project {}", repo_id, project_id);

        Ok(())
    }

    pub async fn delete_project(&self, pool: &SqlitePool, project_id: Uuid) -> Result<u64> {
        let rows_affected = Project::delete(pool, project_id).await?;

        if let Err(e) = Repo::delete_orphaned(pool).await {
            tracing::error!("Failed to delete orphaned repos: {}", e);
        }

        Ok(rows_affected)
    }

    pub async fn get_repositories(&self, pool: &SqlitePool, project_id: Uuid) -> Result<Vec<Repo>> {
        let repos = ProjectRepo::find_repos_for_project(pool, project_id).await?;
        Ok(repos)
    }

    pub async fn search_files(
        &self,
        cache: &FileSearchCache,
        repositories: &[Repo],
        query: &SearchQuery,
    ) -> Result<Vec<SearchResult>> {
        let query_str = query.q.trim();
        if query_str.is_empty() || repositories.is_empty() {
            return Ok(vec![]);
        }

        // Search in parallel and prefix paths with repo name
        let search_futures: Vec<_> = repositories
            .iter()
            .map(|repo| {
                let repo_name = repo.name.clone();
                let repo_path = repo.path.clone();
                let query = query.clone();
                async move {
                    let results = self
                        .search_single_repo(cache, &repo_path, &query)
                        .await
                        .unwrap_or_else(|e| {
                            tracing::warn!("Search failed for repo {}: {}", repo_name, e);
                            vec![]
                        });
                    (repo_name, results)
                }
            })
            .collect();

        let repo_results = futures::future::join_all(search_futures).await;

        let mut all_results: Vec<SearchResult> = repo_results
            .into_iter()
            .flat_map(|(repo_name, results)| {
                results.into_iter().map(move |r| SearchResult {
                    path: format!("{}/{}", repo_name, r.path),
                    is_file: r.is_file,
                    match_type: r.match_type.clone(),
                })
            })
            .collect();

        all_results.sort_by(|a, b| {
            let priority = |m: &SearchMatchType| match m {
                SearchMatchType::FileName => 0,
                SearchMatchType::DirectoryName => 1,
                SearchMatchType::FullPath => 2,
            };
            priority(&a.match_type)
                .cmp(&priority(&b.match_type))
                .then_with(|| a.path.cmp(&b.path))
        });

        all_results.truncate(10);
        Ok(all_results)
    }

    async fn search_single_repo(
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
