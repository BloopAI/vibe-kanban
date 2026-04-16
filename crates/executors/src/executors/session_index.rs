use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Represents a single entry in Claude Code's sessions-index.json file.
/// Each entry corresponds to one coding session and tracks metadata
/// about the session for resumption purposes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionIndexEntry {
    /// Unique identifier for the session
    #[serde(rename = "sessionId")]
    pub session_id: String,

    /// Full filesystem path to the session .jsonl file
    #[serde(rename = "fullPath")]
    pub full_path: String,

    /// File modification time (Unix timestamp in milliseconds)
    #[serde(rename = "fileMtime")]
    pub file_mtime: u64,

    /// The first prompt/message that started the session
    #[serde(rename = "firstPrompt")]
    pub first_prompt: String,

    /// Total number of messages in the session
    #[serde(rename = "messageCount")]
    pub message_count: u32,

    /// ISO 8601 timestamp when the session was created
    pub created: String,

    /// ISO 8601 timestamp when the session was last modified
    pub modified: String,

    /// Git branch name if available
    #[serde(rename = "gitBranch")]
    pub git_branch: Option<String>,

    /// Project root path
    #[serde(rename = "projectPath")]
    pub project_path: String,

    /// Whether this is a sidechain session (forked from another session)
    #[serde(rename = "isSidechain")]
    pub is_sidechain: bool,
}

/// Represents the complete sessions-index.json file structure.
/// This file is maintained by Claude Code to track all active sessions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionIndex {
    /// Version of the index format (currently 1)
    pub version: u32,

    /// List of all session entries
    pub entries: Vec<SessionIndexEntry>,
}

/// Represents a single line entry from a Claude Code session .jsonl file.
/// Used for extracting metadata when rebuilding the session index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLogEntry {
    /// Session ID from the log entry
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,

    /// Timestamp when this entry was created
    pub created: Option<String>,

    /// Git branch if recorded in the entry
    #[serde(rename = "gitBranch")]
    pub git_branch: Option<String>,

    /// Message content (for extracting first prompt)
    pub message: Option<String>,

    /// Role of the message sender (user, assistant, etc.)
    pub role: Option<String>,

    /// Whether this entry belongs to a sidechain (forked) session
    #[serde(rename = "isSidechain")]
    pub is_sidechain: Option<bool>,

    /// Catch-all for other fields we don't need
    #[serde(flatten)]
    pub other: serde_json::Value,
}

/// Converts a worktree path to the corresponding Claude Code project directory.
///
/// Claude Code stores project metadata in ~/.claude/projects/<escaped-path>,
/// where the path is escaped by replacing '/' with '-' and removing leading '-'.
///
/// # Arguments
/// * `worktree_path` - The absolute path to the worktree directory
///
/// # Returns
/// The path to the Claude Code project directory
///
/// # Example
/// ```ignore
/// let worktree = Path::new("/var/tmp/vkswarm/my-project");
/// let project_dir = get_claude_project_dir(worktree);
/// // Result: ~/.claude/projects/var-tmp-vkswarm-my-project
/// ```
#[allow(dead_code)]
fn get_claude_project_dir(worktree_path: &Path) -> PathBuf {
    let home = dirs::home_dir().expect("home directory");
    get_claude_project_dir_with_home(worktree_path, home)
}

fn get_claude_project_dir_with_home(worktree_path: &Path, home: PathBuf) -> PathBuf {
    let escaped = worktree_path
        .to_string_lossy()
        .replace('/', "-")
        .trim_start_matches('-')
        .to_string();
    home.join(".claude/projects").join(escaped)
}

/// Scans a Claude Code project directory for session .jsonl files.
///
/// Finds all .jsonl files in the directory, excluding:
/// - Files starting with 'agent-' (agent-specific files)
/// - 'sessions-index.jsonl' (the index file itself)
///
/// # Arguments
/// * `project_dir` - Path to the Claude Code project directory
///
/// # Returns
/// Vector of PathBuf entries for all session files found
///
/// # Errors
/// Returns std::io::Error if directory cannot be read
#[allow(dead_code)]
fn scan_session_files(project_dir: &Path) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut sessions = Vec::new();
    for entry in std::fs::read_dir(project_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "jsonl") {
            let name = path.file_stem().unwrap().to_string_lossy();
            if !name.starts_with("agent-") && name != "sessions-index" {
                sessions.push(path);
            }
        }
    }
    Ok(sessions)
}

/// Extracts session metadata from a .jsonl session file.
///
/// Reads the first line of the session file to extract metadata fields,
/// counts total messages, and gets file modification time to build a
/// complete SessionIndexEntry.
///
/// # Arguments
/// * `session_path` - Path to the .jsonl session file
/// * `project_path` - Project root path for the session
///
/// # Returns
/// SessionIndexEntry with all metadata populated
///
/// # Errors
/// Returns std::io::Error if:
/// - File cannot be read
/// - First line is not valid JSON
/// - Required fields are missing from the session data
#[allow(dead_code)]
fn extract_session_metadata(
    session_path: &Path,
    project_path: &Path,
) -> Result<SessionIndexEntry, std::io::Error> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    // Read first line to extract session metadata
    let file = File::open(session_path)?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    let first_line = lines.next().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "Session file is empty")
    })??;

    // Parse the first line as JSON
    let log_entry: SessionLogEntry = serde_json::from_str(&first_line).map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Failed to parse session metadata: {}", e),
        )
    })?;

    // Extract required fields
    let session_id = log_entry.session_id.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "Missing sessionId field")
    })?;

    let created = log_entry.created.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "Missing created timestamp")
    })?;

    // Extract first prompt from message or content field
    let first_prompt = if let Some(msg) = log_entry.message {
        msg
    } else if let Some(content) = log_entry.other.get("content") {
        content.as_str().unwrap_or("").to_string()
    } else {
        String::new()
    };

    // Count total number of lines (messages) in the file
    let message_count = {
        let file = File::open(session_path)?;
        let reader = BufReader::new(file);
        reader.lines().count() as u32
    };

    // Get file metadata for modification time
    let metadata = std::fs::metadata(session_path)?;
    let file_mtime = metadata
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(std::time::Duration::ZERO)
        .as_millis() as u64;

    // Use created timestamp for modified initially (will be updated if file is modified)
    let modified = created.clone();

    Ok(SessionIndexEntry {
        session_id,
        full_path: session_path.to_string_lossy().to_string(),
        file_mtime,
        first_prompt: first_prompt.chars().take(200).collect(), // Truncate long prompts
        message_count,
        created,
        modified,
        git_branch: log_entry.git_branch,
        project_path: project_path.to_string_lossy().to_string(),
        is_sidechain: log_entry.is_sidechain.unwrap_or(false),
    })
}

/// Repairs the sessions-index.json file if sessions are missing.
///
/// This function addresses a bug in Claude Code where sessions-index.json stops
/// being updated, causing session resumption to fail. It scans for all session
/// files, compares them with the existing index, and rebuilds the index if
/// sessions are missing.
///
/// # Arguments
/// * `worktree_path` - The absolute path to the worktree directory
///
/// # Returns
/// Ok(()) if the repair was successful or no repair was needed
///
/// # Errors
/// Returns std::io::Error if:
/// - Claude project directory cannot be accessed
/// - Session files cannot be read
/// - Index file cannot be written
///
/// # Behavior
/// - Only repairs if sessions are actually missing
/// - Logs actions with tracing::info and tracing::warn
/// - Writes index in sorted order by session ID for consistency
pub async fn repair_sessions_index(worktree_path: &Path) -> Result<(), std::io::Error> {
    repair_sessions_index_impl(worktree_path, None).await
}

#[allow(dead_code)] // Used in tests for isolation with custom home directory
pub(crate) async fn repair_sessions_index_with_home(
    worktree_path: &Path,
    home: PathBuf,
) -> Result<(), std::io::Error> {
    repair_sessions_index_impl(worktree_path, Some(home)).await
}

async fn repair_sessions_index_impl(
    worktree_path: &Path,
    home_override: Option<PathBuf>,
) -> Result<(), std::io::Error> {
    use std::collections::HashSet;
    use std::fs;
    use tracing::{info, warn};

    // Get Claude project directory
    let project_dir = match home_override {
        Some(home) => get_claude_project_dir_with_home(worktree_path, home),
        None => get_claude_project_dir(worktree_path),
    };
    let index_path = project_dir.join("sessions-index.json");

    // If project directory doesn't exist, nothing to repair
    if !project_dir.exists() {
        info!(
            project_dir = %project_dir.display(),
            "Claude project directory does not exist, no repair needed"
        );
        return Ok(());
    }

    // Read existing index if present
    let existing_index: Option<SessionIndex> = if index_path.exists() {
        match fs::read_to_string(&index_path) {
            Ok(content) => match serde_json::from_str(&content) {
                Ok(index) => Some(index),
                Err(e) => {
                    warn!(
                        error = %e,
                        path = %index_path.display(),
                        "Failed to parse existing sessions-index.json, will rebuild"
                    );
                    None
                }
            },
            Err(e) => {
                warn!(
                    error = %e,
                    path = %index_path.display(),
                    "Failed to read sessions-index.json, will rebuild"
                );
                None
            }
        }
    } else {
        info!(
            path = %index_path.display(),
            "sessions-index.json does not exist, will create new index"
        );
        None
    };

    // Scan for session files
    let session_files = match scan_session_files(&project_dir) {
        Ok(files) => files,
        Err(e) => {
            warn!(
                error = %e,
                project_dir = %project_dir.display(),
                "Failed to scan session files"
            );
            return Err(e);
        }
    };

    // If no session files exist, nothing to repair
    if session_files.is_empty() {
        info!(
            project_dir = %project_dir.display(),
            "No session files found, no repair needed"
        );
        return Ok(());
    }

    // Build set of session IDs from existing index
    let existing_session_ids: HashSet<String> = existing_index
        .as_ref()
        .map(|idx| idx.entries.iter().map(|e| e.session_id.clone()).collect())
        .unwrap_or_default();

    // Extract metadata from all session files
    let mut all_entries = Vec::new();
    let mut missing_count = 0;

    for session_file in &session_files {
        match extract_session_metadata(session_file, worktree_path) {
            Ok(entry) => {
                // Check if this session is missing from the index
                if !existing_session_ids.contains(&entry.session_id) {
                    missing_count += 1;
                    info!(
                        session_id = %entry.session_id,
                        file = %session_file.display(),
                        "Found session missing from index"
                    );
                }
                all_entries.push(entry);
            }
            Err(e) => {
                warn!(
                    error = %e,
                    file = %session_file.display(),
                    "Failed to extract metadata from session file, skipping"
                );
            }
        }
    }

    // Only rebuild if sessions are missing
    if missing_count == 0 {
        info!(
            session_count = session_files.len(),
            "All sessions present in index, no repair needed"
        );
        return Ok(());
    }

    // Sort entries by session ID for consistency
    all_entries.sort_by(|a, b| a.session_id.cmp(&b.session_id));

    // Build new index
    let new_index = SessionIndex {
        version: 1,
        entries: all_entries,
    };

    // Write updated index
    let json = serde_json::to_string_pretty(&new_index).map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Failed to serialize index: {}", e),
        )
    })?;

    fs::write(&index_path, json)?;

    info!(
        missing_count = missing_count,
        total_sessions = new_index.entries.len(),
        path = %index_path.display(),
        "Successfully repaired sessions-index.json"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sessions_index() {
        let json = r#"{
            "version": 1,
            "entries": [{
                "sessionId": "abc-123",
                "fullPath": "/path/to/session.jsonl",
                "fileMtime": 1234567890,
                "firstPrompt": "Hello",
                "messageCount": 5,
                "created": "2026-01-17T10:00:00Z",
                "modified": "2026-01-17T11:00:00Z",
                "gitBranch": "main",
                "projectPath": "/proj",
                "isSidechain": false
            }]
        }"#;

        let index: SessionIndex = serde_json::from_str(json).unwrap();
        assert_eq!(index.version, 1);
        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].session_id, "abc-123");
        assert_eq!(index.entries[0].message_count, 5);
    }

    #[test]
    fn test_parse_session_entry() {
        let json = r#"{
            "sessionId": "test-session",
            "fullPath": "/home/user/.claude/projects/test/session.jsonl",
            "fileMtime": 1705502400000,
            "firstPrompt": "Fix the bug",
            "messageCount": 10,
            "created": "2026-01-17T12:00:00Z",
            "modified": "2026-01-17T13:30:00Z",
            "gitBranch": "bugfix-branch",
            "projectPath": "/home/user/projects/test",
            "isSidechain": true
        }"#;

        let entry: SessionIndexEntry = serde_json::from_str(json).unwrap();
        assert_eq!(entry.session_id, "test-session");
        assert_eq!(entry.first_prompt, "Fix the bug");
        assert_eq!(entry.message_count, 10);
        assert_eq!(entry.git_branch, Some("bugfix-branch".to_string()));
        assert!(entry.is_sidechain);
    }

    #[test]
    fn test_serialize_sessions_index() {
        let index = SessionIndex {
            version: 1,
            entries: vec![SessionIndexEntry {
                session_id: "xyz-789".to_string(),
                full_path: "/test/path.jsonl".to_string(),
                file_mtime: 9876543210,
                first_prompt: "Test prompt".to_string(),
                message_count: 3,
                created: "2026-01-18T00:00:00Z".to_string(),
                modified: "2026-01-18T01:00:00Z".to_string(),
                git_branch: None,
                project_path: "/test".to_string(),
                is_sidechain: false,
            }],
        };

        let json = serde_json::to_string(&index).unwrap();
        let parsed: SessionIndex = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.entries.len(), 1);
        assert_eq!(parsed.entries[0].session_id, "xyz-789");
        assert_eq!(parsed.entries[0].git_branch, None);
    }

    #[test]
    fn test_get_claude_project_dir() {
        // Test path escaping with standard Unix path
        let worktree = Path::new("/var/tmp/vkswarm/my-project");
        let project_dir = get_claude_project_dir(worktree);

        let home = dirs::home_dir().expect("home directory");
        let expected = home.join(".claude/projects/var-tmp-vkswarm-my-project");
        assert_eq!(project_dir, expected);

        // Test with nested path
        let worktree = Path::new("/home/user/projects/test/nested");
        let project_dir = get_claude_project_dir(worktree);

        let expected = home.join(".claude/projects/home-user-projects-test-nested");
        assert_eq!(project_dir, expected);

        // Test with root path (edge case)
        let worktree = Path::new("/");
        let project_dir = get_claude_project_dir(worktree);

        // Leading '-' should be stripped, resulting in empty string
        let expected = home.join(".claude/projects");
        assert_eq!(project_dir, expected);
    }

    #[test]
    fn test_get_claude_project_dir_with_home_override() {
        let custom_home = PathBuf::from("/custom/home");
        let worktree = Path::new("/var/tmp/my-project");
        let result = get_claude_project_dir_with_home(worktree, custom_home.clone());
        assert_eq!(
            result,
            custom_home.join(".claude/projects/var-tmp-my-project")
        );
    }

    #[test]
    fn test_scan_session_files() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory for test
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path();

        // Create test files
        fs::write(project_dir.join("session-001.jsonl"), "test content").unwrap();
        fs::write(project_dir.join("session-002.jsonl"), "test content").unwrap();
        fs::write(project_dir.join("agent-log.jsonl"), "should be excluded").unwrap();
        fs::write(
            project_dir.join("sessions-index.jsonl"),
            "should be excluded",
        )
        .unwrap();
        fs::write(project_dir.join("readme.txt"), "not a jsonl file").unwrap();

        // Scan the directory
        let sessions = scan_session_files(project_dir).unwrap();

        // Should find exactly 2 session files
        assert_eq!(sessions.len(), 2);

        // Verify the files are the expected ones
        let file_names: Vec<String> = sessions
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();

        assert!(file_names.contains(&"session-001.jsonl".to_string()));
        assert!(file_names.contains(&"session-002.jsonl".to_string()));
        assert!(!file_names.contains(&"agent-log.jsonl".to_string()));
        assert!(!file_names.contains(&"sessions-index.jsonl".to_string()));
        assert!(!file_names.contains(&"readme.txt".to_string()));
    }

    #[test]
    fn test_scan_session_files_empty_directory() {
        use tempfile::TempDir;

        // Create empty temporary directory
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path();

        // Scan the directory
        let sessions = scan_session_files(project_dir).unwrap();

        // Should find no files
        assert_eq!(sessions.len(), 0);
    }

    #[test]
    fn test_scan_session_files_nonexistent_directory() {
        let project_dir = Path::new("/nonexistent/directory/path");

        // Should return an error
        let result = scan_session_files(project_dir);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_session_metadata() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory for test
        let temp_dir = TempDir::new().unwrap();
        let project_path = Path::new("/test/project");

        // Create a test session file with realistic content
        let session_file = temp_dir.path().join("test-session.jsonl");
        let session_content = r#"{"type":"queue-operation","operation":"enqueue","timestamp":"2026-01-18T10:00:00.000Z","content":"Fix the authentication bug","sessionId":"abc-123-def","created":"2026-01-18T10:00:00.000Z","gitBranch":"bugfix-auth"}
{"type":"message","role":"user","content":"Step 1"}
{"type":"message","role":"assistant","content":"Implementing step 1"}
{"type":"message","role":"user","content":"Step 2"}"#;

        fs::write(&session_file, session_content).unwrap();

        // Extract metadata
        let metadata = extract_session_metadata(&session_file, project_path).unwrap();

        // Verify metadata fields
        assert_eq!(metadata.session_id, "abc-123-def");
        assert_eq!(metadata.created, "2026-01-18T10:00:00.000Z");
        assert_eq!(metadata.first_prompt, "Fix the authentication bug");
        assert_eq!(metadata.message_count, 4); // 4 lines in the file
        assert_eq!(metadata.git_branch, Some("bugfix-auth".to_string()));
        assert_eq!(metadata.project_path, "/test/project");
        assert!(!metadata.is_sidechain);
        assert!(metadata.file_mtime > 0); // Should have a valid timestamp
    }

    #[test]
    fn test_extract_session_metadata_with_message_field() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory for test
        let temp_dir = TempDir::new().unwrap();
        let project_path = Path::new("/test/project");

        // Test with message field instead of content
        let session_file = temp_dir.path().join("test-session-2.jsonl");
        let session_content = r#"{"sessionId":"xyz-789","created":"2026-01-17T15:30:00.000Z","message":"First user message","role":"user"}
{"message":"Assistant response"}"#;

        fs::write(&session_file, session_content).unwrap();

        // Extract metadata
        let metadata = extract_session_metadata(&session_file, project_path).unwrap();

        // Verify metadata fields
        assert_eq!(metadata.session_id, "xyz-789");
        assert_eq!(metadata.created, "2026-01-17T15:30:00.000Z");
        assert_eq!(metadata.first_prompt, "First user message");
        assert_eq!(metadata.message_count, 2);
        assert_eq!(metadata.git_branch, None);
    }

    #[test]
    fn test_extract_session_metadata_detects_sidechain() {
        use std::fs;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let project_path = Path::new("/test/project");

        // Create a session file whose first entry marks it as a sidechain
        let session_file = temp_dir.path().join("sidechain-session.jsonl");
        let session_content = r#"{"sessionId":"side-1","created":"2026-01-18T10:00:00.000Z","content":"Forked from parent","isSidechain":true}
{"type":"message","role":"assistant","content":"Continuing on sidechain"}"#;

        fs::write(&session_file, session_content).unwrap();

        let metadata = extract_session_metadata(&session_file, project_path).unwrap();

        assert_eq!(metadata.session_id, "side-1");
        assert!(metadata.is_sidechain);
    }

    #[test]
    fn test_extract_session_metadata_missing_sidechain_defaults_false() {
        use std::fs;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let project_path = Path::new("/test/project");

        // Session file without an isSidechain field should default to false
        let session_file = temp_dir.path().join("no-sidechain.jsonl");
        let session_content = r#"{"sessionId":"plain-1","created":"2026-01-18T10:00:00.000Z","content":"No sidechain key"}"#;

        fs::write(&session_file, session_content).unwrap();

        let metadata = extract_session_metadata(&session_file, project_path).unwrap();

        assert!(!metadata.is_sidechain);
    }

    #[test]
    fn test_extract_session_metadata_truncates_long_prompt() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory for test
        let temp_dir = TempDir::new().unwrap();
        let project_path = Path::new("/test/project");

        // Create session with a very long first prompt
        let long_prompt = "a".repeat(500);
        let session_file = temp_dir.path().join("test-session-long.jsonl");
        let session_content = format!(
            r#"{{"sessionId":"long-test","created":"2026-01-18T10:00:00.000Z","content":"{}"}}"#,
            long_prompt
        );

        fs::write(&session_file, session_content).unwrap();

        // Extract metadata
        let metadata = extract_session_metadata(&session_file, project_path).unwrap();

        // Verify first_prompt is truncated to 200 characters
        assert_eq!(metadata.first_prompt.len(), 200);
        assert_eq!(metadata.first_prompt, "a".repeat(200));
    }

    #[test]
    fn test_extract_session_metadata_empty_file() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory for test
        let temp_dir = TempDir::new().unwrap();
        let project_path = Path::new("/test/project");

        // Create an empty session file
        let session_file = temp_dir.path().join("empty.jsonl");
        fs::write(&session_file, "").unwrap();

        // Should return an error for empty file
        let result = extract_session_metadata(&session_file, project_path);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn test_extract_session_metadata_malformed_json() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory for test
        let temp_dir = TempDir::new().unwrap();
        let project_path = Path::new("/test/project");

        // Create a session file with invalid JSON
        let session_file = temp_dir.path().join("malformed.jsonl");
        fs::write(&session_file, "not valid json at all").unwrap();

        // Should return an error for malformed JSON
        let result = extract_session_metadata(&session_file, project_path);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn test_extract_session_metadata_missing_required_fields() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory for test
        let temp_dir = TempDir::new().unwrap();
        let project_path = Path::new("/test/project");

        // Create a session file missing sessionId
        let session_file = temp_dir.path().join("missing-fields.jsonl");
        fs::write(
            &session_file,
            r#"{"created":"2026-01-18T10:00:00.000Z","content":"Test"}"#,
        )
        .unwrap();

        // Should return an error for missing sessionId
        let result = extract_session_metadata(&session_file, project_path);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), std::io::ErrorKind::InvalidData);

        // Create a session file missing created timestamp
        let session_file2 = temp_dir.path().join("missing-created.jsonl");
        fs::write(
            &session_file2,
            r#"{"sessionId":"test-123","content":"Test"}"#,
        )
        .unwrap();

        // Should return an error for missing created timestamp
        let result2 = extract_session_metadata(&session_file2, project_path);
        assert!(result2.is_err());
        assert_eq!(result2.unwrap_err().kind(), std::io::ErrorKind::InvalidData);
    }

    #[tokio::test]
    async fn test_repair_adds_missing_sessions() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory structure mimicking Claude project directory
        let temp_dir = TempDir::new().unwrap();
        let home_dir = temp_dir.path().join("home");
        let worktree_path = temp_dir.path().join("worktree");
        let project_dir = home_dir.join(".claude/projects").join(
            worktree_path
                .to_string_lossy()
                .replace('/', "-")
                .trim_start_matches('-'),
        );

        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&worktree_path).unwrap();

        // Create test session files
        let session1_content = r#"{"sessionId":"session-001","created":"2026-01-18T10:00:00.000Z","content":"First session","gitBranch":"main"}
{"type":"message","role":"assistant","content":"Response 1"}"#;
        fs::write(project_dir.join("session-001.jsonl"), session1_content).unwrap();

        let session2_content = r#"{"sessionId":"session-002","created":"2026-01-18T11:00:00.000Z","content":"Second session","gitBranch":"feature"}
{"type":"message","role":"assistant","content":"Response 2"}"#;
        fs::write(project_dir.join("session-002.jsonl"), session2_content).unwrap();

        // Create an incomplete index (missing session-002)
        let incomplete_index = SessionIndex {
            version: 1,
            entries: vec![SessionIndexEntry {
                session_id: "session-001".to_string(),
                full_path: project_dir
                    .join("session-001.jsonl")
                    .to_string_lossy()
                    .to_string(),
                file_mtime: 1234567890,
                first_prompt: "First session".to_string(),
                message_count: 2,
                created: "2026-01-18T10:00:00.000Z".to_string(),
                modified: "2026-01-18T10:00:00.000Z".to_string(),
                git_branch: Some("main".to_string()),
                project_path: worktree_path.to_string_lossy().to_string(),
                is_sidechain: false,
            }],
        };

        let index_json = serde_json::to_string_pretty(&incomplete_index).unwrap();
        fs::write(project_dir.join("sessions-index.json"), index_json).unwrap();

        // Run repair with explicit home directory
        let result = repair_sessions_index_with_home(&worktree_path, home_dir.clone()).await;
        assert!(result.is_ok(), "Repair should succeed");

        // Read the updated index
        let updated_index_content =
            fs::read_to_string(project_dir.join("sessions-index.json")).unwrap();
        let updated_index: SessionIndex = serde_json::from_str(&updated_index_content).unwrap();

        // Verify both sessions are now in the index
        assert_eq!(updated_index.entries.len(), 2);
        assert!(
            updated_index
                .entries
                .iter()
                .any(|e| e.session_id == "session-001")
        );
        assert!(
            updated_index
                .entries
                .iter()
                .any(|e| e.session_id == "session-002")
        );

        // Verify entries are sorted by session ID
        assert_eq!(updated_index.entries[0].session_id, "session-001");
        assert_eq!(updated_index.entries[1].session_id, "session-002");
    }

    #[tokio::test]
    async fn test_repair_no_op_when_complete() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory structure
        let temp_dir = TempDir::new().unwrap();
        let home_dir = temp_dir.path().join("home");
        let worktree_path = temp_dir.path().join("worktree");
        let project_dir = home_dir.join(".claude/projects").join(
            worktree_path
                .to_string_lossy()
                .replace('/', "-")
                .trim_start_matches('-'),
        );

        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&worktree_path).unwrap();

        // Create a session file
        let session_content = r#"{"sessionId":"session-complete","created":"2026-01-18T10:00:00.000Z","content":"Complete session"}
{"type":"message","role":"assistant","content":"Response"}"#;
        fs::write(project_dir.join("session-complete.jsonl"), session_content).unwrap();

        // Create a complete index (all sessions present)
        let complete_index = SessionIndex {
            version: 1,
            entries: vec![SessionIndexEntry {
                session_id: "session-complete".to_string(),
                full_path: project_dir
                    .join("session-complete.jsonl")
                    .to_string_lossy()
                    .to_string(),
                file_mtime: 1234567890,
                first_prompt: "Complete session".to_string(),
                message_count: 2,
                created: "2026-01-18T10:00:00.000Z".to_string(),
                modified: "2026-01-18T10:00:00.000Z".to_string(),
                git_branch: None,
                project_path: worktree_path.to_string_lossy().to_string(),
                is_sidechain: false,
            }],
        };

        let original_json = serde_json::to_string_pretty(&complete_index).unwrap();
        fs::write(project_dir.join("sessions-index.json"), &original_json).unwrap();

        // Run repair with explicit home directory
        let result = repair_sessions_index_with_home(&worktree_path, home_dir.clone()).await;
        assert!(result.is_ok(), "Repair should succeed");

        // Read the index after repair
        let after_repair_json =
            fs::read_to_string(project_dir.join("sessions-index.json")).unwrap();

        // Index should remain unchanged (no missing sessions)
        let after_repair_index: SessionIndex = serde_json::from_str(&after_repair_json).unwrap();
        assert_eq!(after_repair_index.entries.len(), 1);
        assert_eq!(after_repair_index.entries[0].session_id, "session-complete");
    }

    #[tokio::test]
    async fn test_repair_handles_nonexistent_project_directory() {
        use tempfile::TempDir;

        // Create a worktree path that has no corresponding Claude project directory
        let temp_dir = TempDir::new().unwrap();
        let home_dir = temp_dir.path().to_path_buf();
        let worktree_path = temp_dir.path().join("nonexistent-worktree");

        // Run repair with explicit home directory - should succeed with no action
        let result = repair_sessions_index_with_home(&worktree_path, home_dir).await;
        assert!(
            result.is_ok(),
            "Repair should succeed when project directory doesn't exist"
        );
    }

    #[tokio::test]
    async fn test_repair_creates_new_index_when_missing() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory structure
        let temp_dir = TempDir::new().unwrap();
        let home_dir = temp_dir.path().join("home");
        let worktree_path = temp_dir.path().join("worktree");
        let project_dir = home_dir.join(".claude/projects").join(
            worktree_path
                .to_string_lossy()
                .replace('/', "-")
                .trim_start_matches('-'),
        );

        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&worktree_path).unwrap();

        // Create session files but NO index
        let session_content = r#"{"sessionId":"new-session","created":"2026-01-18T10:00:00.000Z","content":"New session"}
{"type":"message","role":"assistant","content":"Response"}"#;
        fs::write(project_dir.join("new-session.jsonl"), session_content).unwrap();

        // Run repair with explicit home directory - should create new index
        let result = repair_sessions_index_with_home(&worktree_path, home_dir.clone()).await;
        assert!(result.is_ok(), "Repair should succeed");

        // Verify index was created
        let index_path = project_dir.join("sessions-index.json");
        assert!(index_path.exists(), "Index file should be created");

        // Verify index contains the session
        let index_content = fs::read_to_string(&index_path).unwrap();
        let index: SessionIndex = serde_json::from_str(&index_content).unwrap();
        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].session_id, "new-session");
    }

    #[tokio::test]
    async fn test_repair_handles_empty_session_directory() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory structure with no session files
        let temp_dir = TempDir::new().unwrap();
        let home_dir = temp_dir.path().join("home");
        let worktree_path = temp_dir.path().join("worktree");
        let project_dir = home_dir.join(".claude/projects").join(
            worktree_path
                .to_string_lossy()
                .replace('/', "-")
                .trim_start_matches('-'),
        );

        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&worktree_path).unwrap();

        // Run repair with explicit home directory - should succeed with no action
        let result = repair_sessions_index_with_home(&worktree_path, home_dir.clone()).await;
        assert!(
            result.is_ok(),
            "Repair should succeed when no session files exist"
        );

        // Verify no index was created
        let index_path = project_dir.join("sessions-index.json");
        assert!(
            !index_path.exists(),
            "Index should not be created when no sessions exist"
        );
    }

    #[tokio::test]
    async fn test_repair_handles_malformed_files() {
        use std::fs;
        use tempfile::TempDir;

        // Create temporary directory structure
        let temp_dir = TempDir::new().unwrap();
        let home_dir = temp_dir.path().join("home");
        let worktree_path = temp_dir.path().join("worktree");
        let project_dir = home_dir.join(".claude/projects").join(
            worktree_path
                .to_string_lossy()
                .replace('/', "-")
                .trim_start_matches('-'),
        );

        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&worktree_path).unwrap();

        // Create one valid session file
        let valid_session = r#"{"sessionId":"valid-session","created":"2026-01-18T10:00:00.000Z","content":"Valid session"}
{"type":"message","role":"assistant","content":"Response"}"#;
        fs::write(project_dir.join("valid-session.jsonl"), valid_session).unwrap();

        // Create one malformed session file (invalid JSON)
        fs::write(
            project_dir.join("malformed-session.jsonl"),
            "this is not valid JSON at all",
        )
        .unwrap();

        // Create another malformed session file (missing required fields)
        fs::write(
            project_dir.join("incomplete-session.jsonl"),
            r#"{"content":"Missing sessionId and created"}"#,
        )
        .unwrap();

        // Run repair with explicit home directory - should succeed and skip malformed files
        let result = repair_sessions_index_with_home(&worktree_path, home_dir.clone()).await;
        assert!(
            result.is_ok(),
            "Repair should succeed despite malformed files"
        );

        // Verify index was created with only the valid session
        let index_path = project_dir.join("sessions-index.json");
        assert!(index_path.exists(), "Index should be created");

        let index_content = fs::read_to_string(&index_path).unwrap();
        let index: SessionIndex = serde_json::from_str(&index_content).unwrap();

        // Should contain only 1 entry (the valid session)
        assert_eq!(
            index.entries.len(),
            1,
            "Index should contain only the valid session"
        );
        assert_eq!(index.entries[0].session_id, "valid-session");
    }

    #[tokio::test]
    async fn test_integration_repair_then_lookup() {
        use std::fs;
        use tempfile::TempDir;

        // Setup: Create worktree and Claude project directory
        let temp_dir = TempDir::new().unwrap();
        let home_dir = temp_dir.path().join("home");
        let worktree_path = temp_dir.path().join("worktree");
        let project_dir = home_dir.join(".claude/projects").join(
            worktree_path
                .to_string_lossy()
                .replace('/', "-")
                .trim_start_matches('-'),
        );

        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&worktree_path).unwrap();

        // Create 3 session files
        for i in 1..=3 {
            let content = format!(
                r#"{{"sessionId":"session-{i}","created":"2026-01-18T{i:02}:00:00.000Z","content":"Session {i}"}}
{{"type":"message","role":"assistant","content":"Response {i}"}}"#
            );
            fs::write(project_dir.join(format!("session-{i}.jsonl")), content).unwrap();
        }

        // Create incomplete index (only session-1)
        let incomplete_index = SessionIndex {
            version: 1,
            entries: vec![SessionIndexEntry {
                session_id: "session-1".to_string(),
                full_path: project_dir
                    .join("session-1.jsonl")
                    .to_string_lossy()
                    .to_string(),
                file_mtime: 1234567890,
                first_prompt: "Session 1".to_string(),
                message_count: 2,
                created: "2026-01-18T01:00:00.000Z".to_string(),
                modified: "2026-01-18T01:00:00.000Z".to_string(),
                git_branch: None,
                project_path: worktree_path.to_string_lossy().to_string(),
                is_sidechain: false,
            }],
        };
        fs::write(
            project_dir.join("sessions-index.json"),
            serde_json::to_string_pretty(&incomplete_index).unwrap(),
        )
        .unwrap();

        // Run repair
        let result = repair_sessions_index_with_home(&worktree_path, home_dir.clone()).await;
        assert!(result.is_ok());

        // Verify: All 3 sessions now in index
        let updated_content = fs::read_to_string(project_dir.join("sessions-index.json")).unwrap();
        let updated_index: SessionIndex = serde_json::from_str(&updated_content).unwrap();

        assert_eq!(updated_index.entries.len(), 3);
        for i in 1..=3 {
            assert!(
                updated_index
                    .entries
                    .iter()
                    .any(|e| e.session_id == format!("session-{i}")),
                "Missing session-{i}"
            );
        }

        // Verify: Can look up any session by ID
        let session_2 = updated_index
            .entries
            .iter()
            .find(|e| e.session_id == "session-2");
        assert!(session_2.is_some());
        assert!(session_2.unwrap().full_path.ends_with("session-2.jsonl"));
    }
}
