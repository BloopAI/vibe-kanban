//! Cross-platform shell command utilities

/// Returns the appropriate shell command and argument for the current platform.
///
/// Returns (shell_program, shell_arg) where:
/// - Windows: ("cmd", "/C")
/// - Unix-like: Respects the user's SHELL environment variable, falls back to bash or sh
pub fn get_shell_command() -> (&'static str, &'static str) {
    if cfg!(windows) {
        ("cmd", "/C")
    } else {
        // First, try to use the user's default shell from SHELL environment variable
        if let Ok(shell_path) = std::env::var("SHELL")
            && let Some(shell_name) = std::path::Path::new(&shell_path)
                .file_name()
                .and_then(|s| s.to_str())
        {
            // Verify the shell exists at the specified path
            if std::path::Path::new(&shell_path).exists() {
                // Match known shells and return appropriate static string
                let result = match shell_name {
                    "bash" => Some(("bash", "-c")),
                    "zsh" => Some(("zsh", "-c")),
                    "fish" => Some(("fish", "-c")),
                    "ksh" => Some(("ksh", "-c")),
                    "dash" => Some(("dash", "-c")),
                    "sh" => Some(("sh", "-c")),
                    _ => None,
                };

                if let Some(shell) = result {
                    return shell;
                }
            }
        }

        // Fallback: prefer bash if available, otherwise use sh
        if std::path::Path::new("/bin/bash").exists() {
            ("bash", "-c")
        } else {
            ("sh", "-c")
        }
    }
}

/// Resolves the full path of an executable using the system's PATH environment variable.
/// Note: On Windows, resolving the executable path can be necessary before passing
/// it to `std::process::Command::new`, as the latter has been deficient in finding executables.
pub fn resolve_executable_path(executable: &str) -> Option<String> {
    which::which(executable)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}
