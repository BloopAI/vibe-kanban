use std::{
    fs::File,
    io::{BufRead, BufReader, BufWriter, Write},
    path::{Path, PathBuf},
};

use chrono::{Local, Utc};
use regex::Regex;
use serde_json::{Map, Value};

/// Default values required by the latest Codex rollout metadata format.
const DEFAULT_CWD: &str = ".";
const DEFAULT_ORIGINATOR: &str = "codex_cli_rs";
const DEFAULT_CLI_VERSION: &str = "0.0.0-migrated";
const DEFAULT_SOURCE: &str = "cli";
const META_TIMESTAMP_FORMAT: &str = "%Y-%m-%dT%H:%M:%S%.3fZ";
const FILENAME_TIMESTAMP_FORMAT: &str = "%Y-%m-%dT%H-%M-%S";

/// Handles session management for Codex
pub struct SessionHandler;

impl SessionHandler {
    pub fn extract_session_id_from_rollout_path(rollout_path: PathBuf) -> Result<String, String> {
        // Extracts the session UUID from the end of the rollout file path.
        // Pattern: rollout-{timestamp}-{uuid}.jsonl
        let filename = rollout_path
            .file_name()
            .and_then(|f| f.to_str())
            .ok_or_else(|| "Invalid rollout path".to_string())?;

        // Match UUID before .jsonl extension
        let re = Regex::new(
            r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.jsonl$",
        )
        .map_err(|e| format!("Regex error: {e}"))?;

        re.captures(filename)
            .and_then(|caps| caps.get(1))
            .map(|uuid| uuid.as_str().to_string())
            .ok_or_else(|| format!("Could not extract session id from filename: {filename}"))
    }

    /// Find codex rollout file path for given session_id. Used during follow-up execution.
    pub fn find_rollout_file_path(session_id: &str) -> Result<PathBuf, String> {
        let sessions_dir = Self::sessions_root()?;
        Self::scan_directory(&sessions_dir, session_id)
    }

    /// Fork a Codex rollout file by copying it to a temp location and assigning a new session id.
    /// Returns (new_rollout_path, new_session_id).
    ///
    /// Migration behavior:
    /// - Header is normalized to the latest format expected by Codex (adds missing fields such as
    ///   `source` and updates timestamps/session ids).
    /// - Subsequent lines:
    ///   - If already new RolloutLine, pass through unchanged.
    ///   - If object contains "record_type", skip it (ignored in old impl).
    ///   - Otherwise, wrap as RolloutLine of type "response_item" with payload = original JSON.
    pub fn fork_rollout_file(session_id: &str) -> Result<(PathBuf, String), String> {
        let original = Self::find_rollout_file_path(session_id)?;
        let file = File::open(&original)
            .map_err(|e| format!("Failed to open rollout file {}: {e}", original.display()))?;
        let mut reader = BufReader::new(file);

        let mut first_line = String::new();
        reader
            .read_line(&mut first_line)
            .map_err(|e| format!("Failed to read first line from {}: {e}", original.display()))?;
        let trimmed_header = first_line.trim();
        if trimmed_header.is_empty() {
            return Err(format!(
                "Rollout file {} missing header line",
                original.display()
            ));
        }

        let mut meta: Value = serde_json::from_str(trimmed_header).map_err(|e| {
            format!(
                "Failed to parse first line JSON in {}: {e}",
                original.display()
            )
        })?;

        let new_session_id = uuid::Uuid::new_v4().to_string();
        let new_timestamp = Utc::now().format(META_TIMESTAMP_FORMAT).to_string();
        Self::set_session_id_in_rollout_meta_with_timestamp(
            &mut meta,
            &new_session_id,
            &new_timestamp,
        )?;

        let destination = Self::create_new_rollout_path(&new_session_id)?;
        let dest_file = File::create(&destination).map_err(|e| {
            format!(
                "Failed to create forked rollout {}: {e}",
                destination.display()
            )
        })?;
        let mut writer = BufWriter::new(dest_file);

        let meta_line = serde_json::to_string(&meta)
            .map_err(|e| format!("Failed to serialize modified meta: {e}"))?;
        writeln!(writer, "{meta_line}")
            .map_err(|e| format!("Failed to write meta to {}: {e}", destination.display()))?;

        for line in reader.lines() {
            let line =
                line.map_err(|e| format!("I/O error reading {}: {e}", original.display()))?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let value: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(_) => {
                    // Skip invalid JSON lines during migration
                    continue;
                }
            };

            if Self::is_rollout_line(&value) {
                let serialized = serde_json::to_string(&value)
                    .map_err(|e| format!("Failed to serialize rollout line: {e}"))?;
                writeln!(writer, "{serialized}")
                    .map_err(|e| format!("Failed to write to {}: {e}", destination.display()))?;
                continue;
            }

            if value.get("record_type").is_some() {
                continue;
            }

            let envelope = serde_json::json!({
                "timestamp": Utc::now().format(META_TIMESTAMP_FORMAT).to_string(),
                "type": "response_item",
                "payload": value,
            });
            let serialized = serde_json::to_string(&envelope)
                .map_err(|e| format!("Failed to serialize migrated line: {e}"))?;
            writeln!(writer, "{serialized}")
                .map_err(|e| format!("Failed to write to {}: {e}", destination.display()))?;
        }

        writer
            .flush()
            .map_err(|e| format!("Failed to flush {}: {e}", destination.display()))?;

        Ok((destination, new_session_id))
    }

    pub(crate) fn set_session_id_in_rollout_meta_with_timestamp(
        meta: &mut Value,
        new_id: &str,
        new_timestamp: &str,
    ) -> Result<(), String> {
        let Value::Object(map) = meta else {
            return Err("First line of rollout file is not a JSON object".to_string());
        };

        map.insert(
            "timestamp".to_string(),
            Value::String(new_timestamp.to_string()),
        );
        map.insert(
            "type".to_string(),
            Value::String("session_meta".to_string()),
        );

        let Some(Value::Object(payload)) = map.get_mut("payload") else {
            return Err("Rollout meta payload missing or not an object".to_string());
        };

        payload.insert("id".to_string(), Value::String(new_id.to_string()));
        payload.insert(
            "timestamp".to_string(),
            Value::String(new_timestamp.to_string()),
        );

        Self::ensure_required_payload_fields(payload);
        Ok(())
    }

    fn ensure_required_payload_fields(payload: &mut Map<String, Value>) {
        Self::ensure_string_field(payload, "cwd", DEFAULT_CWD);
        Self::ensure_string_field(payload, "originator", DEFAULT_ORIGINATOR);
        Self::ensure_string_field(payload, "cli_version", DEFAULT_CLI_VERSION);
        Self::ensure_string_field(payload, "source", DEFAULT_SOURCE);
    }

    fn ensure_string_field(payload: &mut Map<String, Value>, key: &str, default: &str) {
        let needs_default = match payload.get(key) {
            Some(Value::String(existing)) => existing.trim().is_empty(),
            Some(_) => true,
            None => true,
        };

        if needs_default {
            payload.insert(key.to_string(), Value::String(default.to_string()));
        }
    }

    fn is_rollout_line(value: &Value) -> bool {
        value.get("timestamp").is_some()
            && value.get("type").is_some()
            && value.get("payload").is_some()
    }

    fn sessions_root() -> Result<PathBuf, String> {
        let home_dir = dirs::home_dir().ok_or("Could not determine home directory")?;
        Ok(home_dir.join(".codex").join("sessions"))
    }

    fn scan_directory(dir: &Path, session_id: &str) -> Result<PathBuf, String> {
        if !dir.exists() {
            return Err(format!(
                "Sessions directory does not exist: {}",
                dir.display()
            ));
        }

        let entries = std::fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
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

        Err(format!(
            "Could not find rollout file for session_id: {session_id}"
        ))
    }

    fn create_new_rollout_path(new_session_id: &str) -> Result<PathBuf, String> {
        let sessions_root = Self::sessions_root()?;
        let now_local = Local::now();

        let dir = sessions_root
            .join(now_local.format("%Y").to_string())
            .join(now_local.format("%m").to_string())
            .join(now_local.format("%d").to_string());

        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create sessions directory {}: {e}", dir.display()))?;

        let filename = Self::rollout_filename_from_time(new_session_id, &now_local);
        Ok(dir.join(filename))
    }

    fn rollout_filename_from_time(new_id: &str, now_local: &chrono::DateTime<Local>) -> String {
        let ts = now_local.format(FILENAME_TIMESTAMP_FORMAT).to_string();
        format!("rollout-{ts}-{new_id}.jsonl")
    }
}
