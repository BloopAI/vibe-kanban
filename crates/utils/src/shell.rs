//! Cross-platform shell command utilities

/// Returns the appropriate shell command and argument for the current platform.
///
/// Returns (shell_program, shell_arg) where:
/// - Windows: ("cmd", "/C")
/// - Unix-like: ("sh", "-c") or ("bash", "-c") if available
pub fn get_shell_command() -> (&'static str, &'static str) {
    if cfg!(windows) {
        ("cmd", "/C")
    } else {
        // Prefer zsh or bash if available, fallback to sh
        if std::path::Path::new("/bin/zsh").exists() {
            ("zsh", "-c")
        } else if std::path::Path::new("/bin/bash").exists() {
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
