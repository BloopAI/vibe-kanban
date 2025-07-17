use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref OPENCODE_LOG_REGEX: Regex = Regex::new(r"^(INFO|DEBUG|WARN|ERROR)\s+.*").unwrap();
    static ref SESSION_ID_REGEX: Regex = Regex::new(r".*\b(id|session|sessionID)=([^ ]+)").unwrap();
    static ref TOOL_USAGE_REGEX: Regex = Regex::new(r"^\|\s*([a-zA-Z]+)\s*(.*)").unwrap();
    static ref NPM_WARN_REGEX: Regex = Regex::new(r"^npm warn .*").unwrap();
}

/// Filter for OpenCode stderr output
pub struct OpenCodeFilter;

impl OpenCodeFilter {
    /// Check if a line should be skipped as noise
    pub fn is_noise(line: &str) -> bool {
        let trimmed = line.trim();

        // Empty lines are noise
        if trimmed.is_empty() {
            return true;
        }

        // Strip ANSI escape codes for analysis
        let cleaned = Self::strip_ansi_codes(trimmed);
        let cleaned_trim = cleaned.trim();

        // Skip tool calls - they are NOT noise
        if TOOL_USAGE_REGEX.is_match(cleaned_trim) {
            return false;
        }

        // OpenCode log lines are noise (includes session logs)
        if is_opencode_log_line(cleaned_trim) {
            return true;
        }

        if NPM_WARN_REGEX.is_match(cleaned_trim) {
            return true;
        }

        // Spinner glyphs
        if cleaned_trim.len() == 1 && "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏".contains(cleaned_trim) {
            return true;
        }

        // Banner lines containing block glyphs (Unicode Block Elements range)
        if cleaned_trim
            .chars()
            .any(|c| ('\u{2580}'..='\u{259F}').contains(&c))
        {
            return true;
        }

        // UI/stats frames using Box Drawing glyphs (U+2500-257F)
        if cleaned_trim
            .chars()
            .any(|c| ('\u{2500}'..='\u{257F}').contains(&c))
        {
            return true;
        }

        // Model banner (@ with spaces)
        if cleaned_trim.starts_with("@ ") {
            return true;
        }

        // Share link
        if cleaned_trim.starts_with("~") && cleaned_trim.contains("https://opencode.ai/s/") {
            return true;
        }

        // Everything else (assistant messages) is NOT noise
        false
    }

    pub fn is_stderr(_line: &str) -> bool {
        false
    }

    /// Strip ANSI escape codes from text (conservative)
    pub fn strip_ansi_codes(text: &str) -> String {
        // Handle both unicode escape sequences and raw ANSI codes
        let result = text.replace("\\u001b", "\x1b");

        let mut cleaned = String::new();
        let mut chars = result.chars().peekable();

        while let Some(ch) = chars.next() {
            if ch == '\x1b' {
                // Skip ANSI escape sequence
                if chars.peek() == Some(&'[') {
                    chars.next(); // consume '['
                                  // Skip until we find a letter (end of ANSI sequence)
                    for next_ch in chars.by_ref() {
                        if next_ch.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
            } else {
                cleaned.push(ch);
            }
        }

        cleaned
    }
}

/// Detect if a line is an OpenCode log line format using regex
pub fn is_opencode_log_line(line: &str) -> bool {
    OPENCODE_LOG_REGEX.is_match(line)
}

/// Parse session_id from OpenCode log lines
pub fn parse_session_id_from_line(line: &str) -> Option<String> {
    // Only apply to OpenCode log lines
    if !is_opencode_log_line(line) {
        return None;
    }

    // Try regex for session ID extraction from service=session logs
    if let Some(captures) = SESSION_ID_REGEX.captures(line) {
        if let Some(id) = captures.get(2) {
            return Some(id.as_str().to_string());
        }
    }

    None
}

/// Get the tool usage regex for parsing tool patterns
pub fn tool_usage_regex() -> &'static Regex {
    &TOOL_USAGE_REGEX
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_session_id_extraction() {
        use crate::executors::sst_opencode::filter::parse_session_id_from_line;

        // Test session ID extraction from session= format (only works on OpenCode log lines)
        assert_eq!(
            parse_session_id_from_line("INFO session=ses_abc123 starting"),
            Some("ses_abc123".to_string())
        );

        assert_eq!(
            parse_session_id_from_line("DEBUG id=debug_id process"),
            Some("debug_id".to_string())
        );

        // Test lines without log prefix (should return None)
        assert_eq!(
            parse_session_id_from_line("session=simple_id chatting"),
            None
        );

        // Test no session ID
        assert_eq!(parse_session_id_from_line("No session here"), None);
        assert_eq!(parse_session_id_from_line(""), None);
    }

    #[test]
    fn test_ansi_code_stripping() {
        use crate::executors::sst_opencode::filter::OpenCodeFilter;

        // Test ANSI escape sequence removal
        let ansi_text = "\x1b[31mRed text\x1b[0m normal text";
        let cleaned = OpenCodeFilter::strip_ansi_codes(ansi_text);
        assert_eq!(cleaned, "Red text normal text");

        // Test unicode escape sequences
        let unicode_ansi = "Text with \\u001b[32mgreen\\u001b[0m color";
        let cleaned = OpenCodeFilter::strip_ansi_codes(unicode_ansi);
        assert_eq!(cleaned, "Text with green color");

        // Test text without ANSI codes (unchanged)
        let plain_text = "Regular text without codes";
        let cleaned = OpenCodeFilter::strip_ansi_codes(plain_text);
        assert_eq!(cleaned, plain_text);
    }
}
