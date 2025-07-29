use std::{collections::HashMap, path::PathBuf, sync::Arc, time::Duration};

use anyhow::anyhow;
use async_trait::async_trait;
use command_group::AsyncGroupChild;
use db::{
    DBService,
    models::{
        execution_process::{
            CreateExecutionProcess, ExecutionProcess, ExecutionProcessStatus, ExecutionProcessType,
        },
        task_attempt::TaskAttempt,
    },
};
use executors::{
    actions::{ExecutorAction, ExecutorActions, script::ScriptContext},
    logs::{LogNormalizer, LogNormalizers},
};
use futures::{TryStreamExt, stream::select};
use services::services::{
    container::{ContainerError, ContainerRef, ContainerService},
    git::GitService,
};
use tokio::{sync::RwLock, task::JoinHandle};
use tokio_util::io::ReaderStream;
use utils::{
    log_msg::LogMsg,
    msg_store::MsgStore,
    text::{git_branch_id, short_uuid},
};
use uuid::Uuid;

#[derive(Clone)]
pub struct LocalContainerService {
    db: DBService,
    git: GitService,
    child_store: Arc<RwLock<HashMap<Uuid, Arc<RwLock<AsyncGroupChild>>>>>,
    msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
}

impl LocalContainerService {
    pub fn new(
        db: DBService,
        git: GitService,
        msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
    ) -> Self {
        let child_store = Arc::new(RwLock::new(HashMap::new()));

        LocalContainerService {
            db,
            git,
            child_store,
            msg_stores,
        }
    }

    pub async fn add_child_to_store(&self, id: Uuid, exec: AsyncGroupChild) {
        let mut map = self.child_store.write().await;
        map.insert(id, Arc::new(RwLock::new(exec)));
    }

    pub async fn remove_child_from_store(&self, id: &Uuid) {
        let mut map = self.child_store.write().await;
        map.remove(id);
    }

    /// Spawn a background task that polls the child process for completion and
    /// cleans up the execution entry when it exits.
    pub fn spawn_exit_monitor(&self, exec_id: &Uuid) -> JoinHandle<()> {
        let exec_id = exec_id.clone();
        let child_store = self.child_store.clone();
        let msg_stores = self.msg_stores.clone();
        let db = self.db.clone();

        tokio::spawn(async move {
            loop {
                let status_opt = {
                    let child_lock = {
                        let map = child_store.read().await;
                        map.get(&exec_id)
                            .cloned()
                            .expect(&format!("Child handle missing for {}", exec_id))
                    };

                    let mut child_handler = child_lock.write().await;
                    match child_handler.try_wait() {
                        Ok(Some(status)) => Some(Ok(status)),
                        Ok(None) => None,
                        Err(e) => Some(Err(e)),
                    }
                };

                // Update execution process and cleanup if exit
                if let Some(status_result) = status_opt {
                    // Update execution process record with completion info
                    let (exit_code, status) = match status_result {
                        Ok(exit_status) => {
                            let code = exit_status.code().unwrap_or(-1) as i64;
                            let status = if exit_status.success() {
                                ExecutionProcessStatus::Completed
                            } else {
                                ExecutionProcessStatus::Failed
                            };
                            (Some(code), status)
                        }
                        Err(_) => (None, ExecutionProcessStatus::Failed),
                    };

                    if let Err(e) =
                        ExecutionProcess::update_completion(&db.pool, exec_id, status, exit_code)
                            .await
                    {
                        tracing::error!("Failed to update execution process completion: {}", e);
                    }
                    // Cleanup msg store
                    if let Some(msg_arc) = msg_stores.write().await.remove(&exec_id) {
                        msg_arc.push_finished();
                        tokio::time::sleep(Duration::from_millis(50)).await; // Wait for the finish message to propogate
                        match Arc::try_unwrap(msg_arc) {
                            Ok(inner) => drop(inner),
                            Err(arc) => tracing::error!(
                                "There are still {} strong Arcs to MsgStore for {}",
                                Arc::strong_count(&arc),
                                exec_id
                            ),
                        }
                    }

                    // Cleanup child handle
                    child_store.write().await.remove(&exec_id);

                    break;
                }

                // still running, sleep and try again
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        })
    }

    pub fn dir_name_from_task_attempt(attempt_id: &Uuid, task_title: &str) -> String {
        let task_title_id = git_branch_id(task_title);
        format!("vk-{}-{}", short_uuid(attempt_id), task_title_id)
    }

    /// Get the base directory for vibe-kanban worktrees
    pub fn get_worktree_base_dir() -> std::path::PathBuf {
        let dir_name = if cfg!(debug_assertions) {
            "vibe-kanban-dev"
        } else {
            "vibe-kanban"
        };

        if cfg!(target_os = "macos") {
            // macOS already uses /var/folders/... which is persistent storage
            std::env::temp_dir().join(dir_name)
        } else if cfg!(target_os = "linux") {
            // Linux: use /var/tmp instead of /tmp to avoid RAM usage
            std::path::PathBuf::from("/var/tmp").join(dir_name)
        } else {
            // Windows and other platforms: use temp dir with vibe-kanban subdirectory
            std::env::temp_dir().join(dir_name)
        }
    }

    pub fn create_execution_process_from_action(
        task_attempt: &TaskAttempt,
        executor_action: &ExecutorActions,
    ) -> CreateExecutionProcess {
        match executor_action {
            ExecutorActions::StandardCodingAgentRequest(standard_coding_agent_request) => {
                CreateExecutionProcess {
                    task_attempt_id: task_attempt.id,
                    process_type: ExecutionProcessType::CodingAgent,
                    // executor_type: Some(standard_coding_agent_request.executor.to_string()),
                    executor_type: None,
                }
            }
            ExecutorActions::StandardFollowUpCodingAgentRequest(
                standard_follow_up_coding_agent_request,
            ) => CreateExecutionProcess {
                task_attempt_id: task_attempt.id,
                process_type: ExecutionProcessType::CodingAgent,
                // executor_type: Some(standard_follow_up_coding_agent_request.executor.to_string()),
                executor_type: None,
            },
            ExecutorActions::ScriptRequest(script_request) => CreateExecutionProcess {
                task_attempt_id: task_attempt.id,
                process_type: match script_request.context {
                    ScriptContext::SetupScript => ExecutionProcessType::SetupScript,
                    ScriptContext::CleanupScript => ExecutionProcessType::CleanupScript,
                    ScriptContext::DevServer => ExecutionProcessType::DevServer,
                },
                executor_type: None,
            },
        }
    }

    async fn track_child_msgs_in_store(
        &self,
        id: Uuid,
        child: &mut AsyncGroupChild,
        normalizer: Option<LogNormalizers>,
        current_dir: &PathBuf,
    ) {
        let store = Arc::new(MsgStore::new());

        let out = child.inner().stdout.take().expect("no stdout");
        let err = child.inner().stderr.take().expect("no stderr");

        // Map stdout bytes -> LogMsg::Stdout
        let out = ReaderStream::new(out)
            .map_ok(|chunk| LogMsg::Stdout(String::from_utf8_lossy(&chunk).into_owned()));

        // Map stderr bytes -> LogMsg::Stderr
        let err = ReaderStream::new(err)
            .map_ok(|chunk| LogMsg::Stderr(String::from_utf8_lossy(&chunk).into_owned()));

        // If you have a JSON Patch source, map it to LogMsg::JsonPatch too, then select all three.

        // Merge and forward into the store
        let merged = select(out, err); // Stream<Item = Result<LogMsg, io::Error>>
        store.clone().spawn_forwarder(merged);

        // Testing normalizer stream
        if let Some(normalizer) = normalizer {
            normalizer.normalize_logs(store.clone(), current_dir);
        }

        // Start MsgStore -> DB sync
        self.spawn_stream_raw_logs_to_db(&id);

        let mut map = self.msg_stores().write().await;
        map.insert(id, store);
    }
}

#[async_trait]
impl ContainerService for LocalContainerService {
    fn msg_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>> {
        &self.msg_stores
    }

    fn db(&self) -> &DBService {
        &self.db
    }

    /// Create a container
    async fn create(&self, task_attempt: &TaskAttempt) -> Result<ContainerRef, ContainerError> {
        let task = task_attempt
            .parent_task(&self.db.pool)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let task_branch_name =
            LocalContainerService::dir_name_from_task_attempt(&task_attempt.id, &task.title);
        let worktree_path = LocalContainerService::get_worktree_base_dir().join(&task_branch_name);

        let project = task
            .parent_project(&self.db.pool)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let _ = &self.git.create_worktree(
            &project.git_repo_path,
            &task_branch_name,
            &worktree_path,
            Some(&task_attempt.base_branch),
        )?;

        TaskAttempt::update_container_ref(
            &self.db.pool,
            task_attempt.id,
            &worktree_path.to_string_lossy(),
        )
        .await?;

        Ok(worktree_path.to_string_lossy().to_string())
    }

    async fn start_execution(
        &self,
        task_attempt: &TaskAttempt,
        executor_action: &ExecutorActions,
    ) -> Result<ExecutionProcess, ContainerError> {
        // Create new execution process record
        let create_execution_process =
            Self::create_execution_process_from_action(&task_attempt, &executor_action);
        let execution_process =
            ExecutionProcess::create(&self.db.pool, &create_execution_process, Uuid::new_v4())
                .await?;

        // Get the worktree path
        let container_ref = task_attempt
            .container_ref
            .as_ref()
            .ok_or(ContainerError::Other(anyhow!(
                "Container ref not found for task attempt"
            )))?;
        let current_dir = PathBuf::from(container_ref);

        // Create the child and stream, add to execution tracker
        let mut child = executor_action.spawn(&current_dir).await?;
        let normalizer = match executor_action {
            ExecutorActions::StandardCodingAgentRequest(request) => {
                Some(request.executor.to_normalizer())
            }
            ExecutorActions::StandardFollowUpCodingAgentRequest(request) => {
                Some(request.executor.to_normalizer())
            }
            ExecutorActions::ScriptRequest(_) => {
                // Scripts don't need normalizers since they output raw text
                None
            }
        };
        self.track_child_msgs_in_store(execution_process.id, &mut child, normalizer, &current_dir)
            .await;

        self.add_child_to_store(execution_process.id, child).await;

        // Spawn exit monitor
        let _hn = self.spawn_exit_monitor(&execution_process.id);

        Ok(execution_process)
    }
}
