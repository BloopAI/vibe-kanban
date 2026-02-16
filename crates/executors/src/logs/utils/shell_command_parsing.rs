use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Simple categories for common bash commands
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "snake_case")]
pub enum CommandCategory {
    /// File reading commands (cat, head, tail, sed without -i)
    Read,
    /// File/directory search commands (grep, rg, find, awk)
    Search,
    /// File editing commands (any command with >, sed -i, tee, chmod, rm, mv, cp)
    Edit,
    /// Network fetch commands (curl, wget)
    Fetch,
    /// Default category for everything else
    #[default]
    Other,
}

impl CommandCategory {
    /// Categorize a bash command string.
    pub fn from_command(command: &str) -> Self {
        let command = command.trim();

        if command.is_empty() {
            return Self::Other;
        }

        let command = unwrap_shell_command(command);

        // Any output redirect is an edit operation, e.g. echo > file
        if command.contains('>') {
            return Self::Edit;
        }

        let cmd = command
            .split_whitespace()
            .next()
            .and_then(|s| s.rsplit('/').next())
            .unwrap_or("")
            .to_lowercase();

        match cmd.as_str() {
            // File reading commands (ls lists directory contents)
            "cat" | "head" | "tail" | "zcat" | "gzcat" | "ls" => Self::Read,

            // Search commands
            "grep" | "rg" | "find" | "awk" => Self::Search,

            // sed: -i means in-place edit, otherwise read-only
            "sed" if command.contains("-i") => Self::Edit,
            "sed" => Self::Read,

            // Direct file edits
            "tee" | "truncate" | "chmod" | "chown" | "rm" | "mv" | "cp" | "touch" | "ln" => {
                Self::Edit
            }

            // Web Fetch commands
            "curl" | "wget" => Self::Fetch,

            _ => Self::Other,
        }
    }
}

/// Unwrap shell wrappers to get the actual command.
///
/// Handles: `zsh -c "command"` / `bash -lc 'command'` / etc.
pub fn unwrap_shell_command(command: &str) -> &str {
    let mut remaining = command;

    loop {
        let trimmed = remaining.trim_start();

        // Find first word
        let first_word_end = trimmed
            .find(|c: char| c.is_whitespace())
            .unwrap_or(trimmed.len());
        let first_word = &trimmed[..first_word_end];

        let cmd_name = first_word.rsplit('/').next().unwrap_or(first_word);

        // Check for shell -c "command"
        if matches!(cmd_name, "sh" | "bash" | "zsh") {
            let after_cmd = &trimmed[first_word_end..];
            if let Some(cmd_str) = extract_command_after_c_flag(after_cmd) {
                remaining = cmd_str;
                continue;
            }
        }

        break;
    }

    remaining
}

/// Extract the command string after a -c flag in shell arguments.
/// Handles: -c 'cmd', -c "cmd", -lc cmd, -cl 'cmd', etc.
fn extract_command_after_c_flag(args: &str) -> Option<&str> {
    let mut idx = 0;
    while idx < args.len() {
        let remaining = &args[idx..];
        let dash_pos = remaining.find('-')?;
        let after_dash = &remaining[dash_pos + 1..];

        let flag_end = after_dash
            .find(|c: char| !c.is_alphabetic())
            .unwrap_or(after_dash.len());
        let flags = &after_dash[..flag_end];

        if flags.contains('c') {
            let cmd_start = dash_pos + 1 + flag_end;
            return Some(strip_quotes(remaining[cmd_start..].trim_start()));
        }

        idx += dash_pos + 1 + flag_end;
    }

    None
}

/// Strip surrounding quotes from a command string.
fn strip_quotes(s: &str) -> &str {
    let s = s.trim();
    if s.len() >= 2 {
        let first = s.as_bytes()[0];
        let last = s.as_bytes()[s.len() - 1];
        if (first == b'"' || first == b'\'') && first == last {
            return &s[1..s.len() - 1];
        }
    }
    s
}
