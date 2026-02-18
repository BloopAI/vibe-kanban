use std::{sync::Arc, time::Duration};

use db::{
    DBService,
    models::{
        execution_process::ExecutionProcess,
        merge::Merge,
        project::{CreateProject, Project},
        project_repo::ProjectRepo,
        repo::Repo,
        task::{CreateTask, Task, TaskStatus},
        workspace::{CreateWorkspace, Workspace, WorkspaceError},
        workspace_repo::{CreateWorkspaceRepo, WorkspaceRepo},
    },
};
use executors::profile::ExecutorConfig;
use git::GitService;
use thiserror::Error;
use tokio::sync::RwLock;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::services::{
    config::Config,
    container::{ContainerError, ContainerService},
};

const DEFAULT_TICK_MD_CONTENT: &str = include_str!("default_tick.md");

const TICK_PROJECT_NAME: &str = "Tick";
const TICK_REPO_DIR_NAME: &str = "tick-repo";
const TICK_REPO_DISPLAY_NAME: &str = "tick-repo";

#[derive(Debug, Error)]
enum TickServiceError {
    #[error(transparent)]
    GitServiceError(#[from] git::GitServiceError),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Container(#[from] ContainerError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),
    #[error("Workspace not found")]
    WorkspaceNotFound,
    #[error("Task not found")]
    TaskNotFound,
    #[error("Workspace repo not found")]
    WorkspaceRepoNotFound,
}

pub struct TickService<C: ContainerService> {
    db: DBService,
    git: GitService,
    config: Arc<RwLock<Config>>,
    container: C,
    poll_interval: Duration,
    is_running: Arc<RwLock<bool>>,
    current_workspace_id: Arc<RwLock<Option<Uuid>>>,
}

impl<C: ContainerService + Clone + Send + Sync + 'static> TickService<C> {
    pub async fn spawn(
        db: DBService,
        git: GitService,
        config: Arc<RwLock<Config>>,
        container: C,
    ) -> tokio::task::JoinHandle<()> {
        let service = Self {
            db,
            git,
            config,
            container,
            poll_interval: Duration::from_secs(600), // 10 minutes
            is_running: Arc::new(RwLock::new(false)),
            current_workspace_id: Arc::new(RwLock::new(None)),
        };

        tokio::spawn(async move {
            service.start().await;
        })
    }

    async fn start(&self) {
        if std::env::var("TICK_SERVICE_ENABLED").as_deref() == Ok("false") {
            info!("Tick service disabled (set TICK_SERVICE_ENABLED=false to disable)");
            return;
        }

        info!(
            "Starting Tick service with interval {:?}",
            self.poll_interval
        );

        let (repo, project) = match self.ensure_tick_repo_and_project().await {
            Ok(result) => result,
            Err(e) => {
                error!("Failed to initialize tick repo/project: {}", e);
                return;
            }
        };

        // Archive any stale tick workspaces from a previous run
        self.archive_stale_tick_workspaces(&project).await;

        let mut tick_interval = tokio::time::interval(self.poll_interval);

        loop {
            tick_interval.tick().await;

            if let Err(e) = self.execute_tick(&repo, &project).await {
                error!("Tick execution failed: {}", e);
            }
        }
    }

    async fn ensure_tick_repo_and_project(&self) -> Result<(Repo, Project), TickServiceError> {
        let tick_repo_path = utils::assets::asset_dir().join(TICK_REPO_DIR_NAME);

        // Initialize git repo if it doesn't exist
        if !tick_repo_path.exists() {
            info!("Creating tick repo at {:?}", tick_repo_path);
            self.git.initialize_repo_with_main_branch(&tick_repo_path)?;

            // Write default tick.md
            let tick_md_path = tick_repo_path.join("tick.md");
            std::fs::write(&tick_md_path, DEFAULT_TICK_MD_CONTENT)?;

            // Commit the tick.md file
            self.git.commit(&tick_repo_path, "Add default tick.md")?;

            info!("Tick repo initialized with default tick.md");
        }

        // Register/find repo in DB
        let repo =
            Repo::find_or_create(&self.db.pool, &tick_repo_path, TICK_REPO_DISPLAY_NAME).await?;

        // Find or create a "Tick" project
        let project = self.find_or_create_tick_project(&repo).await?;

        Ok((repo, project))
    }

    async fn find_or_create_tick_project(&self, repo: &Repo) -> Result<Project, TickServiceError> {
        // Look for existing "Tick" project
        let all_projects = Project::find_all(&self.db.pool).await?;
        if let Some(existing) = all_projects
            .into_iter()
            .find(|p| p.name == TICK_PROJECT_NAME)
        {
            return Ok(existing);
        }

        // Create new "Tick" project
        let project_id = Uuid::new_v4();
        let project = Project::create(
            &self.db.pool,
            &CreateProject {
                name: TICK_PROJECT_NAME.to_string(),
                repositories: vec![],
            },
            project_id,
        )
        .await?;

        // Link tick repo to project
        let repo_path_str = repo.path.to_string_lossy().to_string();
        match ProjectRepo::add_repo_to_project(
            &self.db.pool,
            project.id,
            &repo_path_str,
            TICK_REPO_DISPLAY_NAME,
        )
        .await
        {
            Ok(_) => info!("Linked tick repo to Tick project"),
            Err(e) => warn!(
                "Failed to link tick repo to project (may already exist): {}",
                e
            ),
        }

        info!("Created Tick project with id {}", project.id);
        Ok(project)
    }

    /// Archive any non-archived tick workspaces left over from a previous service run.
    /// This handles the case where the service restarted and lost its in-memory state.
    async fn archive_stale_tick_workspaces(&self, project: &Project) {
        let pool = &self.db.pool;
        let tasks = match Task::find_by_project_id_with_attempt_status(pool, project.id).await {
            Ok(tasks) => tasks,
            Err(e) => {
                warn!("Failed to query tick tasks for cleanup: {}", e);
                return;
            }
        };

        for task in tasks {
            let workspaces = match Workspace::fetch_all(pool, Some(task.id)).await {
                Ok(ws) => ws,
                Err(e) => {
                    warn!(
                        "Failed to fetch workspaces for tick task {}: {}",
                        task.id, e
                    );
                    continue;
                }
            };

            for workspace in workspaces {
                if !workspace.archived {
                    if let Err(e) = self.container.archive_workspace(workspace.id).await {
                        warn!(
                            "Failed to archive stale tick workspace {}: {}",
                            workspace.id, e
                        );
                    }
                }
            }
        }
    }

    async fn execute_tick(&self, repo: &Repo, project: &Project) -> Result<(), TickServiceError> {
        // Check if another tick is still running
        {
            let running = self.is_running.read().await;
            if *running {
                info!("Previous tick still running, skipping this cycle");
                return Ok(());
            }
        }

        // Mark as running
        *self.is_running.write().await = true;

        // Archive the previous tick workspace so only the latest is visible
        if let Some(prev_id) = *self.current_workspace_id.read().await {
            // Only archive if it hasn't already been archived by the completion watcher
            match Workspace::find_by_id(&self.db.pool, prev_id).await {
                Ok(Some(ws)) if !ws.archived => {
                    if let Err(e) = self.container.archive_workspace(prev_id).await {
                        warn!(
                            "Failed to archive previous tick workspace {}: {}",
                            prev_id, e
                        );
                    }
                }
                _ => {}
            }
        }

        // Read tick.md from the tick repo
        let tick_md_path = repo.path.join("tick.md");
        let tick_content = match tokio::fs::read_to_string(&tick_md_path).await {
            Ok(content) => content,
            Err(e) => {
                warn!("Failed to read tick.md, using default: {}", e);
                DEFAULT_TICK_MD_CONTENT.to_string()
            }
        };

        // Create a Task
        let task_id = Uuid::new_v4();
        let task_title = format!("Tick {}", chrono::Utc::now().format("%Y-%m-%d %H:%M"));
        let task = Task::create(
            &self.db.pool,
            &CreateTask {
                project_id: project.id,
                title: task_title,
                description: Some(tick_content),
                status: Some(TaskStatus::Todo),
                parent_workspace_id: None,
                image_ids: None,
            },
            task_id,
        )
        .await?;

        // Create a Workspace
        let workspace_id = Uuid::new_v4();
        let git_branch_name = self
            .container
            .git_branch_from_workspace(&workspace_id, &task.title)
            .await;

        let workspace = Workspace::create(
            &self.db.pool,
            &CreateWorkspace {
                branch: git_branch_name,
                agent_working_dir: Some(repo.name.clone()),
            },
            workspace_id,
            task.id,
        )
        .await?;

        // Create WorkspaceRepo
        WorkspaceRepo::create_many(
            &self.db.pool,
            workspace.id,
            &[CreateWorkspaceRepo {
                repo_id: repo.id,
                target_branch: "main".to_string(),
            }],
        )
        .await?;

        // Resolve executor config from user's configured profile
        let executor_config = {
            let config = self.config.read().await;
            ExecutorConfig::from(config.executor_profile.clone())
        };

        info!(
            "Starting tick workspace {} for task '{}'",
            workspace.id, task.title
        );

        // Start workspace (runs the agent)
        match self
            .container
            .start_workspace(&workspace, executor_config)
            .await
        {
            Ok(_execution_process) => {
                info!("Tick workspace {} started successfully", workspace.id);
                *self.current_workspace_id.write().await = Some(workspace.id);
                self.spawn_completion_watcher(workspace.id, repo.clone());
            }
            Err(e) => {
                error!("Failed to start tick workspace: {}", e);
                *self.is_running.write().await = false;
            }
        }

        Ok(())
    }

    fn spawn_completion_watcher(&self, workspace_id: Uuid, repo: Repo) {
        let db = self.db.clone();
        let git = self.git.clone();
        let container = self.container.clone();
        let is_running = self.is_running.clone();

        tokio::spawn(async move {
            let poll_interval = Duration::from_secs(15);

            loop {
                tokio::time::sleep(poll_interval).await;

                let has_running =
                    ExecutionProcess::has_running_non_dev_server_processes_for_workspace(
                        &db.pool,
                        workspace_id,
                    )
                    .await
                    .unwrap_or(true);

                if !has_running {
                    break;
                }
            }

            info!(
                "Tick workspace {} completed, attempting auto-merge",
                workspace_id
            );

            if let Err(e) = auto_merge(&db, &git, &container, workspace_id, &repo).await {
                error!(
                    "Failed to auto-merge tick workspace {}: {}",
                    workspace_id, e
                );
            }

            // Archive the workspace
            if let Err(e) = container.archive_workspace(workspace_id).await {
                error!("Failed to archive tick workspace {}: {}", workspace_id, e);
            }

            // Mark tick as no longer running
            *is_running.write().await = false;
        });
    }
}

async fn auto_merge<C: ContainerService>(
    db: &DBService,
    git: &GitService,
    container: &C,
    workspace_id: Uuid,
    repo: &Repo,
) -> Result<(), TickServiceError> {
    let pool = &db.pool;

    let workspace = Workspace::find_by_id(pool, workspace_id)
        .await?
        .ok_or(TickServiceError::WorkspaceNotFound)?;

    let workspace_repo = WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, repo.id)
        .await?
        .ok_or(TickServiceError::WorkspaceRepoNotFound)?;

    let container_ref = container.ensure_container_exists(&workspace).await?;
    let workspace_path = std::path::PathBuf::from(container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    let task = workspace
        .parent_task(pool)
        .await?
        .ok_or(TickServiceError::TaskNotFound)?;

    let commit_message = format!("{} (tick auto-merge)", task.title);

    let merge_commit_id = git.merge_changes(
        &repo.path,
        &worktree_path,
        &workspace.branch,
        &workspace_repo.target_branch,
        &commit_message,
    )?;

    Merge::create_direct(
        pool,
        workspace.id,
        workspace_repo.repo_id,
        &workspace_repo.target_branch,
        &merge_commit_id,
    )
    .await?;

    Task::update_status(pool, task.id, TaskStatus::Done).await?;

    info!(
        "Auto-merged tick workspace {} into {} (commit: {})",
        workspace.id, workspace_repo.target_branch, merge_commit_id
    );

    Ok(())
}
