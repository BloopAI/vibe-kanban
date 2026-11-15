//! Detects the OpenCode CLI installed on this machine.
//!
//! Vibe Kanban runs OpenCode either through its V1 HTTP/SDK executor
//! (`OPENCODE`) or through the V2 ACP executor (`OPENCODE_V2`), so the agent
//! picker asks this module which one the user actually has installed instead of
//! making them choose.

use std::time::Duration;

use serde::Serialize;
use ts_rs::TS;

/// How long `opencode --version` may take. It only prints and exits, but a
/// cold start on Windows can take a moment.
const VERSION_TIMEOUT: Duration = Duration::from_secs(5);

/// Installed OpenCode CLI, if one is on `PATH`.
#[derive(Debug, Clone, Default, Serialize, TS)]
pub struct OpencodeVersion {
    /// Full version, e.g. `2.2.7`, when it could be parsed.
    pub version: Option<String>,
    /// Major version, used to pick the executor.
    pub major: Option<u32>,
}

/// Runs `opencode --version` and parses the result. Never fails: a missing or
/// broken CLI is reported as "not detected".
pub async fn detect_installed() -> OpencodeVersion {
    let Some(version) = read_version().await else {
        return OpencodeVersion::default();
    };
    let major = version
        .split('.')
        .next()
        .and_then(|major| major.parse().ok());

    OpencodeVersion {
        version: Some(version),
        major,
    }
}

async fn read_version() -> Option<String> {
    for candidate in candidates() {
        let Some(executable) = workspace_utils::shell::resolve_executable_path(candidate).await
        else {
            continue;
        };

        let output = tokio::time::timeout(
            VERSION_TIMEOUT,
            tokio::process::Command::new(&executable)
                .arg("--version")
                .kill_on_drop(true)
                .output(),
        )
        .await;

        let Ok(Ok(output)) = output else {
            continue;
        };
        if !output.status.success() {
            continue;
        }

        if let Some(version) = parse_version(&String::from_utf8_lossy(&output.stdout)) {
            return Some(version);
        }
    }

    None
}

/// On Windows npm installs a Unix shim without an extension next to the `.cmd`
/// one, so try the runnable variants first.
fn candidates() -> &'static [&'static str] {
    #[cfg(windows)]
    {
        &["opencode.cmd", "opencode.exe", "opencode.bat", "opencode"]
    }
    #[cfg(not(windows))]
    {
        &["opencode"]
    }
}

/// First `X.Y.Z` token in the output, ignoring a `v` prefix and trailing
/// punctuation (`2.2.7`, `opencode 1.19.5`, `v2.3.0`).
fn parse_version(output: &str) -> Option<String> {
    output.split_whitespace().find_map(|token| {
        let token = token.trim_start_matches('v');
        let token = token.trim_end_matches(|c: char| !c.is_ascii_digit() && c != '.');

        let mut parts = token.split('.');
        let major = parts.next()?;
        let minor = parts.next()?;
        let patch = parts.next()?;
        let is_number = |part: &str| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit());

        if is_number(major) && is_number(minor) && is_number(patch) {
            Some(format!("{major}.{minor}.{patch}"))
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_version() {
        assert_eq!(parse_version("2.2.7\n").as_deref(), Some("2.2.7"));
        assert_eq!(parse_version("1.19.5").as_deref(), Some("1.19.5"));
    }

    #[test]
    fn parses_prefixed_version() {
        assert_eq!(parse_version("opencode 2.3.0").as_deref(), Some("2.3.0"));
        assert_eq!(parse_version("v1.4.7").as_deref(), Some("1.4.7"));
        assert_eq!(parse_version("2.2.7.").as_deref(), Some("2.2.7"));
    }

    #[test]
    fn ignores_non_versions() {
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("opencode dev"), None);
        assert_eq!(parse_version("2.2"), None);
    }
}
