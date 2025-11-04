//! Cross-platform shell command utilities

use std::{
    collections::HashSet,
    env::{join_paths, split_paths},
    ffi::{OsStr, OsString},
    path::{Path, PathBuf},
};

use crate::tokio::block_on;

/// Returns the appropriate shell command and argument for the current platform.
///
/// Returns (shell_program, shell_arg) where:
/// - Windows: ("cmd", "/C")
/// - Unix-like: ("sh", "-c") or ("bash", "-c") if available
pub fn get_shell_command() -> (String, &'static str) {
    if cfg!(windows) {
        ("cmd".into(), "/C")
    } else {
        // Prefer SHELL env var if set and valid
        if let Ok(shell) = std::env::var("SHELL") {
            let path = Path::new(&shell);
            if path.is_absolute() && path.is_file() {
                return (shell, "-c");
            }
        }
        // Prefer zsh or bash if available, fallback to sh
        if std::path::Path::new("/bin/zsh").exists() {
            ("zsh".into(), "-c")
        } else if std::path::Path::new("/bin/bash").exists() {
            ("bash".into(), "-c")
        } else {
            ("sh".into(), "-c")
        }
    }
}

/// Resolve an executable by name, falling back to a refreshed PATH if needed.
///
/// The search order is:
/// 1. Explicit paths (absolute or containing a separator).
/// 2. The current process PATH via `which`.
/// 3. A platform-specific refresh of PATH (login shell on Unix, PowerShell on Windows),
///    after which we re-run the `which` lookup and update the process PATH for future calls.
pub async fn resolve_executable_path(executable: &str) -> Option<PathBuf> {
    if executable.trim().is_empty() {
        return None;
    }

    let path = Path::new(executable);
    if path.is_absolute() && path.is_file() {
        return Some(path.to_path_buf());
    }

    if let Some(found) = which(executable).await {
        return Some(found);
    }

    if refresh_path().await
        && let Some(found) = which(executable).await
    {
        return Some(found);
    }

    None
}

pub fn resolve_executable_path_blocking(executable: &str) -> Option<PathBuf> {
    block_on(resolve_executable_path(executable))
}

/// Merge two PATH strings into a single, de-duplicated PATH.
///
/// - Keeps the order of entries from `primary`.
/// - Appends only *unseen* entries from `secondary`.
/// - Ignores empty components.
/// - Returns a platform-correct PATH string (using the OS separator).
pub fn merge_paths(primary: impl AsRef<OsStr>, secondary: impl AsRef<OsStr>) -> OsString {
    let mut seen = HashSet::<PathBuf>::new();
    let mut merged = Vec::<PathBuf>::new();

    for p in split_paths(primary.as_ref()).chain(split_paths(secondary.as_ref())) {
        if !p.as_os_str().is_empty() && seen.insert(p.clone()) {
            merged.push(p);
        }
    }

    join_paths(merged).unwrap_or_default()
}

async fn refresh_path() -> bool {
    let Some(refreshed) = get_fresh_path().await else {
        return false;
    };
    let existing = std::env::var_os("PATH").unwrap_or_default();
    let refreshed_os = OsString::from(&refreshed);
    let merged = merge_paths(&existing, refreshed_os);
    if merged == existing {
        return false;
    }
    tracing::debug!(?existing, ?refreshed, ?merged, "Refreshed PATH");
    unsafe {
        std::env::set_var("PATH", &merged);
    }
    true
}

async fn which(executable: &str) -> Option<PathBuf> {
    let executable = executable.to_string();
    tokio::task::spawn_blocking(move || which::which(executable))
        .await
        .ok()
        .and_then(|result| result.ok())
}

#[cfg(not(windows))]
async fn get_fresh_path() -> Option<String> {
    use std::time::Duration;

    use tokio::process::Command;

    async fn run(shell: &Path, login: bool) -> Option<String> {
        let mut cmd = Command::new(shell);
        if login {
            cmd.arg("-l");
        }
        cmd.arg("-c")
            .arg("printf '%s' \"$PATH\"")
            .env("TERM", "dumb")
            .kill_on_drop(true);

        const PATH_REFRESH_COMMAND_TIMEOUT: Duration = Duration::from_secs(5);

        let child = cmd.spawn().ok()?;
        let output = match tokio::time::timeout(
            PATH_REFRESH_COMMAND_TIMEOUT,
            child.wait_with_output(),
        )
        .await
        {
            Ok(Ok(output)) => output,
            Ok(Err(err)) => {
                tracing::debug!(
                    shell = %shell.display(),
                    ?err,
                    "Failed to retrieve PATH from login shell"
                );
                return None;
            }
            Err(_) => {
                tracing::warn!(
                    shell = %shell.display(),
                    timeout_secs = PATH_REFRESH_COMMAND_TIMEOUT.as_secs(),
                    "Timed out retrieving PATH from login shell"
                );
                return None;
            }
        };

        if !output.status.success() {
            return None;
        }
        let path = String::from_utf8(output.stdout).ok()?.trim().to_string();
        if path.is_empty() { None } else { Some(path) }
    }

    let mut paths = Vec::new();

    let shells = vec![
        (PathBuf::from("/bin/zsh"), true),
        (PathBuf::from("/bin/bash"), true),
        (PathBuf::from("/bin/sh"), false),
    ];

    let mut current_shell_name = None;
    if let Ok(shell) = std::env::var("SHELL") {
        let path = Path::new(&shell);
        if path.is_absolute() && path.is_file() {
            current_shell_name = path.file_name().and_then(OsStr::to_str).map(String::from);
            if let Some(path) = run(path, true).await {
                paths.push(path);
            }
        }
    }

    for (shell_path, login) in shells {
        if !shell_path.exists() {
            continue;
        }
        let shell_name = shell_path
            .file_name()
            .and_then(OsStr::to_str)
            .map(String::from);
        if current_shell_name != shell_name
            && let Some(path) = run(&shell_path, login).await
        {
            paths.push(path);
        }
    }

    if paths.is_empty() {
        return None;
    }

    paths
        .into_iter()
        .map(OsString::from)
        .reduce(|a, b| merge_paths(&a, &b))
        .map(|merged| merged.to_string_lossy().into_owned())
}

#[cfg(windows)]
async fn get_fresh_path() -> Option<String> {
    tokio::task::spawn_blocking(get_fresh_path_blocking)
        .await
        .ok()
        .flatten()
}

#[cfg(windows)]
fn get_fresh_path_blocking() -> Option<String> {
    use std::{
        ffi::{OsStr, OsString},
        os::windows::ffi::{OsStrExt, OsStringExt},
    };

    use winreg::{HKEY, RegKey, enums::*};

    // Expand %VARS% for registry PATH entries
    fn expand_env_vars(input: &OsStr) -> OsString {
        use windows_sys::Win32::System::Environment::ExpandEnvironmentStringsW;

        let wide: Vec<u16> = input.encode_wide().chain(Some(0)).collect();
        unsafe {
            let needed = ExpandEnvironmentStringsW(wide.as_ptr(), std::ptr::null_mut(), 0);
            if needed == 0 {
                return input.to_os_string();
            }
            let mut buf = vec![0u16; needed as usize];
            let written = ExpandEnvironmentStringsW(wide.as_ptr(), buf.as_mut_ptr(), needed);
            if written == 0 {
                return input.to_os_string();
            }
            // written includes the trailing NUL when it fits
            OsString::from_wide(&buf[..(written as usize).saturating_sub(1)])
        }
    }

    fn read_registry_path(root: HKEY, subkey: &str) -> Option<OsString> {
        let key = RegKey::predef(root)
            .open_subkey_with_flags(subkey, KEY_READ)
            .ok()?;
        key.get_value::<String, _>("Path").ok().map(OsString::from)
    }

    let mut paths: Vec<OsString> = Vec::new();

    if let Some(user_path) = read_registry_path(HKEY_CURRENT_USER, "Environment") {
        paths.push(expand_env_vars(&user_path));
    }

    if let Some(machine_path) = read_registry_path(
        HKEY_LOCAL_MACHINE,
        r"System\CurrentControlSet\Control\Session Manager\Environment",
    ) {
        paths.push(expand_env_vars(&machine_path));
    }

    if paths.is_empty() {
        return None;
    }

    paths
        .into_iter()
        .map(OsString::from)
        .reduce(|a, b| merge_paths(&a, &b))
        .map(|merged| merged.to_string_lossy().into_owned())
}
