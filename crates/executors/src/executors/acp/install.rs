//! Installs ACP agents that are distributed as platform archives instead of npm
//! packages.
//!
//! The registry lists, per platform, an archive URL, an optional SHA-256 and the
//! command to run inside the extracted tree. Archives are unpacked once into
//! `<cache>/acp-agents/<id>/<version>-<platform>/` and reused on later runs.
//!
//! Extraction never writes outside the install directory: zip entries go
//! through [`zip::read::ZipFile::enclosed_name`] and tar archives through
//! [`tar::Archive::unpack`], which both reject absolute and parent-relative
//! paths.

use std::{
    collections::HashMap,
    io::{Cursor, Read},
    path::{Component, Path, PathBuf},
    sync::{Arc, LazyLock, Mutex as StdMutex},
    time::Duration,
};

use futures::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::executors::acp::registry::BinaryTarget;

/// Large binaries (Cursor, Junie) take a while on slow connections.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const MAX_ARCHIVE_BYTES: u64 = 1024 * 1024 * 1024;
/// Written last, so a half-unpacked directory is never mistaken for a finished one.
const MARKER_FILE: &str = ".installed";
const INSTALL_DIR: &str = "acp-agents";

static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(DOWNLOAD_TIMEOUT)
        .user_agent(concat!("vibe-kanban/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("failed to build ACP archive download client")
});

/// Download progress for an agent, for the settings UI.
#[derive(Debug, Clone, Default, Serialize)]
pub struct InstallProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub done: bool,
    pub error: Option<String>,
}

static PROGRESS: LazyLock<StdMutex<HashMap<String, InstallProgress>>> =
    LazyLock::new(|| StdMutex::new(HashMap::new()));

/// Serialises installs of the same agent, so a second spawn or install waits for
/// the first instead of downloading the archive again.
static INSTALL_LOCKS: LazyLock<StdMutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
    LazyLock::new(|| StdMutex::new(HashMap::new()));

/// Latest known progress for `agent_id`, if an install was started this session.
pub fn progress(agent_id: &str) -> Option<InstallProgress> {
    PROGRESS.lock().ok()?.get(agent_id).cloned()
}

fn set_progress(agent_id: &str, value: InstallProgress) {
    if let Ok(mut map) = PROGRESS.lock() {
        map.insert(agent_id.to_string(), value);
    }
}

fn update_downloaded(agent_id: &str, downloaded: u64) {
    if let Ok(mut map) = PROGRESS.lock()
        && let Some(progress) = map.get_mut(agent_id)
    {
        progress.downloaded = downloaded;
    }
}

fn install_lock(agent_id: &str) -> Arc<tokio::sync::Mutex<()>> {
    let mut locks = INSTALL_LOCKS
        .lock()
        .expect("ACP install lock registry poisoned");
    locks
        .entry(agent_id.to_string())
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
        .clone()
}

#[derive(Debug, Error)]
pub enum InstallError {
    #[error("failed to download agent archive {url}: {source}")]
    Download {
        url: String,
        #[source]
        source: reqwest::Error,
    },
    #[error("agent archive {url} is larger than {MAX_ARCHIVE_BYTES} bytes")]
    TooLarge { url: String },
    #[error("checksum mismatch for {url}: expected {expected}, got {actual}")]
    Checksum {
        url: String,
        expected: String,
        actual: String,
    },
    #[error("archive entry escapes the install directory: {path}")]
    UnsafeEntry { path: String },
    #[error("agent archive does not contain the command '{cmd}'")]
    MissingCommand { cmd: String },
    #[error("failed to unpack agent archive: {0}")]
    Unpack(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// A ready-to-run binary and the arguments/env the registry gives it.
#[derive(Debug, Clone)]
pub struct InstalledAgent {
    pub command: PathBuf,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

/// Registry platform key for the machine this build runs on.
pub fn platform_key() -> Option<&'static str> {
    let musl = cfg!(all(target_os = "linux", target_env = "musl"));
    platform_key_for(std::env::consts::OS, std::env::consts::ARCH, musl)
}

fn platform_key_for(os: &str, arch: &str, musl: bool) -> Option<&'static str> {
    Some(match (os, arch) {
        ("windows", "x86_64") => "windows-x86_64",
        ("windows", "aarch64") => "windows-aarch64",
        ("macos", "aarch64") => "darwin-aarch64",
        ("macos", "x86_64") => "darwin-x86_64",
        ("linux", "x86_64") if musl => "linux-x86_64-musl",
        ("linux", "x86_64") => "linux-x86_64",
        ("linux", "aarch64") if musl => "linux-aarch64-musl",
        ("linux", "aarch64") => "linux-aarch64",
        _ => return None,
    })
}

/// Downloads and unpacks the agent if needed, then returns its command.
///
/// Idempotent: a finished install (marker file + command present) is reused and
/// nothing is fetched.
pub async fn ensure_installed(
    agent_id: &str,
    version: &str,
    platform: &str,
    target: &BinaryTarget,
) -> Result<InstalledAgent, InstallError> {
    let lock = install_lock(agent_id);
    let _guard = lock.lock().await;

    let result = install_locked(agent_id, version, platform, target).await;

    let mut snapshot = progress(agent_id).unwrap_or_default();
    snapshot.done = true;
    match &result {
        Ok(_) => snapshot.error = None,
        Err(err) => snapshot.error = Some(err.to_string()),
    }
    set_progress(agent_id, snapshot);

    result
}

async fn install_locked(
    agent_id: &str,
    version: &str,
    platform: &str,
    target: &BinaryTarget,
) -> Result<InstalledAgent, InstallError> {
    let dir = install_dir(agent_id, version, platform);
    if dir.join(MARKER_FILE).is_file() && command_path(&dir, &target.cmd)?.is_file() {
        return installed(target, &dir);
    }

    let bytes = download(&target.archive, agent_id).await?;
    verify_checksum(&target.archive, &bytes, target.sha256.as_deref())?;

    let parent = dir
        .parent()
        .ok_or_else(|| InstallError::Unpack(format!("no parent for {}", dir.display())))?;
    tokio::fs::create_dir_all(parent).await?;

    // Unpack next to the target and rename at the end, so a concurrent spawn
    // never sees a partial tree.
    let temp = parent.join(format!(
        ".install-{}-{}",
        safe_component(version),
        uuid::Uuid::new_v4()
    ));
    tokio::fs::create_dir_all(&temp).await?;

    let unpacked = {
        let temp = temp.clone();
        let target = target.clone();
        tokio::task::spawn_blocking(move || unpack(&bytes, &target, &temp))
            .await
            .map_err(|e| InstallError::Unpack(e.to_string()))?
    };
    if let Err(e) = unpacked {
        let _ = tokio::fs::remove_dir_all(&temp).await;
        return Err(e);
    }

    set_executable(&command_path(&temp, &target.cmd)?)?;
    tokio::fs::write(temp.join(MARKER_FILE), b"ok").await?;

    if let Err(e) = tokio::fs::rename(&temp, &dir).await {
        // Another process finished first: keep its copy.
        let _ = tokio::fs::remove_dir_all(&temp).await;
        if !(dir.join(MARKER_FILE).is_file() && command_path(&dir, &target.cmd)?.is_file()) {
            return Err(e.into());
        }
    }

    installed(target, &dir)
}

/// Quotes a path for [`crate::command::CommandBuilder`], which splits its base
/// command into words. Install paths live under the user's cache dir, whose
/// path may contain spaces.
pub fn command_line(path: &Path) -> String {
    let path = path.to_string_lossy();
    if path.chars().any(char::is_whitespace) {
        format!("\"{path}\"")
    } else {
        path.into_owned()
    }
}

fn installed(target: &BinaryTarget, dir: &Path) -> Result<InstalledAgent, InstallError> {
    Ok(InstalledAgent {
        command: command_path(dir, &target.cmd)?,
        args: target.args.clone(),
        env: target.env.clone(),
    })
}

fn install_dir(agent_id: &str, version: &str, platform: &str) -> PathBuf {
    workspace_utils::cache_dir()
        .join(INSTALL_DIR)
        .join(safe_component(agent_id))
        .join(format!("{}-{}", safe_component(version), platform))
}

/// Registry ids are `[a-z0-9-]` and versions are semver, but the registry is
/// remote input: never let either escape the cache dir.
fn safe_component(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() || cleaned.chars().all(|c| c == '.') {
        "_".to_string()
    } else {
        cleaned
    }
}

fn command_path(dir: &Path, cmd: &str) -> Result<PathBuf, InstallError> {
    let relative = cmd
        .strip_prefix("./")
        .or_else(|| cmd.strip_prefix(".\\"))
        .unwrap_or(cmd);
    let relative = Path::new(relative);

    let escapes = relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)));
    if escapes {
        return Err(InstallError::UnsafeEntry {
            path: cmd.to_string(),
        });
    }

    Ok(dir.join(relative))
}

async fn download(url: &str, agent_id: &str) -> Result<Vec<u8>, InstallError> {
    let response = HTTP_CLIENT
        .get(url)
        .send()
        .await
        .map_err(|source| InstallError::Download {
            url: url.to_string(),
            source,
        })?;
    let response = response
        .error_for_status()
        .map_err(|source| InstallError::Download {
            url: url.to_string(),
            source,
        })?;

    let total = response.content_length();
    if let Some(length) = total
        && length > MAX_ARCHIVE_BYTES
    {
        return Err(InstallError::TooLarge {
            url: url.to_string(),
        });
    }
    set_progress(
        agent_id,
        InstallProgress {
            total,
            ..Default::default()
        },
    );

    let mut bytes = Vec::with_capacity(total.unwrap_or_default().min(MAX_ARCHIVE_BYTES) as usize);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|source| InstallError::Download {
            url: url.to_string(),
            source,
        })?;
        bytes.extend_from_slice(&chunk);

        if bytes.len() as u64 > MAX_ARCHIVE_BYTES {
            return Err(InstallError::TooLarge {
                url: url.to_string(),
            });
        }
        update_downloaded(agent_id, bytes.len() as u64);
    }

    Ok(bytes)
}

fn verify_checksum(url: &str, bytes: &[u8], expected: Option<&str>) -> Result<(), InstallError> {
    let Some(expected) = expected else {
        tracing::warn!(
            url,
            "ACP agent archive has no sha256, skipping verification"
        );
        return Ok(());
    };

    let actual = format!("{:x}", Sha256::digest(bytes));
    if actual.eq_ignore_ascii_case(expected.trim()) {
        Ok(())
    } else {
        Err(InstallError::Checksum {
            url: url.to_string(),
            expected: expected.trim().to_string(),
            actual,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ArchiveKind {
    Zip,
    TarGz,
    TarBz2,
    Raw,
}

fn archive_kind(url: &str) -> ArchiveKind {
    let path = url
        .split(['?', '#'])
        .next()
        .unwrap_or(url)
        .to_ascii_lowercase();

    if path.ends_with(".zip") {
        ArchiveKind::Zip
    } else if path.ends_with(".tar.gz") || path.ends_with(".tgz") {
        ArchiveKind::TarGz
    } else if path.ends_with(".tar.bz2") || path.ends_with(".tbz2") {
        ArchiveKind::TarBz2
    } else {
        ArchiveKind::Raw
    }
}

fn unpack(bytes: &[u8], target: &BinaryTarget, dest: &Path) -> Result<(), InstallError> {
    match archive_kind(&target.archive) {
        ArchiveKind::Zip => unpack_zip(bytes, dest),
        ArchiveKind::TarGz => unpack_tar(flate2::read::GzDecoder::new(Cursor::new(bytes)), dest),
        ArchiveKind::TarBz2 => unpack_tar(bzip2::read::BzDecoder::new(Cursor::new(bytes)), dest),
        ArchiveKind::Raw => {
            let path = command_path(dest, &target.cmd)?;
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, bytes)?;
            Ok(())
        }
    }
}

fn unpack_zip(bytes: &[u8], dest: &Path) -> Result<(), InstallError> {
    use std::io::Write;

    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| InstallError::Unpack(e.to_string()))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| InstallError::Unpack(e.to_string()))?;

        let Some(relative) = entry.enclosed_name() else {
            return Err(InstallError::UnsafeEntry {
                path: entry.name().to_string(),
            });
        };
        let out = dest.join(relative);

        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }

        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut file = std::fs::File::create(&out)?;
        std::io::copy(&mut entry, &mut file)?;
        file.flush()?;
    }

    Ok(())
}

fn unpack_tar<R: Read>(reader: R, dest: &Path) -> Result<(), InstallError> {
    std::fs::create_dir_all(dest)?;
    // `unpack` skips (and refuses) entries that would escape `dest`.
    tar::Archive::new(reader)
        .unpack(dest)
        .map_err(|e| InstallError::Unpack(e.to_string()))
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), InstallError> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = std::fs::metadata(path)
        .map_err(|_| InstallError::MissingCommand {
            cmd: path.display().to_string(),
        })?
        .permissions();
    permissions.set_mode(permissions.mode() | 0o755);
    std::fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(path: &Path) -> Result<(), InstallError> {
    if !path.is_file() {
        return Err(InstallError::MissingCommand {
            cmd: path.display().to_string(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    fn target(archive: &str) -> BinaryTarget {
        BinaryTarget {
            archive: archive.to_string(),
            sha256: None,
            cmd: "./bin/agent".to_string(),
            args: vec!["acp".to_string()],
            env: HashMap::from([("AGENT_MODE".to_string(), "1".to_string())]),
        }
    }

    #[test]
    fn platform_keys_match_the_registry() {
        assert_eq!(
            platform_key_for("windows", "x86_64", false),
            Some("windows-x86_64")
        );
        assert_eq!(
            platform_key_for("windows", "aarch64", false),
            Some("windows-aarch64")
        );
        assert_eq!(
            platform_key_for("macos", "aarch64", false),
            Some("darwin-aarch64")
        );
        assert_eq!(
            platform_key_for("linux", "x86_64", false),
            Some("linux-x86_64")
        );
        assert_eq!(
            platform_key_for("linux", "aarch64", true),
            Some("linux-aarch64-musl")
        );
        assert_eq!(platform_key_for("freebsd", "x86_64", false), None);
    }

    #[test]
    fn archive_kind_ignores_query_strings() {
        assert_eq!(archive_kind("https://x/a.zip"), ArchiveKind::Zip);
        assert_eq!(archive_kind("https://x/a.zip?token=1"), ArchiveKind::Zip);
        assert_eq!(archive_kind("https://x/a.tar.gz"), ArchiveKind::TarGz);
        assert_eq!(archive_kind("https://x/a.tgz#frag"), ArchiveKind::TarGz);
        assert_eq!(archive_kind("https://x/a.tar.bz2"), ArchiveKind::TarBz2);
        assert_eq!(archive_kind("https://x/a.tbz2"), ArchiveKind::TarBz2);
        assert_eq!(archive_kind("https://x/opencode.exe"), ArchiveKind::Raw);
    }

    #[test]
    fn command_path_strips_dot_prefixes() {
        let dir = Path::new("/tmp/agent");
        assert_eq!(
            command_path(dir, "./opencode.exe").unwrap(),
            dir.join("opencode.exe")
        );
        assert_eq!(command_path(dir, "goose").unwrap(), dir.join("goose"));
        #[cfg(windows)]
        assert_eq!(
            command_path(dir, ".\\bin\\devin.exe").unwrap(),
            dir.join("bin/devin.exe")
        );
    }

    #[test]
    fn command_path_rejects_escapes() {
        let dir = Path::new("/tmp/agent");
        for cmd in ["../evil", "/usr/bin/evil", "a/../../evil"] {
            assert!(
                matches!(
                    command_path(dir, cmd),
                    Err(InstallError::UnsafeEntry { .. })
                ),
                "{cmd} must be rejected"
            );
        }
        #[cfg(windows)]
        assert!(matches!(
            command_path(dir, "C:\\evil.exe"),
            Err(InstallError::UnsafeEntry { .. })
        ));
    }

    #[test]
    fn safe_component_never_escapes() {
        assert_eq!(safe_component("opencode-v2"), "opencode-v2");
        assert_eq!(safe_component("../.."), ".._..");
        assert_eq!(safe_component(".."), "_");
        assert_eq!(safe_component("a/b"), "a_b");
    }

    #[test]
    fn checksum_is_verified() {
        let bytes = b"hello";
        let digest = format!("{:x}", Sha256::digest(bytes));
        assert!(verify_checksum("https://x/a.zip", bytes, Some(&digest)).is_ok());
        assert!(matches!(
            verify_checksum("https://x/a.zip", bytes, Some(&"0".repeat(64))),
            Err(InstallError::Checksum { .. })
        ));
        assert!(verify_checksum("https://x/a.zip", bytes, None).is_ok());
    }

    #[test]
    fn zip_archive_is_unpacked() {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        writer.start_file("bin/agent", options).unwrap();
        writer.write_all(b"agent").unwrap();
        let bytes = writer.finish().unwrap().into_inner();

        let dest = tempfile::tempdir().unwrap();
        unpack(&bytes, &target("https://x/a.zip"), dest.path()).unwrap();
        assert_eq!(
            std::fs::read(dest.path().join("bin/agent")).unwrap(),
            b"agent"
        );
    }

    #[test]
    fn zip_archive_cannot_write_outside_destination() {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file("../evil.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"evil").unwrap();
        let bytes = writer.finish().unwrap().into_inner();

        let dest = tempfile::tempdir().unwrap();
        assert!(matches!(
            unpack(&bytes, &target("https://x/a.zip"), dest.path()),
            Err(InstallError::UnsafeEntry { .. })
        ));
        assert!(!dest.path().parent().unwrap().join("evil.txt").exists());
    }

    #[test]
    fn tar_gz_archive_is_unpacked() {
        let encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        let mut builder = tar::Builder::new(encoder);

        let mut header = tar::Header::new_gnu();
        header.set_size(5);
        header.set_mode(0o755);
        header.set_cksum();
        builder
            .append_data(&mut header, "bin/agent", &b"agent"[..])
            .unwrap();

        let bytes = builder.into_inner().unwrap().finish().unwrap();
        let dest = tempfile::tempdir().unwrap();
        unpack(&bytes, &target("https://x/a.tar.gz"), dest.path()).unwrap();
        assert!(dest.path().join("bin/agent").is_file());
    }

    #[test]
    fn raw_binary_is_written_to_the_command_path() {
        let dest = tempfile::tempdir().unwrap();
        unpack(b"raw", &target("https://x/agent.exe"), dest.path()).unwrap();
        assert_eq!(
            std::fs::read(dest.path().join("bin/agent")).unwrap(),
            b"raw"
        );
    }

    #[test]
    fn command_line_quotes_paths_with_spaces() {
        assert_eq!(command_line(Path::new("/opt/agent")), "/opt/agent");
        assert_eq!(
            command_line(Path::new("C:\\Users\\Jane Doe\\agent.exe")),
            "\"C:\\Users\\Jane Doe\\agent.exe\""
        );
    }
}
