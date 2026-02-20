use std::{collections::HashMap, sync::Arc, time::Duration};

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
use tokio::sync::{RwLock, mpsc};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::services::{
    config::Config,
    container::{ContainerError, ContainerService},
};

const DEFAULT_TICK_MD_CONTENT: &str = include_str!("default_tick.md");
const DEFAULT_SLACK_SKILL_CONTENT: &str = include_str!("default_slack_skill.md");

const TICK_PROJECT_NAME: &str = "Tick";
const TICK_REPO_DIR_NAME: &str = "tick-repo";
const TICK_REPO_DISPLAY_NAME: &str = "tick-repo";
const PERIODIC_TRIGGER: &str = "periodic";

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

#[derive(Debug, Clone)]
pub struct TickTrigger {
    pub trigger_id: String,
    /// Optional Slack context for replying in-thread
    pub slack_context: Option<SlackContext>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SlackContext {
    pub channel: String,
    pub thread_ts: String,
}

pub type TickTriggerSender = mpsc::UnboundedSender<TickTrigger>;

pub struct TickService<C: ContainerService> {
    db: DBService,
    git: GitService,
    config: Arc<RwLock<Config>>,
    container: C,
    poll_interval: Duration,
    /// Maps trigger_id -> active workspace_id for that trigger
    active_workspaces: Arc<RwLock<HashMap<String, Uuid>>>,
    trigger_rx: mpsc::UnboundedReceiver<TickTrigger>,
}

impl<C: ContainerService + Clone + Send + Sync + 'static> TickService<C> {
    pub async fn spawn(
        db: DBService,
        git: GitService,
        config: Arc<RwLock<Config>>,
        container: C,
    ) -> TickTriggerSender {
        let (trigger_tx, trigger_rx) = mpsc::unbounded_channel();

        let service = Self {
            db,
            git,
            config,
            container,
            poll_interval: Duration::from_secs(600), // 10 minutes
            active_workspaces: Arc::new(RwLock::new(HashMap::new())),
            trigger_rx,
        };

        tokio::spawn(async move {
            service.start().await;
        });

        trigger_tx
    }

    async fn start(mut self) {
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
            tokio::select! {
                _ = tick_interval.tick() => {
                    let trigger = TickTrigger {
                        trigger_id: PERIODIC_TRIGGER.to_string(),
                        slack_context: None,
                    };
                    if let Err(e) = self.execute_tick(&trigger, &repo, &project).await {
                        error!("Periodic tick execution failed: {}", e);
                    }
                }
                Some(trigger) = self.trigger_rx.recv() => {
                    info!("Received external tick trigger: {}", trigger.trigger_id);
                    if let Err(e) = self.execute_tick(&trigger, &repo, &project).await {
                        error!("Triggered tick execution failed ({}): {}", trigger.trigger_id, e);
                    }
                }
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

            // Write skills directory with slack.md
            let skills_dir = tick_repo_path.join("skills");
            std::fs::create_dir_all(&skills_dir)?;
            std::fs::write(skills_dir.join("slack.md"), DEFAULT_SLACK_SKILL_CONTENT)?;

            // Also copy slack.json into the tick repo if it exists so the agent can read it
            let slack_config_path = utils::assets::asset_dir().join("slack.json");
            if slack_config_path.exists() {
                std::fs::copy(&slack_config_path, tick_repo_path.join("slack.json"))?;
            }

            // Commit the tick.md file
            self.git
                .commit(&tick_repo_path, "Add default tick.md and skills")?;

            info!("Tick repo initialized with default tick.md and skills");
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

    async fn execute_tick(
        &self,
        trigger: &TickTrigger,
        repo: &Repo,
        project: &Project,
    ) -> Result<(), TickServiceError> {
        let trigger_id = &trigger.trigger_id;

        // Check if this trigger already has a running workspace
        {
            let active = self.active_workspaces.read().await;
            if let Some(workspace_id) = active.get(trigger_id.as_str()) {
                // Check if it's actually still running
                let has_running =
                    ExecutionProcess::has_running_non_dev_server_processes_for_workspace(
                        &self.db.pool,
                        *workspace_id,
                    )
                    .await
                    .unwrap_or(false);

                if has_running {
                    info!(
                        "Trigger '{}' already has a running workspace {}, skipping",
                        trigger_id, workspace_id
                    );
                    return Ok(());
                }
            }
        }

        // Archive the previous workspace for this trigger so only the latest is visible
        if let Some(prev_id) = self.active_workspaces.read().await.get(trigger_id).copied() {
            match Workspace::find_by_id(&self.db.pool, prev_id).await {
                Ok(Some(ws)) if !ws.archived => {
                    if let Err(e) = self.container.archive_workspace(prev_id).await {
                        warn!(
                            "Failed to archive previous tick workspace {} for trigger '{}': {}",
                            prev_id, trigger_id, e
                        );
                    }
                }
                _ => {}
            }
        }

        // Write slack_context.json if this trigger came from Slack
        let slack_context_path = repo.path.join("slack_context.json");
        if let Some(slack_ctx) = &trigger.slack_context {
            if let Ok(json) = serde_json::to_string_pretty(slack_ctx) {
                if let Err(e) = std::fs::write(&slack_context_path, json) {
                    warn!("Failed to write slack_context.json: {}", e);
                }
            }
        } else {
            // Remove stale context from a previous Slack-triggered tick
            let _ = std::fs::remove_file(&slack_context_path);
        }

        // Build task content: Slack-triggered ticks get a Slack-specific prompt,
        // periodic ticks use tick.md
        let tick_content = if let Some(slack_ctx) = &trigger.slack_context {
            // Extract the user's message from trigger_id (format: "slack:<message>")
            let user_message = trigger_id.strip_prefix("slack:").unwrap_or("").to_string();

            // Read the slack skill for reference
            let slack_skill_path = repo.path.join("skills/slack.md");
            let slack_skill = tokio::fs::read_to_string(&slack_skill_path)
                .await
                .unwrap_or_default();

            format!(
                "You were mentioned in Slack. Respond to the user's message by replying in the Slack thread.\n\
                \n\
                ## User's message\n\
                \n\
                {}\n\
                \n\
                ## Slack reply context\n\
                \n\
                A `slack_context.json` file is available with the channel and thread_ts for replying.\n\
                A `slack.json` file contains the bot token for authentication.\n\
                \n\
                Reply in the Slack thread using:\n\
                ```bash\n\
                SLACK_CONFIG=$(cat slack.json)\n\
                BOT_TOKEN=$(echo \"$SLACK_CONFIG\" | jq -r '.bot_token')\n\
                \n\
                curl -s -X POST https://slack.com/api/chat.postMessage \\\n\
                  -H \"Authorization: Bearer $BOT_TOKEN\" \\\n\
                  -H \"Content-Type: application/json\" \\\n\
                  -d '{{\n\
                    \"channel\": \"{}\",\n\
                    \"thread_ts\": \"{}\",\n\
                    \"text\": \"Your response here\"\n\
                  }}'\n\
                ```\n\
                \n\
                ## Available skills\n\
                \n\
                {}\n",
                if user_message.is_empty() {
                    "(no message)"
                } else {
                    &user_message
                },
                slack_ctx.channel,
                slack_ctx.thread_ts,
                slack_skill,
            )
        } else {
            let tick_md_path = repo.path.join("tick.md");
            match tokio::fs::read_to_string(&tick_md_path).await {
                Ok(content) => content,
                Err(e) => {
                    warn!("Failed to read tick.md, using default: {}", e);
                    DEFAULT_TICK_MD_CONTENT.to_string()
                }
            }
        };

        // Create a Task
        let task_id = Uuid::new_v4();
        let task_title = format!(
            "Tick [{}] {}",
            trigger_id,
            chrono::Utc::now().format("%Y-%m-%d %H:%M")
        );
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
            "Starting tick workspace {} for trigger '{}', task '{}'",
            workspace.id, trigger_id, task.title
        );

        // Start workspace (runs the agent)
        match self
            .container
            .start_workspace(&workspace, executor_config)
            .await
        {
            Ok(_execution_process) => {
                info!("Tick workspace {} started successfully", workspace.id);
                self.active_workspaces
                    .write()
                    .await
                    .insert(trigger_id.to_string(), workspace.id);
                self.spawn_completion_watcher(trigger_id.to_string(), workspace.id, repo.clone());
            }
            Err(e) => {
                error!("Failed to start tick workspace: {}", e);
            }
        }

        Ok(())
    }

    fn spawn_completion_watcher(&self, trigger_id: String, workspace_id: Uuid, repo: Repo) {
        let db = self.db.clone();
        let git = self.git.clone();
        let container = self.container.clone();
        let active_workspaces = self.active_workspaces.clone();

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
                "Tick workspace {} (trigger '{}') completed, attempting auto-merge",
                workspace_id, trigger_id
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

            // Remove from active workspaces
            let mut active = active_workspaces.write().await;
            if active.get(&trigger_id) == Some(&workspace_id) {
                active.remove(&trigger_id);
            }
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
