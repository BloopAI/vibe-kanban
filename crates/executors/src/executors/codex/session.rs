use std::path::{Path, PathBuf};

use regex::Regex;
use thiserror::Error;

use super::codex_home;

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

    fn sessions_root() -> Result<PathBuf, SessionError> {
        let codex_dir = codex_home().ok_or_else(|| {
            SessionError::Io("Could not determine Codex home directory".to_string())
        })?;
        Ok(codex_dir.join("sessions"))
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
}
