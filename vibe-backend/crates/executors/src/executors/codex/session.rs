use std::{
    fs::File,
    io::{BufRead, BufReader, BufWriter, Write},
    path::{Path, PathBuf},
};

use chrono::Local;
use codex_protocol::protocol::SessionSource;
use regex::Regex;
use serde_json::{Map, Value};
use thiserror::Error;

const FILENAME_TIMESTAMP_FORMAT: &str = "%Y-%m-%dT%H-%M-%S";

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("Session history format error: {0}")]
    Format(String),

    #[error("Session I/O error: {0}")]
    Io(String),

    #[error("Session not found: {0}")]
    NotFound(String),
}

/// Handles session management for Codex
pub struct SessionHandler;

impl SessionHandler {
    pub fn extract_session_id_from_rollout_path(
        rollout_path: PathBuf,
    ) -> Result<String, SessionError> {
        // Extracts the session UUID from the end of the rollout file path.
        // Pattern: rollout-{timestamp}-{uuid}.jsonl
        let filename = rollout_path
            .file_name()
            .and_then(|f| f.to_str())
            .ok_or_else(|| SessionError::Format("Invalid rollout path".to_string()))?;

        // Match UUID before .jsonl extension
        let re = Regex::new(
            r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.jsonl$",
        )
        .map_err(|e| SessionError::Format(format!("Regex error: {e}")))?;

        re.captures(filename)
            .and_then(|caps| caps.get(1))
            .map(|uuid| uuid.as_str().to_string())
            .ok_or_else(|| {
                SessionError::Format(format!(
                    "Could not extract session id from filename: {filename}"
                ))
            })
    }

    /// Find codex rollout file path for given session_id. Used during follow-up execution.
    pub fn find_rollout_file_path(session_id: &str) -> Result<PathBuf, SessionError> {
        let sessions_dir = Self::sessions_root()?;
        Self::scan_directory(&sessions_dir, session_id)
    }

    /// Fork a Codex rollout file by copying it to a temp location and assigning a new session id.
    /// Returns (new_rollout_path, new_session_id).
    pub fn fork_rollout_file(session_id: &str) -> Result<(PathBuf, String), SessionError> {
        let original = Self::find_rollout_file_path(session_id)?;
        tracing::debug!("Forking rollout file: {}", original.display());
        let file = File::open(&original).map_err(|e| {
            SessionError::Io(format!(
                "Failed to open rollout file {}: {e}",
                original.display()
            ))
        })?;
        let mut reader = BufReader::new(file);

        let mut first_line = String::new();
        reader.read_line(&mut first_line).map_err(|e| {
            SessionError::Io(format!(
                "Failed to read first line from {}: {e}",
                original.display()
            ))
        })?;
        let trimmed_header = first_line.trim();
        if trimmed_header.is_empty() {
            return Err(SessionError::Format(format!(
                "Rollout file {} missing header line",
                original.display()
            )));
        }

        let mut meta: Value = serde_json::from_str(trimmed_header).map_err(|e| {
            SessionError::Format(format!(
                "Failed to parse first line JSON in {}: {e}",
                original.display()
            ))
        })?;

        let new_session_id = uuid::Uuid::new_v4().to_string();

        let destination = Self::create_new_rollout_path(&new_session_id)?;
        let dest_file = File::create(&destination).map_err(|e| {
            SessionError::Io(format!(
                "Failed to create forked rollout {}: {e}",
                destination.display()
            ))
        })?;
        let mut writer = BufWriter::new(dest_file);

        Self::replace_session_id(&mut meta, &new_session_id)?;
        let meta_line = serde_json::to_string(&meta)
            .map_err(|e| SessionError::Format(format!("Failed to serialize modified meta: {e}")))?;
        writeln!(writer, "{meta_line}").map_err(|e| {
            SessionError::Io(format!(
                "Failed to write meta to {}: {e}",
                destination.display()
            ))
        })?;

        // write all remaining lines as-is
        for line in reader.lines() {
            let line = line.map_err(|e| {
                SessionError::Io(format!(
                    "Failed to read line from {}: {e}",
                    original.display()
                ))
            })?;
            writeln!(writer, "{line}").map_err(|e| {
                SessionError::Io(format!(
                    "Failed to write line to {}: {e}",
                    destination.display()
                ))
            })?;
        }

        writer.flush().map_err(|e| {
            SessionError::Io(format!("Failed to flush {}: {e}", destination.display()))
        })?;

        Ok((destination, new_session_id))
    }

    pub(crate) fn replace_session_id(
        session_meta: &mut Value,
        new_id: &str,
    ) -> Result<(), SessionError> {
        let Value::Object(map) = session_meta else {
            return Err(SessionError::Format(
                "First line of rollout file is not a JSON object".to_string(),
            ));
        };

        let Some(Value::Object(payload)) = map.get_mut("payload") else {
            return Err(SessionError::Format(
                "Rollout meta payload missing or not an object".to_string(),
            ));
        };

        payload.insert("id".to_string(), Value::String(new_id.to_string()));

        Self::ensure_required_payload_fields(payload);
        Ok(())
    }

    fn ensure_required_payload_fields(payload: &mut Map<String, Value>) {
        if !payload.contains_key("source") {
            let Ok(value) = serde_json::to_value(SessionSource::default()) else {
                tracing::error!("Failed to serialize default SessionSource");
                return;
            };
            payload.insert("source".to_string(), value);
        }
    }

    fn sessions_root() -> Result<PathBuf, SessionError> {
        let home_dir = dirs::home_dir()
            .ok_or_else(|| SessionError::Io("Could not determine home directory".to_string()))?;
        Ok(home_dir.join(".codex").join("sessions"))
    }

    fn scan_directory(dir: &Path, session_id: &str) -> Result<PathBuf, SessionError> {
        if !dir.exists() {
            return Err(SessionError::Io(format!(
                "Sessions directory does not exist: {}",
                dir.display()
            )));
        }

        let entries = std::fs::read_dir(dir).map_err(|e| {
            SessionError::Io(format!("Failed to read directory {}: {e}", dir.display()))
        })?;

        for entry in entries {
            let entry = entry
                .map_err(|e| SessionError::Io(format!("Failed to read directory entry: {e}")))?;
            let path = entry.path();

            if path.is_dir() {
                if let Ok(found) = Self::scan_directory(&path, session_id) {
                    return Ok(found);
                }
            } else if path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|filename| {
                        filename.contains(session_id)
                            && filename.starts_with("rollout-")
                            && filename.ends_with(".jsonl")
                    })
            {
                return Ok(path);
            }
        }

        Err(SessionError::NotFound(format!(
            "Could not find rollout file for session_id: {session_id}"
        )))
    }

    fn create_new_rollout_path(new_session_id: &str) -> Result<PathBuf, SessionError> {
        let sessions_root = Self::sessions_root()?;
        let now_local = Local::now();

        let dir = sessions_root
            .join(now_local.format("%Y").to_string())
            .join(now_local.format("%m").to_string())
            .join(now_local.format("%d").to_string());

        std::fs::create_dir_all(&dir).map_err(|e| {
            SessionError::Io(format!(
                "Failed to create sessions directory {}: {e}",
                dir.display()
            ))
        })?;

        let filename = Self::rollout_filename_from_time(new_session_id, &now_local);
        Ok(dir.join(filename))
    }

    fn rollout_filename_from_time(new_id: &str, now_local: &chrono::DateTime<Local>) -> String {
        let ts = now_local.format(FILENAME_TIMESTAMP_FORMAT).to_string();
        format!("rollout-{ts}-{new_id}.jsonl")
    }
}
