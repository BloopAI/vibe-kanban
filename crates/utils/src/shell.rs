//! Cross-platform shell command utilities

use std::{
    collections::HashSet,
    env::{join_paths, split_paths},
    ffi::{OsStr, OsString},
    path::{Path, PathBuf},
    process::Stdio,
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
        UnixShell::current_shell().get_shell_command()
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

#[derive(Debug, Clone, PartialEq)]
pub enum UnixShell {
    Zsh,
    Bash,
    Sh,
    Other(String),
}

impl UnixShell {
    pub fn path(&self) -> PathBuf {
        match self {
            UnixShell::Zsh => PathBuf::from("/bin/zsh"),
            UnixShell::Bash => PathBuf::from("/bin/bash"),
            UnixShell::Sh => PathBuf::from("/bin/sh"),
            UnixShell::Other(path) => PathBuf::from(path),
        }
    }
    pub fn login(&self) -> bool {
        match self {
            UnixShell::Zsh => true,
            UnixShell::Bash => true,
            UnixShell::Sh => false,
            UnixShell::Other(_) => false,
        }
    }
    pub fn config_file(&self) -> Option<PathBuf> {
        let home = dirs::home_dir()?;
        let config_file = match self {
            UnixShell::Zsh => Some(home.join(".zshrc")),
            UnixShell::Bash => Some(home.join(".bashrc")),
            UnixShell::Sh => None,
            UnixShell::Other(_) => None,
        };
        if let Some(config_file) = config_file
            && config_file.is_file()
        {
            Some(config_file)
        } else {
            None
        }
    }

    pub fn source_command(&self) -> Option<String> {
        if let Some(source_file) = self.config_file()
            && let Ok(escaped_source_file) =
                shlex::try_quote(source_file.to_string_lossy().as_ref())
        {
            Some(format!("source {escaped_source_file}"))
        } else {
            None
        }
    }
    pub fn current_shell() -> UnixShell {
        if let Ok(shell) = std::env::var("SHELL")
            && let Some(shell) = UnixShell::from_path(Path::new(&shell))
        {
            return shell;
        }
        UnixShell::Sh
    }
    pub fn from_path(path: &Path) -> Option<UnixShell> {
        if path.is_absolute() && path.is_file() {
            if path.file_name() == Some(OsStr::new("zsh")) {
                Some(UnixShell::Zsh)
            } else if path.file_name() == Some(OsStr::new("bash")) {
                Some(UnixShell::Bash)
            } else if path.file_name() == Some(OsStr::new("sh")) {
                Some(UnixShell::Sh)
            } else {
                Some(UnixShell::Other(path.to_string_lossy().into_owned()))
            }
        } else {
            None
        }
    }
    pub fn get_shell_command(&self) -> (String, &'static str) {
        (self.path().to_string_lossy().into_owned(), "-c")
    }
}

#[cfg(not(windows))]
async fn get_fresh_path() -> Option<String> {
    use std::time::Duration;

    use tokio::process::Command;

    async fn run(shell: &UnixShell) -> Option<String> {
        let mut cmd = Command::new(shell.path());
        if shell.login() {
            cmd.arg("-l");
        }
        if let Some(source_command) = shell.source_command() {
            cmd.arg("-c")
                .arg(format!("{source_command}; printf '%s' \"$PATH\""));
        } else {
            cmd.arg("-c").arg("printf '%s' \"$PATH\"");
        }
        cmd.env("TERM", "dumb")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
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
                    shell = %shell.path().display(),
                    ?err,
                    "Failed to retrieve PATH from login shell"
                );
                return None;
            }
            Err(_) => {
                tracing::warn!(
                    shell = %shell.path().display(),
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

    let current_shell = UnixShell::current_shell();
    if let Some(path) = run(&current_shell).await {
        paths.push(path);
    }

    let shells = vec![UnixShell::Zsh, UnixShell::Bash, UnixShell::Sh];
    for shell in shells {
        if !(shell == current_shell)
            && let Some(path) = run(&shell).await
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
