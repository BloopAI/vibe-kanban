//! Terminal session management service.
//!
//! This service manages interactive terminal sessions using tmux (preferred) or
//! portable-pty as a fallback. Sessions can be created, attached to, and managed
//! through a WebSocket interface.

use std::{
    collections::HashSet,
    io::Read,
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};

use dashmap::DashMap;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
    sync::{RwLock, broadcast, mpsc},
};
use tracing::{debug, error, info, warn};
use ts_rs::TS;

/// Error types for terminal session operations.
#[derive(Debug, Error)]
pub enum TerminalError {
    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Session already exists: {0}")]
    SessionAlreadyExists(String),

    #[error("Failed to create session: {0}")]
    CreateFailed(String),

    #[error("Failed to write to session: {0}")]
    WriteFailed(String),

    #[error("Failed to resize session: {0}")]
    ResizeFailed(String),

    #[error("Tmux not available")]
    TmuxNotAvailable,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Session closed")]
    SessionClosed,
}

/// Information about a terminal session.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SessionInfo {
    /// Unique session identifier
    pub id: String,
    /// Working directory of the session
    pub working_dir: String,
    /// Whether this session uses tmux
    pub is_tmux: bool,
    /// Current terminal dimensions
    pub cols: u16,
    pub rows: u16,
    /// Whether the session is still active
    pub active: bool,
}

/// Terminal output event sent to listeners.
#[derive(Debug, Clone)]
pub struct TerminalOutput {
    /// The output data
    pub data: String,
}

/// Backend for a terminal session.
enum SessionBackend {
    /// Tmux-based session (persistent)
    Tmux {
        session_name: String,
        /// Reader process for capturing output
        reader_handle: Option<tokio::task::JoinHandle<()>>,
    },
    /// PTY-based session using portable-pty (ephemeral)
    Pty {
        /// Writer channel to send input to the PTY
        writer: mpsc::Sender<Vec<u8>>,
        /// Handle to the reader task
        reader_handle: tokio::task::JoinHandle<()>,
        /// Handle to resize the PTY
        pty_master: Arc<std::sync::Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    },
}

/// A terminal session.
struct TerminalSession {
    id: String,
    working_dir: PathBuf,
    cols: u16,
    rows: u16,
    backend: SessionBackend,
    /// Broadcast channel for output
    output_tx: broadcast::Sender<TerminalOutput>,
}

impl TerminalSession {
    fn info(&self) -> SessionInfo {
        SessionInfo {
            id: self.id.clone(),
            working_dir: self.working_dir.to_string_lossy().to_string(),
            is_tmux: matches!(self.backend, SessionBackend::Tmux { .. }),
            cols: self.cols,
            rows: self.rows,
            active: true,
        }
    }
}

/// Manager for terminal sessions.
///
/// This is the main entry point for creating and managing terminal sessions.
/// It supports both tmux-based sessions (preferred) and PTY-based sessions
/// as a fallback when tmux is not available.
pub struct TerminalSessionManager {
    sessions: Arc<DashMap<String, Arc<RwLock<TerminalSession>>>>,
    creating: Arc<tokio::sync::Mutex<HashSet<String>>>,
    use_tmux: bool,
    tmux_path: Option<PathBuf>,
}

impl Clone for TerminalSessionManager {
    fn clone(&self) -> Self {
        Self {
            sessions: Arc::clone(&self.sessions),
            creating: Arc::clone(&self.creating),
            use_tmux: self.use_tmux,
            tmux_path: self.tmux_path.clone(),
        }
    }
}

impl Default for TerminalSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalSessionManager {
    /// Create a new TerminalSessionManager.
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            creating: Arc::new(tokio::sync::Mutex::new(HashSet::new())),
            use_tmux: false,
            tmux_path: None,
        }
    }

    /// Initialize the manager by detecting tmux availability.
    pub async fn init(&mut self) -> &mut Self {
        // TODO: Re-enable tmux once output capture is fixed
        // The pipe-pane approach doesn't work correctly for capturing output
        // For now, use PTY mode which provides reliable I/O
        let tmux_available = Self::detect_tmux_internal().await.is_some();
        if tmux_available {
            self.tmux_path = Self::detect_tmux_internal().await;
            // Temporarily disable tmux to use PTY mode instead
            // tmux output capture via pipe-pane needs rework
            self.use_tmux = false;
            info!("Tmux detected but using PTY mode for reliable I/O (tmux support coming soon)");
        } else {
            info!("Tmux not available, using PTY mode");
        }
        self
    }

    /// Check if tmux is available on the system.
    pub async fn detect_tmux() -> bool {
        Self::detect_tmux_internal().await.is_some()
    }

    async fn detect_tmux_internal() -> Option<PathBuf> {
        // Try to find tmux in PATH
        let output = Command::new("which")
            .arg("tmux")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .await
            .ok()?;

        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }

        // Fallback: check common locations
        let common_paths = [
            "/usr/bin/tmux",
            "/usr/local/bin/tmux",
            "/opt/homebrew/bin/tmux",
        ];
        for path in common_paths {
            let path = PathBuf::from(path);
            if path.exists() {
                return Some(path);
            }
        }

        None
    }

    /// Generate a deterministic session ID from a path.
    ///
    /// The ID is the first 8 characters of SHA256(path).
    pub fn generate_session_id(path: &Path) -> String {
        let mut hasher = Sha256::new();
        hasher.update(path.to_string_lossy().as_bytes());
        let hash = hasher.finalize();
        // Format first 4 bytes as hex (8 chars)
        let hex_str: String = hash[..4].iter().map(|b| format!("{:02x}", b)).collect();
        format!("vk-{}", hex_str)
    }

    /// Create a new terminal session in the specified directory.
    ///
    /// Returns the session ID on success.
    pub async fn create_session(&self, working_dir: &Path) -> Result<String, TerminalError> {
        let session_id = Self::generate_session_id(working_dir);

        // Atomically claim the session ID — hold mutex only briefly, not across await
        {
            let mut creating = self.creating.lock().await;
            if self.sessions.contains_key(&session_id) || creating.contains(&session_id) {
                return Err(TerminalError::SessionAlreadyExists(session_id));
            }
            creating.insert(session_id.clone());
        }

        // Do the async PTY/tmux work — mutex is NOT held here
        let result = self.create_session_impl(working_dir, &session_id).await;

        // Always release the claim, whether success or failure
        self.creating.lock().await.remove(&session_id);
        result
    }

    /// Inner implementation for session creation — called after the session ID has been claimed.
    async fn create_session_impl(
        &self,
        working_dir: &Path,
        session_id: &str,
    ) -> Result<String, TerminalError> {
        let (output_tx, _) = broadcast::channel(1024);
        let cols = 80;
        let rows = 24;

        let backend = if self.use_tmux {
            self.create_tmux_session(session_id, working_dir, cols, rows, output_tx.clone())
                .await?
        } else {
            self.create_pty_session(working_dir, cols, rows, output_tx.clone())
                .await?
        };

        let session = TerminalSession {
            id: session_id.to_string(),
            working_dir: working_dir.to_path_buf(),
            cols,
            rows,
            backend,
            output_tx,
        };

        self.sessions
            .insert(session_id.to_string(), Arc::new(RwLock::new(session)));

        info!(session_id = %session_id, working_dir = %working_dir.display(), "Created terminal session");

        Ok(session_id.to_string())
    }

    /// Create a tmux-based session.
    async fn create_tmux_session(
        &self,
        session_name: &str,
        working_dir: &Path,
        cols: u16,
        rows: u16,
        output_tx: broadcast::Sender<TerminalOutput>,
    ) -> Result<SessionBackend, TerminalError> {
        let tmux = self
            .tmux_path
            .as_ref()
            .ok_or(TerminalError::TmuxNotAvailable)?;

        // Check if session already exists in tmux
        let check = Command::new(tmux)
            .args(["has-session", "-t", session_name])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await?;

        if check.success() {
            debug!(session_name = %session_name, "Reusing existing tmux session");
        } else {
            // Create new tmux session
            let status = Command::new(tmux)
                .args([
                    "new-session",
                    "-d", // detached
                    "-s",
                    session_name,
                    "-x",
                    &cols.to_string(),
                    "-y",
                    &rows.to_string(),
                    "-c",
                    &working_dir.to_string_lossy(),
                ])
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .status()
                .await?;

            if !status.success() {
                return Err(TerminalError::CreateFailed(format!(
                    "tmux new-session failed with status: {}",
                    status
                )));
            }
        }

        // Start a reader task to capture tmux output
        let reader_handle = self.start_tmux_reader(session_name.to_string(), output_tx);

        Ok(SessionBackend::Tmux {
            session_name: session_name.to_string(),
            reader_handle: Some(reader_handle),
        })
    }

    /// Start a background task to read tmux output.
    fn start_tmux_reader(
        &self,
        session_name: String,
        output_tx: broadcast::Sender<TerminalOutput>,
    ) -> tokio::task::JoinHandle<()> {
        let tmux = self.tmux_path.clone().unwrap();

        tokio::spawn(async move {
            // Use tmux pipe-pane to capture output
            // First, create a pipe for reading
            let mut child = match Command::new(&tmux)
                .args([
                    "pipe-pane",
                    "-t",
                    &session_name,
                    "-o",
                    "cat", // Output to stdout
                ])
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
            {
                Ok(child) => child,
                Err(e) => {
                    error!(error = ?e, "Failed to start tmux pipe-pane");
                    return;
                }
            };

            if let Some(stdout) = child.stdout.take() {
                let mut reader = BufReader::new(stdout);
                let mut line = String::new();

                loop {
                    match reader.read_line(&mut line).await {
                        Ok(0) => break, // EOF
                        Ok(_) => {
                            let _ = output_tx.send(TerminalOutput { data: line.clone() });
                            line.clear();
                        }
                        Err(e) => {
                            debug!(error = ?e, "Error reading tmux output");
                            break;
                        }
                    }
                }
            }

            let _ = child.wait().await;
        })
    }

    /// Create a PTY-based session using portable-pty.
    async fn create_pty_session(
        &self,
        working_dir: &Path,
        cols: u16,
        rows: u16,
        output_tx: broadcast::Sender<TerminalOutput>,
    ) -> Result<SessionBackend, TerminalError> {
        // Get the user's default shell
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        let working_dir = working_dir.to_path_buf();

        // Create PTY in a blocking context since portable-pty is synchronous
        let (pty_master, writer_tx, reader_handle) = tokio::task::spawn_blocking(move || {
            // Create the PTY system
            let pty_system = native_pty_system();

            // Create a new PTY pair
            let pair = pty_system
                .openpty(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| TerminalError::CreateFailed(format!("Failed to create PTY: {}", e)))?;

            // Build the command
            let mut cmd = CommandBuilder::new(&shell);
            cmd.cwd(&working_dir);

            // Spawn the shell in the PTY
            let _child = pair.slave.spawn_command(cmd).map_err(|e| {
                TerminalError::CreateFailed(format!("Failed to spawn shell: {}", e))
            })?;

            // Get the master for reading/writing
            let master = pair.master;

            // Create a channel for writing
            let (writer_tx, mut writer_rx) = mpsc::channel::<Vec<u8>>(256);

            // Get a writer from the master
            let mut writer = master.take_writer().map_err(|e| {
                TerminalError::CreateFailed(format!("Failed to get PTY writer: {}", e))
            })?;

            // Spawn writer task (blocking)
            std::thread::spawn(move || {
                while let Some(data) = writer_rx.blocking_recv() {
                    if writer.write_all(&data).is_err() {
                        break;
                    }
                    let _ = writer.flush();
                }
            });

            // Get a reader from the master
            let mut reader = master.try_clone_reader().map_err(|e| {
                TerminalError::CreateFailed(format!("Failed to get PTY reader: {}", e))
            })?;

            // Spawn reader task in a thread (blocking I/O)
            let reader_handle = std::thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
                            if output_tx.send(TerminalOutput { data }).is_err() {
                                // No receivers, but keep reading
                            }
                        }
                        Err(e) => {
                            debug!(error = ?e, "PTY read error");
                            break;
                        }
                    }
                }
            });

            // Wrap the master for later use (resize, etc.)
            let pty_master = Arc::new(std::sync::Mutex::new(master));

            Ok::<_, TerminalError>((pty_master, writer_tx, reader_handle))
        })
        .await
        .map_err(|e| TerminalError::CreateFailed(format!("Task join error: {}", e)))??;

        // Convert the std thread handle to a tokio JoinHandle by spawning a task
        let reader_handle = tokio::task::spawn_blocking(move || {
            let _ = reader_handle.join();
        });

        Ok(SessionBackend::Pty {
            writer: writer_tx,
            reader_handle,
            pty_master,
        })
    }

    /// Write data to a session.
    pub async fn write_to_session(
        &self,
        session_id: &str,
        data: &[u8],
    ) -> Result<(), TerminalError> {
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()))?;

        let session = session.read().await;

        match &session.backend {
            SessionBackend::Tmux { session_name, .. } => {
                let tmux = self
                    .tmux_path
                    .as_ref()
                    .ok_or(TerminalError::TmuxNotAvailable)?;

                // Send keys to tmux session
                let data_str = String::from_utf8_lossy(data);
                let status = Command::new(tmux)
                    .args(["send-keys", "-t", session_name, "-l", &data_str])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .await?;

                if !status.success() {
                    return Err(TerminalError::WriteFailed(
                        "tmux send-keys failed".to_string(),
                    ));
                }
            }
            SessionBackend::Pty { writer, .. } => {
                writer
                    .send(data.to_vec())
                    .await
                    .map_err(|_| TerminalError::SessionClosed)?;
            }
        }

        Ok(())
    }

    /// Resize a session's terminal dimensions.
    pub async fn resize_session(
        &self,
        session_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), TerminalError> {
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()))?;

        let mut session = session.write().await;
        session.cols = cols;
        session.rows = rows;

        match &session.backend {
            SessionBackend::Tmux { session_name, .. } => {
                let tmux = self
                    .tmux_path
                    .as_ref()
                    .ok_or(TerminalError::TmuxNotAvailable)?;

                let status = Command::new(tmux)
                    .args([
                        "resize-window",
                        "-t",
                        session_name,
                        "-x",
                        &cols.to_string(),
                        "-y",
                        &rows.to_string(),
                    ])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .await?;

                if !status.success() {
                    warn!(
                        session_id = %session_id,
                        "tmux resize-window failed, session may not support resizing"
                    );
                }
            }
            SessionBackend::Pty { pty_master, .. } => {
                // Resize the PTY using portable-pty
                if let Ok(master) = pty_master.lock() {
                    let size = PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    };
                    if let Err(e) = master.resize(size) {
                        warn!(
                            session_id = %session_id,
                            error = ?e,
                            "PTY resize failed"
                        );
                    }
                }
            }
        }

        Ok(())
    }

    /// Kill a session.
    pub async fn kill_session(&self, session_id: &str) -> Result<(), TerminalError> {
        let session = self
            .sessions
            .remove(session_id)
            .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()))?;

        let session = session.1.write().await;

        match &session.backend {
            SessionBackend::Tmux {
                session_name,
                reader_handle,
            } => {
                // Abort the reader task if running
                if let Some(handle) = reader_handle {
                    handle.abort();
                }

                if let Some(tmux) = &self.tmux_path {
                    let _ = Command::new(tmux)
                        .args(["kill-session", "-t", session_name])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status()
                        .await;
                }
            }
            SessionBackend::Pty { reader_handle, .. } => {
                // Abort the reader task - this will cause the PTY to close
                reader_handle.abort();
            }
        }

        info!(session_id = %session_id, "Killed terminal session");

        Ok(())
    }

    /// Subscribe to output from a session.
    pub async fn subscribe(
        &self,
        session_id: &str,
    ) -> Result<broadcast::Receiver<TerminalOutput>, TerminalError> {
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()))?;

        let session = session.read().await;
        Ok(session.output_tx.subscribe())
    }

    /// List all active sessions.
    pub async fn list_sessions(&self) -> Vec<SessionInfo> {
        let mut sessions = Vec::new();

        for entry in self.sessions.iter() {
            let session = entry.value().read().await;
            sessions.push(session.info());
        }

        sessions
    }

    /// Get information about a specific session.
    pub async fn get_session(&self, session_id: &str) -> Option<SessionInfo> {
        let session = self.sessions.get(session_id)?;
        let session = session.read().await;
        Some(session.info())
    }

    /// Check if a session exists.
    pub fn session_exists(&self, session_id: &str) -> bool {
        self.sessions.contains_key(session_id)
    }

    /// Check if a session is healthy (PTY channel is still open).
    /// Returns true if the session exists and is healthy, false otherwise.
    pub async fn is_session_healthy(&self, session_id: &str) -> bool {
        let Some(session) = self.sessions.get(session_id) else {
            return false;
        };

        let session = session.read().await;
        match &session.backend {
            SessionBackend::Tmux { .. } => {
                // Tmux sessions are considered healthy if they exist
                // (tmux manages persistence)
                true
            }
            SessionBackend::Pty { writer, .. } => {
                // Check if the writer channel is still open
                !writer.is_closed()
            }
        }
    }

    /// Create a session or recreate it if it exists but is unhealthy.
    /// Returns the session ID on success.
    pub async fn create_or_recreate_session(
        &self,
        working_dir: &Path,
    ) -> Result<String, TerminalError> {
        let session_id = Self::generate_session_id(working_dir);

        // Check if session exists
        if self.session_exists(&session_id) {
            // Check if it's healthy
            if self.is_session_healthy(&session_id).await {
                // Session exists and is healthy - return existing
                return Err(TerminalError::SessionAlreadyExists(session_id));
            } else {
                // Session exists but is unhealthy - kill and recreate
                info!(session_id = %session_id, "Killing unhealthy session before recreating");
                if let Err(e) = self.kill_session(&session_id).await {
                    warn!(session_id = %session_id, error = ?e, "Failed to kill unhealthy session");
                }
            }
        }

        // Create new session
        self.create_session(working_dir).await
    }

    /// Get the number of active sessions.
    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    /// Check if tmux is being used.
    pub fn is_using_tmux(&self) -> bool {
        self.use_tmux
    }

    /// Attach to an existing tmux session (reconnection support).
    pub async fn attach_session(&self, session_id: &str) -> Result<(), TerminalError> {
        if !self.session_exists(session_id) {
            // Try to find in tmux
            if self.use_tmux
                && let Some(tmux) = &self.tmux_path
            {
                let check = Command::new(tmux)
                    .args(["has-session", "-t", session_id])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .await?;

                if check.success() {
                    // Session exists in tmux, recreate our tracking
                    let (output_tx, _) = broadcast::channel(1024);
                    let reader_handle =
                        self.start_tmux_reader(session_id.to_string(), output_tx.clone());

                    let session = TerminalSession {
                        id: session_id.to_string(),
                        working_dir: PathBuf::from("."), // Unknown, but session exists
                        cols: 80,
                        rows: 24,
                        backend: SessionBackend::Tmux {
                            session_name: session_id.to_string(),
                            reader_handle: Some(reader_handle),
                        },
                        output_tx,
                    };

                    self.sessions
                        .insert(session_id.to_string(), Arc::new(RwLock::new(session)));

                    info!(session_id = %session_id, "Reattached to existing tmux session");
                    return Ok(());
                }
            }

            return Err(TerminalError::SessionNotFound(session_id.to_string()));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    #[test]
    fn test_generate_session_id() {
        let path1 = PathBuf::from("/home/user/project1");
        let path2 = PathBuf::from("/home/user/project2");

        let id1 = TerminalSessionManager::generate_session_id(&path1);
        let id2 = TerminalSessionManager::generate_session_id(&path2);

        // IDs should be deterministic
        assert_eq!(id1, TerminalSessionManager::generate_session_id(&path1));
        assert_eq!(id2, TerminalSessionManager::generate_session_id(&path2));

        // Different paths should have different IDs
        assert_ne!(id1, id2);

        // IDs should have the expected format
        assert!(id1.starts_with("vk-"));
        assert_eq!(id1.len(), 11); // "vk-" + 8 hex chars
    }

    #[test]
    fn test_session_id_is_deterministic() {
        let path = PathBuf::from("/tmp/test/workspace");

        let id1 = TerminalSessionManager::generate_session_id(&path);
        let id2 = TerminalSessionManager::generate_session_id(&path);
        let id3 = TerminalSessionManager::generate_session_id(&path);

        assert_eq!(id1, id2);
        assert_eq!(id2, id3);
    }

    #[tokio::test]
    async fn test_detect_tmux_available() {
        // This test checks if tmux detection works
        // The result depends on whether tmux is installed
        let result = TerminalSessionManager::detect_tmux().await;
        // Just verify it doesn't panic and returns a bool
        let _ = result;
    }

    #[tokio::test]
    async fn test_manager_initialization() {
        let mut manager = TerminalSessionManager::new();
        manager.init().await;

        // Manager should be usable after init
        assert_eq!(manager.session_count(), 0);
    }

    #[tokio::test]
    async fn test_session_not_found() {
        let manager = TerminalSessionManager::new();

        let result = manager.write_to_session("nonexistent", b"test").await;
        assert!(matches!(result, Err(TerminalError::SessionNotFound(_))));

        let result = manager.resize_session("nonexistent", 80, 24).await;
        assert!(matches!(result, Err(TerminalError::SessionNotFound(_))));

        let result = manager.kill_session("nonexistent").await;
        assert!(matches!(result, Err(TerminalError::SessionNotFound(_))));
    }

    #[tokio::test]
    async fn test_session_exists() {
        let manager = TerminalSessionManager::new();

        assert!(!manager.session_exists("test-session"));
        assert_eq!(manager.session_count(), 0);
    }

    #[tokio::test]
    async fn test_list_sessions_empty() {
        let manager = TerminalSessionManager::new();
        let sessions = manager.list_sessions().await;
        assert!(sessions.is_empty());
    }

    #[tokio::test]
    async fn test_get_session_not_found() {
        let manager = TerminalSessionManager::new();
        let session = manager.get_session("nonexistent").await;
        assert!(session.is_none());
    }

    #[tokio::test]
    async fn test_create_session_in_directory() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = TerminalSessionManager::new();
        manager.init().await;

        // Create a session
        let result = manager.create_session(temp_dir.path()).await;

        // Session creation should succeed (using PTY fallback if tmux not available)
        assert!(result.is_ok());

        let session_id = result.unwrap();
        assert!(session_id.starts_with("vk-"));

        // Session should exist
        assert!(manager.session_exists(&session_id));
        assert_eq!(manager.session_count(), 1);

        // Get session info
        let info = manager.get_session(&session_id).await;
        assert!(info.is_some());
        let info = info.unwrap();
        assert_eq!(info.id, session_id);
        assert!(info.active);

        // Clean up
        let _ = manager.kill_session(&session_id).await;
    }

    #[tokio::test]
    async fn test_create_duplicate_session() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = TerminalSessionManager::new();
        manager.init().await;

        // Create first session
        let result1 = manager.create_session(temp_dir.path()).await;
        assert!(result1.is_ok());
        let session_id = result1.unwrap();

        // Try to create duplicate session
        let result2 = manager.create_session(temp_dir.path()).await;
        assert!(matches!(
            result2,
            Err(TerminalError::SessionAlreadyExists(_))
        ));

        // Clean up
        let _ = manager.kill_session(&session_id).await;
    }

    #[tokio::test]
    async fn test_kill_session() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = TerminalSessionManager::new();
        manager.init().await;

        // Create a session
        let session_id = manager.create_session(temp_dir.path()).await.unwrap();
        assert!(manager.session_exists(&session_id));

        // Kill the session
        let result = manager.kill_session(&session_id).await;
        assert!(result.is_ok());

        // Session should no longer exist
        assert!(!manager.session_exists(&session_id));
        assert_eq!(manager.session_count(), 0);
    }

    #[tokio::test]
    async fn test_write_to_session() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = TerminalSessionManager::new();
        manager.init().await;

        // Create a session
        let session_id = manager.create_session(temp_dir.path()).await.unwrap();

        // Write to the session
        let result = manager.write_to_session(&session_id, b"echo hello\n").await;
        assert!(result.is_ok());

        // Clean up
        let _ = manager.kill_session(&session_id).await;
    }

    #[tokio::test]
    async fn test_resize_session() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = TerminalSessionManager::new();
        manager.init().await;

        // Create a session
        let session_id = manager.create_session(temp_dir.path()).await.unwrap();

        // Resize the session
        let result = manager.resize_session(&session_id, 120, 40).await;
        assert!(result.is_ok());

        // Check updated dimensions
        let info = manager.get_session(&session_id).await.unwrap();
        assert_eq!(info.cols, 120);
        assert_eq!(info.rows, 40);

        // Clean up
        let _ = manager.kill_session(&session_id).await;
    }

    #[test]
    fn test_terminal_error_display() {
        let err = TerminalError::SessionNotFound("test-123".to_string());
        assert_eq!(err.to_string(), "Session not found: test-123");

        let err = TerminalError::SessionAlreadyExists("test-456".to_string());
        assert_eq!(err.to_string(), "Session already exists: test-456");

        let err = TerminalError::TmuxNotAvailable;
        assert_eq!(err.to_string(), "Tmux not available");
    }

    #[test]
    fn test_session_info_serialization() {
        let info = SessionInfo {
            id: "vk-abc12345".to_string(),
            working_dir: "/home/user/project".to_string(),
            is_tmux: true,
            cols: 80,
            rows: 24,
            active: true,
        };

        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"id\":\"vk-abc12345\""));
        assert!(json.contains("\"is_tmux\":true"));
        assert!(json.contains("\"cols\":80"));
    }

    #[test]
    fn test_manager_clone() {
        let manager1 = TerminalSessionManager::new();
        let manager2 = manager1.clone();

        // Cloned managers are independent
        assert_eq!(manager1.session_count(), 0);
        assert_eq!(manager2.session_count(), 0);
    }
}
