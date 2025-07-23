use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref AIDER_SESSION_REGEX: Regex = Regex::new(r".*\b(chat|session|sessionID|id)=([^ ]+)").unwrap();
    static ref SYSTEM_MESSAGE_REGEX: Regex = Regex::new(r"^(Main model:|Weak model:)").unwrap();
    static ref ERROR_MESSAGE_REGEX: Regex = Regex::new(r"^(Error:|ERROR:|Warning:|WARN:|Exception:|Fatal:|FATAL:|✗|❌|\[ERROR\])").unwrap();
    static ref USER_INPUT_REGEX: Regex = Regex::new(r"^>\s+").unwrap();
    static ref NOISE_REGEX: Regex = Regex::new(r"^(\s*$|Warning: Input is not a terminal|\[\[?\d+;\d+R|─{5,}|\s*\d+%\||Added .* to|You can skip|System:|Aider:|Git repo:.*|Repo-map:|>|▶|\[SYSTEM\]|Scanning repo:|Initial repo scan|Tokens:|Using [a-zA-Z0-9_.-]+ model with API key from environment|Restored previous conversation history.|.*\.git/worktrees/.*)").unwrap();
    static ref SCANNING_REPO_PROGRESS_REGEX: Regex = Regex::new(r"^Scanning repo:\s+\d+%\|.*\|\s*\d+/\d+\s+\[.*\]").unwrap();
    static ref DIFF_BLOCK_MARKERS: Regex = Regex::new(r"^(<<<<<<< SEARCH|=======|>>>>>>> REPLACE)$").unwrap();
}

/// Filter for Aider CLI output
pub struct AiderFilter;

impl AiderFilter {
    /// Check if a line is a system message
    pub fn is_system_message(line: &str) -> bool {
        let trimmed = line.trim();
        SYSTEM_MESSAGE_REGEX.is_match(trimmed)
    }

    /// Check if a line is an error message
    pub fn is_error(line: &str) -> bool {
        let trimmed = line.trim();
        ERROR_MESSAGE_REGEX.is_match(trimmed)
    }

    /// Check if a line is noise that should be filtered out
    pub fn is_noise(line: &str) -> bool {
        let trimmed = line.trim();
        NOISE_REGEX.is_match(trimmed)
    }

    /// Check if a line is user input (echo from stdin)
    pub fn is_user_input(line: &str) -> bool {
        let trimmed = line.trim();
        USER_INPUT_REGEX.is_match(trimmed)
    }

    /// Check if a line is a scanning repo progress message that should be simplified
    pub fn is_scanning_repo_progress(line: &str) -> bool {
        let trimmed = line.trim();
        SCANNING_REPO_PROGRESS_REGEX.is_match(trimmed)
    }

    /// Check if a line is a diff block marker (SEARCH/REPLACE blocks)
    pub fn is_diff_block_marker(line: &str) -> bool {
        let trimmed = line.trim();
        DIFF_BLOCK_MARKERS.is_match(trimmed)
    }

    /// Simplify scanning repo progress to just "Scanning repo"
    pub fn simplify_scanning_repo_message(line: &str) -> String {
        if Self::is_scanning_repo_progress(line) {
            "Scanning repo".to_string()
        } else {
            line.to_string()
        }
    }
}

/// Parse session_id from Aider output lines
pub fn parse_session_id_from_line(line: &str) -> Option<String> {
    // Try regex for session ID extraction from various patterns
    if let Some(captures) = AIDER_SESSION_REGEX.captures(line) {
        if let Some(id) = captures.get(2) {
            return Some(id.as_str().to_string());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_system_message() {
        // Only "Main model:" and "Weak model:" are system messages
        assert!(AiderFilter::is_system_message(
            "Main model: anthropic/claude-sonnet-4-20250514"
        ));
        assert!(AiderFilter::is_system_message(
            "Weak model: anthropic/claude-3-5-haiku-20241022"
        ));

        // Everything else is not a system message
        assert!(!AiderFilter::is_system_message("System: Starting new chat"));
        assert!(!AiderFilter::is_system_message("Git repo:"));
        assert!(!AiderFilter::is_system_message(
            "Git repo: ../vibe-kanban/.git/worktrees/vk-
        
        ing-fix with 280 files"
        ));
        assert!(!AiderFilter::is_system_message(
            "Using sonnet model with API key from environment"
        ));
        assert!(!AiderFilter::is_system_message(
            "I'll help you implement this"
        ));
        assert!(!AiderFilter::is_system_message(
            "Error: something went wrong"
        ));
        assert!(!AiderFilter::is_system_message(""));
    }

    #[test]
    fn test_is_noise() {
        // Test that complete Git repo lines are treated as noise
        assert!(AiderFilter::is_noise(
            "Git repo: ../vibe-kanban/.git/worktrees/vk-streaming-fix with 280 files"
        ));
        assert!(AiderFilter::is_noise("Git repo:"));
        assert!(AiderFilter::is_noise(
            "Using sonnet model with API key from environment"
        ));
        assert!(AiderFilter::is_noise("System: Starting new chat"));
        assert!(AiderFilter::is_noise("Aider: Ready to help"));
        assert!(AiderFilter::is_noise(
            "Repo-map: using 4096 tokens, auto refresh"
        ));

        // Test non-noise messages
        assert!(!AiderFilter::is_noise(
            "Main model: anthropic/claude-sonnet-4"
        ));
        assert!(!AiderFilter::is_noise("I'll help you implement this"));
        assert!(!AiderFilter::is_noise("Error: something went wrong"));
    }

    #[test]
    fn test_is_error() {
        // Test error message detection
        assert!(AiderFilter::is_error("Error: File not found"));
        assert!(AiderFilter::is_error("ERROR: Permission denied"));
        assert!(AiderFilter::is_error("Warning: Deprecated function"));
        assert!(AiderFilter::is_error("WARN: Configuration issue"));
        assert!(AiderFilter::is_error("Exception: Invalid input"));
        assert!(AiderFilter::is_error("Fatal: Cannot continue"));
        assert!(AiderFilter::is_error("FATAL: System failure"));
        assert!(AiderFilter::is_error("✗ Command failed"));
        assert!(AiderFilter::is_error("❌ Task not completed"));
        assert!(AiderFilter::is_error("[ERROR] Operation failed"));
        assert!(AiderFilter::is_error("  Error: Starting with spaces  "));

        // Test non-error messages
        assert!(!AiderFilter::is_error("I'll help you with this"));
        assert!(!AiderFilter::is_error("System: Starting chat"));
        assert!(!AiderFilter::is_error("Regular message"));
        assert!(!AiderFilter::is_error(""));
    }

    #[test]
    fn test_parse_session_id_from_line() {
        // Test session ID extraction from various formats
        assert_eq!(
            parse_session_id_from_line("Starting chat=ses_abc123 new session"),
            Some("ses_abc123".to_string())
        );

        assert_eq!(
            parse_session_id_from_line("Aider session=aider_session_456"),
            Some("aider_session_456".to_string())
        );

        assert_eq!(
            parse_session_id_from_line("DEBUG sessionID=debug_789 process"),
            Some("debug_789".to_string())
        );

        assert_eq!(
            parse_session_id_from_line("Session id=simple_id started"),
            Some("simple_id".to_string())
        );

        // Test no session ID
        assert_eq!(parse_session_id_from_line("No session here"), None);
        assert_eq!(parse_session_id_from_line(""), None);
        assert_eq!(parse_session_id_from_line("session= empty"), None);
    }

    #[test]
    fn test_message_classification_priority() {
        // Error messages are not system messages
        assert!(AiderFilter::is_error("Error: System configuration invalid"));
        assert!(!AiderFilter::is_system_message(
            "Error: System configuration invalid"
        ));

        // System messages are not errors
        assert!(AiderFilter::is_system_message(
            "Main model: anthropic/claude-sonnet-4"
        ));
        assert!(!AiderFilter::is_error(
            "Main model: anthropic/claude-sonnet-4"
        ));
    }

    #[test]
    fn test_scanning_repo_progress_detection() {
        // Test scanning repo progress detection
        assert!(AiderFilter::is_scanning_repo_progress(
            "Scanning repo:   0%|          | 0/275 [00:00<?, ?it/s]"
        ));
        assert!(AiderFilter::is_scanning_repo_progress(
            "Scanning repo:  34%|███▍      | 94/275 [00:00<00:00, 931.21it/s]"
        ));
        assert!(AiderFilter::is_scanning_repo_progress(
            "Scanning repo:  68%|██████▊   | 188/275 [00:01<00:00, 150.45it/s]"
        ));
        assert!(AiderFilter::is_scanning_repo_progress(
            "Scanning repo: 100%|██████████| 275/275 [00:01<00:00, 151.76it/s]"
        ));

        // Test non-progress messages
        assert!(!AiderFilter::is_scanning_repo_progress(
            "Scanning repo: Starting"
        ));
        assert!(!AiderFilter::is_scanning_repo_progress(
            "Initial repo scan can be slow"
        ));
        assert!(!AiderFilter::is_scanning_repo_progress("Regular message"));
        assert!(!AiderFilter::is_scanning_repo_progress(""));
    }

    #[test]
    fn test_diff_block_marker_detection() {
        // Test diff block markers
        assert!(AiderFilter::is_diff_block_marker("<<<<<<< SEARCH"));
        assert!(AiderFilter::is_diff_block_marker("======="));
        assert!(AiderFilter::is_diff_block_marker(">>>>>>> REPLACE"));

        // Test non-markers
        assert!(!AiderFilter::is_diff_block_marker("Regular code line"));
        assert!(!AiderFilter::is_diff_block_marker("def function():"));
        assert!(!AiderFilter::is_diff_block_marker(""));
        assert!(!AiderFilter::is_diff_block_marker("< SEARCH")); // Missing full marker
    }

    #[test]
    fn test_simplify_scanning_repo_message() {
        // Test simplification of progress messages
        assert_eq!(
            AiderFilter::simplify_scanning_repo_message(
                "Scanning repo:   0%|          | 0/275 [00:00<?, ?it/s]"
            ),
            "Scanning repo"
        );
        assert_eq!(
            AiderFilter::simplify_scanning_repo_message(
                "Scanning repo: 100%|██████████| 275/275 [00:01<00:00, 151.76it/s]"
            ),
            "Scanning repo"
        );

        // Test non-progress messages (should remain unchanged)
        assert_eq!(
            AiderFilter::simplify_scanning_repo_message("Regular message"),
            "Regular message"
        );
        assert_eq!(
            AiderFilter::simplify_scanning_repo_message("Scanning repo: Starting"),
            "Scanning repo: Starting"
        );
    }
}
