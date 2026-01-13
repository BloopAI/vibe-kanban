use std::path::{Path, PathBuf};

use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::assets::asset_dir;

pub const EXECUTION_LOGS_DIRNAME: &str = "projects";

pub fn process_logs_root_dir() -> PathBuf {
    asset_dir().join(EXECUTION_LOGS_DIRNAME)
}

fn uuid_dir(id: Uuid) -> String {
    id.to_string()
}

fn uuid_prefix2(id: Uuid) -> String {
    let s = id.to_string();
    s.chars().take(2).collect()
}

pub fn process_logs_project_dir(project_id: Uuid) -> PathBuf {
    process_logs_root_dir().join(uuid_dir(project_id))
}

pub fn process_logs_session_dir(project_id: Uuid, session_id: Uuid) -> PathBuf {
    process_logs_project_dir(project_id)
        .join("sessions")
        .join(uuid_prefix2(session_id))
        .join(uuid_dir(session_id))
}

pub fn process_log_file_path(project_id: Uuid, session_id: Uuid, process_id: Uuid) -> PathBuf {
    process_logs_session_dir(project_id, session_id)
        .join("processes")
        .join(format!("{}.jsonl", uuid_dir(process_id)))
}

pub struct ExecutionLogWriter {
    path: PathBuf,
}

impl ExecutionLogWriter {
    pub async fn new(path: PathBuf) -> std::io::Result<Self> {
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        Ok(Self { path })
    }

    pub async fn new_for_execution(
        project_id: Uuid,
        session_id: Uuid,
        execution_id: Uuid,
    ) -> std::io::Result<Self> {
        Self::new(process_log_file_path(project_id, session_id, execution_id)).await
    }

    pub async fn new_for_process(
        project_id: Uuid,
        session_id: Uuid,
        process_id: Uuid,
    ) -> std::io::Result<Self> {
        Self::new(process_log_file_path(project_id, session_id, process_id)).await
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub async fn append_jsonl_line(&self, jsonl_line: &str) -> std::io::Result<()> {
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .await?;

        file.write_all(jsonl_line.as_bytes()).await?;
        Ok(())
    }
}

pub async fn read_execution_log_file(path: &Path) -> std::io::Result<String> {
    tokio::fs::read_to_string(path).await
}
