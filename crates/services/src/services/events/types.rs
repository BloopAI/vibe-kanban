use anyhow::Error as AnyhowError;
use db::models::{
    execution_process::ExecutionProcess, project::Project, scratch::Scratch, task::Task,
    task_attempt::TaskAttempt,
};
use serde::{Deserialize, Serialize};
use sqlx::Error as SqlxError;
use strum_macros::{Display, EnumString};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum EventError {
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    Parse(#[from] serde_json::Error),
    #[error(transparent)]
    Other(#[from] AnyhowError), // Catches any unclassified errors
}

#[derive(EnumString, Display)]
pub enum HookTables {
    #[strum(to_string = "tasks")]
    Tasks,
    #[strum(to_string = "task_attempts")]
    TaskAttempts,
    #[strum(to_string = "execution_processes")]
    ExecutionProcesses,
    #[strum(to_string = "scratch")]
    Scratch,
    #[strum(to_string = "projects")]
    Projects,
}

#[derive(Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "data", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecordTypes {
    Task(Task),
    TaskAttempt(TaskAttempt),
    ExecutionProcess(ExecutionProcess),
    Scratch(Scratch),
    Project(Project),
    DeletedTask {
        rowid: i64,
        project_id: Option<Uuid>,
        task_id: Option<Uuid>,
    },
    DeletedTaskAttempt {
        rowid: i64,
        task_id: Option<Uuid>,
    },
    DeletedExecutionProcess {
        rowid: i64,
        task_attempt_id: Option<Uuid>,
        process_id: Option<Uuid>,
    },
    DeletedScratch {
        rowid: i64,
        scratch_id: Option<Uuid>,
        scratch_type: Option<String>,
    },
    DeletedProject {
        rowid: i64,
        project_id: Option<Uuid>,
    },
}

#[derive(Serialize, Deserialize, TS)]
pub struct EventPatchInner {
    pub(crate) db_op: String,
    pub(crate) record: RecordTypes,
}

#[derive(Serialize, Deserialize, TS)]
pub struct EventPatch {
    pub(crate) op: String,
    pub(crate) path: String,
    pub(crate) value: EventPatchInner,
}
