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
        // Prefer bash if available, fallback to sh
        if std::path::Path::new("/bin/bash").exists() {
            ("bash", "-c")
        } else {
            ("sh", "-c")
        }
    }
}
