use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use db::models::{
    project::{CreateProject, Project, ProjectError, SearchMatchType, SearchResult, UpdateProject},
    project_repo::{CreateProjectRepo, ProjectRepo},
    repo::Repo,
};
use sqlx::SqlitePool;
use thiserror::Error;
use utils::api::projects::RemoteProject;
use uuid::Uuid;

use super::{
    file_search::{FileSearchCache, SearchQuery},
    repo::{RepoError, RepoService},
};

#[derive(Debug, Error)]
pub enum ProjectServiceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Project(#[from] ProjectError),
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

        for repo in &normalized_repos {
            let repo_entity =
                Repo::find_or_create(pool, Path::new(&repo.git_repo_path), &repo.display_name)
                    .await?;
            ProjectRepo::create(pool, project.id, repo_entity.id).await?;
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
        if project.remote_project_id.is_some() {
            Project::set_remote_project_id(pool, project.id, None).await?;
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
                let mode = query.mode.clone();
                let query_str = query_str.to_string();
                async move {
                    let results = cache
                        .search_repo(&repo_path, &query_str, mode)
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
                    score: r.score,
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
                .then_with(|| b.score.cmp(&a.score)) // Higher scores first
        });

        all_results.truncate(10);
        Ok(all_results)
    }
}
