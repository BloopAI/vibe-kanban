use std::{path::PathBuf, sync::Arc};

use futures::StreamExt;
use regex::Regex;
use utils::msg_store::MsgStore;

/// Handles session management for Codex
pub struct SessionHandler;

impl SessionHandler {
    /// Start monitoring stderr lines for session ID extraction
    pub fn start_session_id_extraction(msg_store: Arc<MsgStore>) {
        tokio::spawn(async move {
            let mut stderr_lines_stream = msg_store.stderr_lines_stream();

            while let Some(Ok(line)) = stderr_lines_stream.next().await {
                if let Some(session_id) = Self::extract_session_id_from_line(&line) {
                    msg_store.push_session_id(session_id);
                }
            }
        });
    }

    /// Extract session ID from codex stderr output. Supports:
    /// - Old:  session_id: <uuid>
    /// - New:  session_id: ConversationId(<uuid>)
    pub fn extract_session_id_from_line(line: &str) -> Option<String> {
        static SESSION_ID_REGEX: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
        let regex = SESSION_ID_REGEX.get_or_init(|| {
            Regex::new(r"session_id:\s*(?:ConversationId\()?(?P<id>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)?").unwrap()
        });

        regex
            .captures(line)
            .and_then(|cap| cap.name("id"))
            .map(|m| m.as_str().to_string())
    }

    /// Find codex rollout file path for given session_id. Used during follow-up execution.
    pub fn find_rollout_file_path(session_id: &str) -> Result<PathBuf, String> {
        let home_dir = dirs::home_dir().ok_or("Could not determine home directory")?;
        let sessions_dir = home_dir.join(".codex").join("sessions");

        // Scan the sessions directory recursively for rollout files matching the session_id
        // Pattern: rollout-{YYYY}-{MM}-{DD}T{HH}-{mm}-{ss}-{session_id}.jsonl
        Self::scan_directory(&sessions_dir, session_id)
    }

    // Recursively scan directory for rollout files matching the session_id
    fn scan_directory(dir: &PathBuf, session_id: &str) -> Result<PathBuf, String> {
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
                // Recursively search subdirectories
                if let Ok(found) = Self::scan_directory(&path, session_id) {
                    return Ok(found);
                }
            } else if path.is_file()
                && let Some(filename) = path.file_name()
                && let Some(filename_str) = filename.to_str()
                && filename_str.contains(session_id)
                && filename_str.starts_with("rollout-")
                && filename_str.ends_with(".jsonl")
            {
                return Ok(path);
            }
        }

        Err(format!(
            "Could not find rollout file for session_id: {session_id}"
        ))
    }

    /// Fork a Codex rollout file by copying it to a temp location and assigning a new session id.
    /// Returns (new_rollout_path, new_session_id).
    ///
    /// Migration behavior:
    /// - If the original header is old format, it is converted to new format on write.
    /// - Subsequent lines:
    ///   - If already new RolloutLine, pass through unchanged.
    ///   - If object contains "record_type", skip it (ignored in old impl).
    ///   - Otherwise, wrap as RolloutLine of type "response_item" with payload = original JSON.
    pub fn fork_rollout_file(session_id: &str) -> Result<(PathBuf, String), String> {
        use std::io::{BufRead, BufReader, Write};

        let original = Self::find_rollout_file_path(session_id)?;

        let file = std::fs::File::open(&original)
            .map_err(|e| format!("Failed to open rollout file {}: {e}", original.display()))?;
        let mut reader = BufReader::new(file);

        let mut first_line = String::new();
        reader
            .read_line(&mut first_line)
            .map_err(|e| format!("Failed to read first line from {}: {e}", original.display()))?;

        let mut meta: serde_json::Value = serde_json::from_str(first_line.trim()).map_err(|e| {
            format!(
                "Failed to parse first line JSON in {}: {e}",
                original.display()
            )
        })?;

        // Generate new UUID for forked session
        let new_id = uuid::Uuid::new_v4().to_string();
        Self::set_session_id_in_rollout_meta(&mut meta, &new_id)?;

        // Prepare destination path in the same directory, following Codex rollout naming convention.
        // Always create a fresh filename: rollout-<YYYY>-<MM>-<DD>T<HH>-<mm>-<ss>-<session_id>.jsonl
        let parent_dir = original
            .parent()
            .ok_or_else(|| format!("Unexpected path with no parent: {}", original.display()))?;
        let new_filename = Self::new_rollout_filename(&new_id);
        let dest = parent_dir.join(new_filename);

        // Write new file with modified first line and copy the rest with migration as needed
        let mut writer = std::fs::File::create(&dest)
            .map_err(|e| format!("Failed to create forked rollout {}: {e}", dest.display()))?;
        let meta_line = serde_json::to_string(&meta)
            .map_err(|e| format!("Failed to serialize modified meta: {e}"))?;
        writeln!(writer, "{meta_line}")
            .map_err(|e| format!("Failed to write meta to {}: {e}", dest.display()))?;

        // Wrap subsequent lines
        for line in reader.lines() {
            let line =
                line.map_err(|e| format!("I/O error reading {}: {e}", original.display()))?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Try parse as JSON
            let parsed: Result<serde_json::Value, _> = serde_json::from_str(trimmed);
            let value = match parsed {
                Ok(v) => v,
                Err(_) => {
                    // Skip invalid JSON lines during migration
                    continue;
                }
            };

            // If already a RolloutLine (has timestamp + type/payload or flattened item), pass through
            let is_rollout_line = value.get("timestamp").is_some()
                && (value.get("type").is_some() || value.get("payload").is_some());
            if is_rollout_line {
                writeln!(writer, "{value}")
                    .map_err(|e| format!("Failed to write to {}: {e}", dest.display()))?;
                continue;
            }

            // Ignore legacy bookkeeping lines like {"record_type": ...}
            if value.get("record_type").is_some() {
                continue;
            }

            // Otherwise, wrap as a new RolloutLine containing a ResponseItem payload
            let timestamp = chrono::Utc::now()
                .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                .to_string();
            let envelope = serde_json::json!({
                "timestamp": timestamp,
                "type": "response_item",
                "payload": value,
            });
            writeln!(writer, "{envelope}")
                .map_err(|e| format!("Failed to write to {}: {e}", dest.display()))?;
        }

        Ok((dest, new_id))
    }

    // Update session id inside the first-line JSON meta, supporting both old and new formats.
    // - Old format: top-level { "id": "<uuid>", ... } -> convert to new format
    // - New format: { "type": "session_meta", "payload": { "id": "<uuid>", ... }, ... }
    // If both are somehow present, new format takes precedence.
    pub(crate) fn set_session_id_in_rollout_meta(
        meta: &mut serde_json::Value,
        new_id: &str,
    ) -> Result<(), String> {
        match meta {
            serde_json::Value::Object(map) => {
                // If already new format, update payload.id and return
                if let Some(serde_json::Value::Object(payload)) = map.get_mut("payload") {
                    payload.insert(
                        "id".to_string(),
                        serde_json::Value::String(new_id.to_string()),
                    );
                    return Ok(());
                }

                // Convert old format to new format header
                let top_timestamp = map.get("timestamp").cloned();
                let instructions = map.get("instructions").cloned();
                let git = map.get("git").cloned();

                let mut new_top = serde_json::Map::new();
                if let Some(ts) = top_timestamp.clone() {
                    new_top.insert("timestamp".to_string(), ts);
                }
                new_top.insert(
                    "type".to_string(),
                    serde_json::Value::String("session_meta".to_string()),
                );

                let mut payload = serde_json::Map::new();
                payload.insert(
                    "id".to_string(),
                    serde_json::Value::String(new_id.to_string()),
                );
                if let Some(ts) = top_timestamp {
                    payload.insert("timestamp".to_string(), ts);
                }
                if let Some(instr) = instructions {
                    payload.insert("instructions".to_string(), instr);
                }
                if let Some(git_val) = git {
                    payload.insert("git".to_string(), git_val);
                }
                // Required fields in new format: cwd, originator, cli_version
                if !payload.contains_key("cwd") {
                    payload.insert(
                        "cwd".to_string(),
                        serde_json::Value::String(".".to_string()),
                    );
                }
                if !payload.contains_key("originator") {
                    payload.insert(
                        "originator".to_string(),
                        serde_json::Value::String("vibe_kanban_migrated".to_string()),
                    );
                }
                if !payload.contains_key("cli_version") {
                    payload.insert(
                        "cli_version".to_string(),
                        serde_json::Value::String("0.0.0-migrated".to_string()),
                    );
                }

                new_top.insert("payload".to_string(), serde_json::Value::Object(payload));

                *map = new_top; // replace the old map with the new-format one
                Ok(())
            }
            _ => Err("First line of rollout file is not a JSON object".to_string()),
        }
    }

    // Build a new rollout filename, ignoring any original name.
    // Always returns: rollout-<timestamp>-<id>.jsonl
    fn new_rollout_filename(new_id: &str) -> String {
        let now_ts = chrono::Local::now().format("%Y-%m-%dT%H-%M-%S").to_string();
        format!("rollout-{now_ts}-{new_id}.jsonl")
    }
}

#[cfg(test)]
mod tests {
    use super::SessionHandler;

    #[test]
    fn test_new_rollout_filename_pattern() {
        let id = "ID-123";
        let out = SessionHandler::new_rollout_filename(id);
        // rollout-YYYY-MM-DDTHH-MM-SS-ID-123.jsonl
        let re = regex::Regex::new(r"^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-ID-123\.jsonl$")
            .unwrap();
        assert!(re.is_match(&out), "Unexpected filename: {out}");
    }
}
