use std::{
    pin::Pin,
    process::Stdio,
    task::{Context, Poll},
    time::Duration,
};

use command_group::{AsyncCommandGroup, AsyncGroupChild};
#[cfg(unix)]
use nix::{
    sys::signal::{killpg, Signal},
    unistd::{getpgid, Pid},
};
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncRead, process::Command};

use crate::models::Environment;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCommandRequest {
    pub command: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
    pub env_vars: Vec<(String, String)>,
    pub stdin: Option<String>,
}

#[derive(Debug, Clone)]
pub enum CommandRunnerType {
    Local,
    Remote,
}

#[derive(Debug, Clone)]
pub struct CommandRunner {
    runner_type: CommandRunnerType,
    command: Option<String>,
    args: Vec<String>,
    working_dir: Option<String>,
    env_vars: Vec<(String, String)>,
    stdin: Option<String>,
}

#[derive(Debug)]
pub enum ProcessHandle {
    Local(AsyncGroupChild),
    Remote {
        process_id: String,
        cloud_server_url: String,
    },
}

#[derive(Debug)]
pub struct CommandProcess {
    handle: Option<ProcessHandle>,
}

#[derive(Debug)]
pub enum CommandError {
    SpawnFailed {
        command: String,
        error: std::io::Error,
    },
    StatusCheckFailed {
        error: std::io::Error,
    },
    KillFailed {
        error: std::io::Error,
    },
    ProcessNotStarted,
    NoCommandSet,
    IoError {
        error: std::io::Error,
    },
}
impl From<std::io::Error> for CommandError {
    fn from(error: std::io::Error) -> Self {
        CommandError::IoError { error }
    }
}
impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandError::SpawnFailed { command, error } => {
                write!(f, "Failed to spawn command '{}': {}", command, error)
            }
            CommandError::StatusCheckFailed { error } => {
                write!(f, "Failed to check command status: {}", error)
            }
            CommandError::KillFailed { error } => {
                write!(f, "Failed to kill command: {}", error)
            }
            CommandError::ProcessNotStarted => {
                write!(f, "Process has not been started yet")
            }
            CommandError::NoCommandSet => {
                write!(f, "No command has been set")
            }
            CommandError::IoError { error } => {
                write!(f, "Failed to spawn command: {}", error)
            }
        }
    }
}

impl std::error::Error for CommandError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandExitStatus {
    /// Exit code (0 for success on most platforms)
    code: Option<i32>,
    /// Whether the process exited successfully
    success: bool,
    /// Unix signal that terminated the process (Unix only)
    #[cfg(unix)]
    signal: Option<i32>,
    /// Optional remote process identifier for cloud execution
    remote_process_id: Option<String>,
    /// Optional session identifier for remote execution tracking
    remote_session_id: Option<String>,
}

impl CommandExitStatus {
    /// Create a CommandExitStatus from a std::process::ExitStatus (for local processes)
    pub fn from_local(status: std::process::ExitStatus) -> Self {
        Self {
            code: status.code(),
            success: status.success(),
            #[cfg(unix)]
            signal: {
                use std::os::unix::process::ExitStatusExt;
                status.signal()
            },
            remote_process_id: None,
            remote_session_id: None,
        }
    }

    /// Create a CommandExitStatus for remote processes
    #[allow(dead_code)]
    pub fn from_remote(
        code: Option<i32>,
        success: bool,
        remote_process_id: Option<String>,
        remote_session_id: Option<String>,
    ) -> Self {
        Self {
            code,
            success,
            #[cfg(unix)]
            signal: None,
            remote_process_id,
            remote_session_id,
        }
    }

    /// Returns true if the process exited successfully
    pub fn success(&self) -> bool {
        self.success
    }

    /// Returns the exit code of the process, if available
    pub fn code(&self) -> Option<i32> {
        self.code
    }

    /// Returns the signal that terminated the process (Unix only)
    #[cfg(unix)]
    #[allow(dead_code)]
    pub fn signal(&self) -> Option<i32> {
        self.signal
    }

    /// Returns the remote process ID, if this was a remote execution
    #[allow(dead_code)]
    pub fn remote_process_id(&self) -> Option<&str> {
        self.remote_process_id.as_deref()
    }

    /// Returns the remote session ID, if this was a remote execution
    #[allow(dead_code)]
    pub fn remote_session_id(&self) -> Option<&str> {
        self.remote_session_id.as_deref()
    }
}

pub struct CommandStream {
    pub stdout: Option<Box<dyn AsyncRead + Unpin + Send>>,
    pub stderr: Option<Box<dyn AsyncRead + Unpin + Send>>,
}

impl CommandStream {
    /// Create a CommandStream from local process streams
    pub fn from_local(
        stdout: Option<tokio::process::ChildStdout>,
        stderr: Option<tokio::process::ChildStderr>,
    ) -> Self {
        Self {
            stdout: stdout.map(|s| Box::new(s) as Box<dyn AsyncRead + Unpin + Send>),
            stderr: stderr.map(|s| Box::new(s) as Box<dyn AsyncRead + Unpin + Send>),
        }
    }

    /// Create a CommandStream from generic AsyncRead streams
    #[allow(dead_code)]
    pub fn from_streams(
        stdout: Option<Box<dyn AsyncRead + Unpin + Send>>,
        stderr: Option<Box<dyn AsyncRead + Unpin + Send>>,
    ) -> Self {
        Self { stdout, stderr }
    }

    /// Create empty CommandStream (no streams available)
    #[allow(dead_code)]
    pub fn empty() -> Self {
        Self {
            stdout: None,
            stderr: None,
        }
    }
}

/// HTTP-based AsyncRead wrapper for true streaming
pub struct HTTPStream {
    stream: Pin<Box<dyn futures_util::Stream<Item = Result<Vec<u8>, reqwest::Error>> + Send>>,
    current_chunk: Vec<u8>,
    chunk_position: usize,
    finished: bool,
}

// HTTPStream needs to be Unpin to work with the AsyncRead trait bounds
impl Unpin for HTTPStream {}

impl HTTPStream {
    pub async fn new(url: String) -> Result<Self, CommandError> {
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| CommandError::IoError {
                error: std::io::Error::other(e),
            })?;

        if !response.status().is_success() {
            return Err(CommandError::IoError {
                error: std::io::Error::other(format!(
                    "HTTP request failed with status: {}",
                    response.status()
                )),
            });
        }

        // Use chunk() method to create a stream
        Ok(Self {
            stream: Box::pin(futures_util::stream::unfold(
                response,
                |mut resp| async move {
                    match resp.chunk().await {
                        Ok(Some(chunk)) => Some((Ok(chunk.to_vec()), resp)),
                        Ok(None) => None,
                        Err(e) => Some((Err(e), resp)),
                    }
                },
            )),
            current_chunk: Vec::new(),
            chunk_position: 0,
            finished: false,
        })
    }
}

impl AsyncRead for HTTPStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        if self.finished {
            return Poll::Ready(Ok(()));
        }

        // First, try to read from current chunk if available
        if self.chunk_position < self.current_chunk.len() {
            let remaining_in_chunk = self.current_chunk.len() - self.chunk_position;
            let to_read = std::cmp::min(remaining_in_chunk, buf.remaining());

            let chunk_data =
                &self.current_chunk[self.chunk_position..self.chunk_position + to_read];
            buf.put_slice(chunk_data);
            self.chunk_position += to_read;

            return Poll::Ready(Ok(()));
        }

        // Current chunk is exhausted, try to get the next chunk
        match self.stream.as_mut().poll_next(cx) {
            Poll::Ready(Some(Ok(chunk))) => {
                if chunk.is_empty() {
                    // Empty chunk, mark as finished
                    self.finished = true;
                    Poll::Ready(Ok(()))
                } else {
                    // New chunk available
                    self.current_chunk = chunk;
                    self.chunk_position = 0;

                    // Read from the new chunk
                    let to_read = std::cmp::min(self.current_chunk.len(), buf.remaining());
                    let chunk_data = &self.current_chunk[..to_read];
                    buf.put_slice(chunk_data);
                    self.chunk_position = to_read;

                    Poll::Ready(Ok(()))
                }
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Err(std::io::Error::other(e))),
            Poll::Ready(None) => {
                // Stream ended
                self.finished = true;
                Poll::Ready(Ok(()))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

impl Default for CommandRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl CommandRunner {
    pub fn new() -> Self {
        let env = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "local".to_string());
        let mode = env.parse().unwrap_or(Environment::Local);
        match mode {
            Environment::Cloud => Self::new_remote(),
            Environment::Local => Self::new_local(),
        }
    }

    pub fn new_local() -> Self {
        Self {
            runner_type: CommandRunnerType::Local,
            command: None,
            args: Vec::new(),
            working_dir: None,
            env_vars: Vec::new(),
            stdin: None,
        }
    }

    pub fn new_remote() -> Self {
        Self {
            runner_type: CommandRunnerType::Remote,
            command: None,
            args: Vec::new(),
            working_dir: None,
            env_vars: Vec::new(),
            stdin: None,
        }
    }

    pub fn command(&mut self, cmd: &str) -> &mut Self {
        self.command = Some(cmd.to_string());
        self
    }

    pub fn get_program(&self) -> &str {
        self.command.as_deref().unwrap_or("")
    }

    pub fn get_args(&self) -> &[String] {
        &self.args
    }

    pub fn get_current_dir(&self) -> Option<&str> {
        self.working_dir.as_deref()
    }

    pub fn arg(&mut self, arg: &str) -> &mut Self {
        self.args.push(arg.to_string());
        self
    }

    pub fn stdin(&mut self, prompt: &str) -> &mut Self {
        self.stdin = Some(prompt.to_string());
        self
    }

    pub fn working_dir(&mut self, dir: &str) -> &mut Self {
        self.working_dir = Some(dir.to_string());
        self
    }

    pub fn env(&mut self, key: &str, val: &str) -> &mut Self {
        self.env_vars.push((key.to_string(), val.to_string()));
        self
    }

    /// Convert the current CommandRunner state to a CreateCommandRequest
    pub fn to_request(&self) -> Option<CreateCommandRequest> {
        Some(CreateCommandRequest {
            command: self.command.clone()?,
            args: self.args.clone(),
            working_dir: self.working_dir.clone(),
            env_vars: self.env_vars.clone(),
            stdin: self.stdin.clone(),
        })
    }

    /// Create a local CommandRunner from a CreateCommandRequest
    #[allow(dead_code)]
    pub fn from_request(request: CreateCommandRequest) -> Self {
        let mut runner = Self::new_local();
        runner.command(&request.command);

        for arg in &request.args {
            runner.arg(arg);
        }

        if let Some(dir) = &request.working_dir {
            runner.working_dir(dir);
        }

        for (key, value) in &request.env_vars {
            runner.env(key, value);
        }

        if let Some(stdin) = &request.stdin {
            runner.stdin(stdin);
        }

        runner
    }

    pub async fn start(&self) -> Result<CommandProcess, CommandError> {
        let command = self.command.as_ref().ok_or(CommandError::NoCommandSet)?;

        match self.runner_type {
            CommandRunnerType::Local => {
                let mut cmd = Command::new(command);

                cmd.args(&self.args)
                    .kill_on_drop(true)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped());

                if let Some(dir) = &self.working_dir {
                    cmd.current_dir(dir);
                }

                for (key, val) in &self.env_vars {
                    cmd.env(key, val);
                }

                let mut child = cmd.group_spawn().map_err(|e| CommandError::SpawnFailed {
                    command: format!("{} {}", command, self.args.join(" ")),
                    error: e,
                })?;
                if let Some(prompt) = &self.stdin {
                    // Write prompt to stdin safely
                    if let Some(mut stdin) = child.inner().stdin.take() {
                        use tokio::io::AsyncWriteExt;
                        stdin.write_all(prompt.as_bytes()).await?;
                        stdin.shutdown().await?;
                    }
                }

                Ok(CommandProcess {
                    handle: Some(ProcessHandle::Local(child)),
                })
            }
            CommandRunnerType::Remote => {
                let cloud_server_url = std::env::var("CLOUD_SERVER_URL")
                    .unwrap_or_else(|_| "http://localhost:8000".to_string());

                let request = self.to_request().ok_or(CommandError::NoCommandSet)?;

                let client = reqwest::Client::new();
                let response = client
                    .post(format!("{}/commands", cloud_server_url))
                    .json(&request)
                    .send()
                    .await
                    .map_err(|e| CommandError::IoError {
                        error: std::io::Error::other(e),
                    })?;

                let result: serde_json::Value =
                    response.json().await.map_err(|e| CommandError::IoError {
                        error: std::io::Error::other(e),
                    })?;

                let process_id =
                    result["data"]["process_id"]
                        .as_str()
                        .ok_or_else(|| CommandError::IoError {
                            error: std::io::Error::other(format!(
                                "Missing process_id in response: {}",
                                result
                            )),
                        })?;
                Ok(CommandProcess {
                    handle: Some(ProcessHandle::Remote {
                        process_id: process_id.to_string(),
                        cloud_server_url,
                    }),
                })
            }
        }
    }
}

impl CommandProcess {
    #[allow(dead_code)]
    pub async fn status(&mut self) -> Result<Option<CommandExitStatus>, CommandError> {
        match &mut self.handle {
            Some(ProcessHandle::Local(child)) => match child
                .inner()
                .try_wait()
                .map_err(|e| CommandError::StatusCheckFailed { error: e })?
            {
                Some(status) => Ok(Some(CommandExitStatus::from_local(status))),
                None => Ok(None),
            },
            Some(ProcessHandle::Remote {
                process_id,
                cloud_server_url,
            }) => {
                // Make HTTP request to get status from cloud server
                let client = reqwest::Client::new();
                let response = client
                    .get(format!(
                        "{}/commands/{}/status",
                        cloud_server_url, process_id
                    ))
                    .send()
                    .await
                    .map_err(|e| CommandError::StatusCheckFailed {
                        error: std::io::Error::other(e),
                    })?;

                if !response.status().is_success() {
                    if response.status() == reqwest::StatusCode::NOT_FOUND {
                        return Err(CommandError::StatusCheckFailed {
                            error: std::io::Error::new(
                                std::io::ErrorKind::NotFound,
                                "Process not found",
                            ),
                        });
                    } else {
                        return Err(CommandError::StatusCheckFailed {
                            error: std::io::Error::other("Status check failed"),
                        });
                    }
                }

                let result: serde_json::Value =
                    response
                        .json()
                        .await
                        .map_err(|e| CommandError::StatusCheckFailed {
                            error: std::io::Error::other(e),
                        })?;

                let data =
                    result["data"]
                        .as_object()
                        .ok_or_else(|| CommandError::StatusCheckFailed {
                            error: std::io::Error::other("Invalid response format"),
                        })?;

                let running = data["running"].as_bool().unwrap_or(false);

                if running {
                    Ok(None) // Still running
                } else {
                    // Process completed, extract exit status
                    let exit_code = data["exit_code"].as_i64().map(|c| c as i32);
                    let success = data["success"].as_bool().unwrap_or(false);

                    Ok(Some(CommandExitStatus::from_remote(
                        exit_code,
                        success,
                        Some(process_id.clone()),
                        None,
                    )))
                }
            }
            None => Err(CommandError::ProcessNotStarted),
        }
    }

    pub async fn try_wait(&mut self) -> Result<Option<CommandExitStatus>, CommandError> {
        match &mut self.handle {
            Some(ProcessHandle::Local(child)) => match child
                .inner()
                .try_wait()
                .map_err(|e| CommandError::StatusCheckFailed { error: e })?
            {
                Some(status) => Ok(Some(CommandExitStatus::from_local(status))),
                None => Ok(None),
            },
            Some(ProcessHandle::Remote {
                process_id,
                cloud_server_url,
            }) => {
                // try_wait has same behavior as status for remote processes
                let client = reqwest::Client::new();
                let response = client
                    .get(format!(
                        "{}/commands/{}/status",
                        cloud_server_url, process_id
                    ))
                    .send()
                    .await
                    .map_err(|e| CommandError::StatusCheckFailed {
                        error: std::io::Error::other(e),
                    })?;

                if !response.status().is_success() {
                    if response.status() == reqwest::StatusCode::NOT_FOUND {
                        return Err(CommandError::StatusCheckFailed {
                            error: std::io::Error::new(
                                std::io::ErrorKind::NotFound,
                                "Process not found",
                            ),
                        });
                    } else {
                        return Err(CommandError::StatusCheckFailed {
                            error: std::io::Error::other("Status check failed"),
                        });
                    }
                }

                let result: serde_json::Value =
                    response
                        .json()
                        .await
                        .map_err(|e| CommandError::StatusCheckFailed {
                            error: std::io::Error::other(e),
                        })?;

                let data =
                    result["data"]
                        .as_object()
                        .ok_or_else(|| CommandError::StatusCheckFailed {
                            error: std::io::Error::other("Invalid response format"),
                        })?;

                let running = data["running"].as_bool().unwrap_or(false);

                if running {
                    Ok(None) // Still running
                } else {
                    // Process completed, extract exit status
                    let exit_code = data["exit_code"].as_i64().map(|c| c as i32);
                    let success = data["success"].as_bool().unwrap_or(false);

                    Ok(Some(CommandExitStatus::from_remote(
                        exit_code,
                        success,
                        Some(process_id.clone()),
                        None,
                    )))
                }
            }
            None => Err(CommandError::ProcessNotStarted),
        }
    }

    pub async fn kill(&mut self) -> Result<(), CommandError> {
        match &mut self.handle {
            Some(ProcessHandle::Local(child)) => {
                // hit the whole process group, not just the leader
                #[cfg(unix)]
                {
                    if let Some(pid) = child.inner().id() {
                        let pgid = getpgid(Some(Pid::from_raw(pid as i32))).map_err(|e| {
                            CommandError::KillFailed {
                                error: std::io::Error::other(e),
                            }
                        })?;

                        for sig in [Signal::SIGINT, Signal::SIGTERM, Signal::SIGKILL] {
                            if let Err(e) = killpg(pgid, sig) {
                                tracing::warn!(
                                    "Failed to send signal {:?} to process group {}: {}",
                                    sig,
                                    pgid,
                                    e
                                );
                            }
                            tokio::time::sleep(Duration::from_secs(2)).await;
                            if child
                                .inner()
                                .try_wait()
                                .map_err(|e| CommandError::StatusCheckFailed { error: e })?
                                .is_some()
                            {
                                break; // gone!
                            }
                        }
                    }
                }

                // final fallback – command_group already targets the group
                child
                    .kill()
                    .await
                    .map_err(|e| CommandError::KillFailed { error: e })?;
                child
                    .wait()
                    .await
                    .map_err(|e| CommandError::KillFailed { error: e })?; // reap

                // Clear the handle after successful kill
                self.handle = None;
                Ok(())
            }
            Some(ProcessHandle::Remote {
                process_id,
                cloud_server_url,
            }) => {
                let client = reqwest::Client::new();
                let response = client
                    .delete(format!("{}/commands/{}", cloud_server_url, process_id))
                    .send()
                    .await
                    .map_err(|e| CommandError::KillFailed {
                        error: std::io::Error::other(e),
                    })?;

                if !response.status().is_success() {
                    if response.status() == reqwest::StatusCode::NOT_FOUND {
                        // Process not found, might have already finished - treat as success
                        self.handle = None;
                        return Ok(());
                    }

                    return Err(CommandError::KillFailed {
                        error: std::io::Error::other(format!(
                            "Remote kill failed with status: {}",
                            response.status()
                        )),
                    });
                }

                // Check if server indicates process was already completed
                if let Ok(result) = response.json::<serde_json::Value>().await {
                    if let Some(data) = result.get("data") {
                        if let Some(message) = data.as_str() {
                            tracing::info!("Kill result: {}", message);
                        }
                    }
                }

                // Clear the handle after successful kill
                self.handle = None;
                Ok(())
            }
            None => Err(CommandError::ProcessNotStarted),
        }
    }

    pub fn stream(&mut self) -> Result<CommandStream, CommandError> {
        match &mut self.handle {
            Some(ProcessHandle::Local(child)) => Ok(CommandStream::from_local(
                child.inner().stdout.take(),
                child.inner().stderr.take(),
            )),
            Some(ProcessHandle::Remote {
                process_id,
                cloud_server_url,
            }) => {
                // Create HTTP streams for stdout and stderr using a blocking approach
                let stdout_url = format!("{}/commands/{}/stdout", cloud_server_url, process_id);
                let stderr_url = format!("{}/commands/{}/stderr", cloud_server_url, process_id);

                // Use tokio spawn_blocking to avoid the nested runtime issue
                let stdout = std::thread::spawn({
                    let url = stdout_url;
                    move || {
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        rt.block_on(HTTPStream::new(url))
                    }
                })
                .join()
                .map_err(|_| CommandError::IoError {
                    error: std::io::Error::other("Failed to create stdout stream"),
                })?;

                let stderr = std::thread::spawn({
                    let url = stderr_url;
                    move || {
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        rt.block_on(HTTPStream::new(url))
                    }
                })
                .join()
                .map_err(|_| CommandError::IoError {
                    error: std::io::Error::other("Failed to create stderr stream"),
                })?;

                let stdout_stream: Option<Box<dyn AsyncRead + Unpin + Send>> = stdout
                    .ok()
                    .map(|s| Box::new(s) as Box<dyn AsyncRead + Unpin + Send>);
                let stderr_stream: Option<Box<dyn AsyncRead + Unpin + Send>> = stderr
                    .ok()
                    .map(|s| Box::new(s) as Box<dyn AsyncRead + Unpin + Send>);

                Ok(CommandStream::from_streams(stdout_stream, stderr_stream))
            }
            None => Err(CommandError::ProcessNotStarted),
        }
    }

    #[allow(dead_code)]
    pub async fn wait(&mut self) -> Result<CommandExitStatus, CommandError> {
        match &mut self.handle {
            Some(ProcessHandle::Local(child)) => {
                let status = child
                    .wait()
                    .await
                    .map_err(|e| CommandError::KillFailed { error: e })?;
                Ok(CommandExitStatus::from_local(status))
            }
            Some(ProcessHandle::Remote {
                process_id,
                cloud_server_url,
            }) => {
                // Poll the status endpoint until process completes
                loop {
                    let client = reqwest::Client::new();
                    let response = client
                        .get(format!(
                            "{}/commands/{}/status",
                            cloud_server_url, process_id
                        ))
                        .send()
                        .await
                        .map_err(|e| CommandError::StatusCheckFailed {
                            error: std::io::Error::other(e),
                        })?;

                    if !response.status().is_success() {
                        if response.status() == reqwest::StatusCode::NOT_FOUND {
                            return Err(CommandError::StatusCheckFailed {
                                error: std::io::Error::new(
                                    std::io::ErrorKind::NotFound,
                                    "Process not found",
                                ),
                            });
                        } else {
                            return Err(CommandError::StatusCheckFailed {
                                error: std::io::Error::other("Status check failed"),
                            });
                        }
                    }

                    let result: serde_json::Value =
                        response
                            .json()
                            .await
                            .map_err(|e| CommandError::StatusCheckFailed {
                                error: std::io::Error::other(e),
                            })?;

                    let data = result["data"].as_object().ok_or_else(|| {
                        CommandError::StatusCheckFailed {
                            error: std::io::Error::other("Invalid response format"),
                        }
                    })?;

                    let running = data["running"].as_bool().unwrap_or(false);

                    if !running {
                        // Process completed, extract exit status and return
                        let exit_code = data["exit_code"].as_i64().map(|c| c as i32);
                        let success = data["success"].as_bool().unwrap_or(false);

                        return Ok(CommandExitStatus::from_remote(
                            exit_code,
                            success,
                            Some(process_id.clone()),
                            None,
                        ));
                    }

                    // Wait a bit before polling again
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            }
            None => Err(CommandError::ProcessNotStarted),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::process::Stdio;

    use command_group::{AsyncCommandGroup, AsyncGroupChild};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        process::Command,
    };

    use super::*;

    // Helper function to create a comparison tokio::process::Command
    async fn create_tokio_command(
        cmd: &str,
        args: &[&str],
        working_dir: Option<&str>,
        env_vars: &[(String, String)],
        stdin_data: Option<&str>,
    ) -> Result<AsyncGroupChild, std::io::Error> {
        let mut command = Command::new(cmd);
        command
            .args(args)
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(dir) = working_dir {
            command.current_dir(dir);
        }

        for (key, val) in env_vars {
            command.env(key, val);
        }

        let mut child = command.group_spawn()?;

        // Write stdin data if provided
        if let Some(data) = stdin_data {
            if let Some(mut stdin) = child.inner().stdin.take() {
                stdin.write_all(data.as_bytes()).await?;
                stdin.shutdown().await?;
            }
        }

        Ok(child)
    }

    #[tokio::test]
    async fn test_command_execution_comparison() {
        let test_message = "hello world";

        // Test with CommandRunner
        let mut runner = CommandRunner::new_local();
        let mut process = runner
            .command("echo")
            .arg(test_message)
            .start()
            .await
            .expect("CommandRunner should start echo command");

        let mut stream = process.stream().expect("Should get stream");
        let mut stdout_data = Vec::new();
        if let Some(stdout) = &mut stream.stdout {
            stdout
                .read_to_end(&mut stdout_data)
                .await
                .expect("Should read stdout");
        }
        let runner_output = String::from_utf8(stdout_data).expect("Should be valid UTF-8");

        // Test with tokio::process::Command
        let mut tokio_child = create_tokio_command("echo", &[test_message], None, &[], None)
            .await
            .expect("Should start tokio command");

        let mut tokio_stdout_data = Vec::new();
        if let Some(stdout) = tokio_child.inner().stdout.take() {
            let mut stdout = stdout;
            stdout
                .read_to_end(&mut tokio_stdout_data)
                .await
                .expect("Should read tokio stdout");
        }
        let tokio_output = String::from_utf8(tokio_stdout_data).expect("Should be valid UTF-8");

        // Both should produce the same output
        assert_eq!(runner_output.trim(), tokio_output.trim());
        assert_eq!(runner_output.trim(), test_message);
    }

    #[tokio::test]
    async fn test_stdin_handling() {
        let test_input = "test input data\n";

        // Test with CommandRunner (using cat to echo stdin)
        let mut runner = CommandRunner::new_local();
        let mut process = runner
            .command("cat")
            .stdin(test_input)
            .start()
            .await
            .expect("CommandRunner should start cat command");

        let mut stream = process.stream().expect("Should get stream");
        let mut stdout_data = Vec::new();
        if let Some(stdout) = &mut stream.stdout {
            stdout
                .read_to_end(&mut stdout_data)
                .await
                .expect("Should read stdout");
        }
        let runner_output = String::from_utf8(stdout_data).expect("Should be valid UTF-8");

        // Test with tokio::process::Command
        let mut tokio_child = create_tokio_command("cat", &[], None, &[], Some(test_input))
            .await
            .expect("Should start tokio command");

        let mut tokio_stdout_data = Vec::new();
        if let Some(stdout) = tokio_child.inner().stdout.take() {
            let mut stdout = stdout;
            stdout
                .read_to_end(&mut tokio_stdout_data)
                .await
                .expect("Should read tokio stdout");
        }
        let tokio_output = String::from_utf8(tokio_stdout_data).expect("Should be valid UTF-8");

        // Both should echo the input
        assert_eq!(runner_output, tokio_output);
        assert_eq!(runner_output, test_input);
    }

    #[tokio::test]
    async fn test_working_directory() {
        // Use pwd command to check working directory
        let test_dir = "/tmp";

        // Test with CommandRunner
        let mut runner = CommandRunner::new_local();
        let mut process = runner
            .command("pwd")
            .working_dir(test_dir)
            .start()
            .await
            .expect("CommandRunner should start pwd command");

        let mut stream = process.stream().expect("Should get stream");
        let mut stdout_data = Vec::new();
        if let Some(stdout) = &mut stream.stdout {
            stdout
                .read_to_end(&mut stdout_data)
                .await
                .expect("Should read stdout");
        }
        let runner_output = String::from_utf8(stdout_data).expect("Should be valid UTF-8");

        // Test with tokio::process::Command
        let mut tokio_child = create_tokio_command("pwd", &[], Some(test_dir), &[], None)
            .await
            .expect("Should start tokio command");

        let mut tokio_stdout_data = Vec::new();
        if let Some(stdout) = tokio_child.inner().stdout.take() {
            let mut stdout = stdout;
            stdout
                .read_to_end(&mut tokio_stdout_data)
                .await
                .expect("Should read tokio stdout");
        }
        let tokio_output = String::from_utf8(tokio_stdout_data).expect("Should be valid UTF-8");

        // Both should show the same working directory
        assert_eq!(runner_output.trim(), tokio_output.trim());
        assert!(runner_output.trim().contains(test_dir));
    }

    #[tokio::test]
    async fn test_environment_variables() {
        let test_var = "TEST_VAR";
        let test_value = "test_value_123";

        // Test with CommandRunner
        let mut runner = CommandRunner::new_local();
        let mut process = runner
            .command("printenv")
            .arg(test_var)
            .env(test_var, test_value)
            .start()
            .await
            .expect("CommandRunner should start printenv command");

        let mut stream = process.stream().expect("Should get stream");
        let mut stdout_data = Vec::new();
        if let Some(stdout) = &mut stream.stdout {
            stdout
                .read_to_end(&mut stdout_data)
                .await
                .expect("Should read stdout");
        }
        let runner_output = String::from_utf8(stdout_data).expect("Should be valid UTF-8");

        // Test with tokio::process::Command
        let env_vars = vec![(test_var.to_string(), test_value.to_string())];
        let mut tokio_child = create_tokio_command("printenv", &[test_var], None, &env_vars, None)
            .await
            .expect("Should start tokio command");

        let mut tokio_stdout_data = Vec::new();
        if let Some(stdout) = tokio_child.inner().stdout.take() {
            let mut stdout = stdout;
            stdout
                .read_to_end(&mut tokio_stdout_data)
                .await
                .expect("Should read tokio stdout");
        }
        let tokio_output = String::from_utf8(tokio_stdout_data).expect("Should be valid UTF-8");

        // Both should show the same environment variable
        assert_eq!(runner_output.trim(), tokio_output.trim());
        assert_eq!(runner_output.trim(), test_value);
    }

    #[tokio::test]
    async fn test_process_group_creation() {
        // Test that both CommandRunner and tokio::process::Command create process groups
        // We'll use a sleep command that can be easily killed

        // Test with CommandRunner
        let mut runner = CommandRunner::new_local();
        let mut process = runner
            .command("sleep")
            .arg("10") // Sleep for 10 seconds
            .start()
            .await
            .expect("CommandRunner should start sleep command");

        // Check that process is running
        let status = process.status().await.expect("Should check status");
        assert!(status.is_none(), "Process should still be running");

        // Kill the process (might fail if already exited)
        let _ = process.kill().await;

        // Wait a moment for the kill to take effect
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let final_status = process.status().await.expect("Should check final status");
        assert!(
            final_status.is_some(),
            "Process should have exited after kill"
        );

        // Test with tokio::process::Command for comparison
        let mut tokio_child = create_tokio_command("sleep", &["10"], None, &[], None)
            .await
            .expect("Should start tokio sleep command");

        // Check that process is running
        let tokio_status = tokio_child
            .inner()
            .try_wait()
            .expect("Should check tokio status");
        assert!(
            tokio_status.is_none(),
            "Tokio process should still be running"
        );

        // Kill the tokio process
        tokio_child.kill().await.expect("Should kill tokio process");

        // Wait a moment for the kill to take effect
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let tokio_final_status = tokio_child
            .inner()
            .try_wait()
            .expect("Should check tokio final status");
        assert!(
            tokio_final_status.is_some(),
            "Tokio process should have exited after kill"
        );
    }

    #[tokio::test]
    async fn test_kill_operation() {
        // Test killing processes with both implementations

        // Test CommandRunner kill
        let mut runner = CommandRunner::new_local();
        let mut process = runner
            .command("sleep")
            .arg("60") // Long sleep
            .start()
            .await
            .expect("Should start CommandRunner sleep");

        // Verify it's running
        assert!(process
            .status()
            .await
            .expect("Should check status")
            .is_none());

        // Kill and verify it stops (might fail if already exited)
        let _ = process.kill().await;

        // Give it time to die
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        let exit_status = process.status().await.expect("Should get exit status");
        assert!(exit_status.is_some(), "Process should have exited");

        // Test tokio::process::Command kill for comparison
        let mut tokio_child = create_tokio_command("sleep", &["60"], None, &[], None)
            .await
            .expect("Should start tokio sleep");

        // Verify it's running
        assert!(tokio_child
            .inner()
            .try_wait()
            .expect("Should check tokio status")
            .is_none());

        // Kill and verify it stops
        tokio_child.kill().await.expect("Should kill tokio process");

        // Give it time to die
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        let tokio_exit_status = tokio_child
            .inner()
            .try_wait()
            .expect("Should get tokio exit status");
        assert!(
            tokio_exit_status.is_some(),
            "Tokio process should have exited"
        );
    }

    #[tokio::test]
    async fn test_status_monitoring() {
        // Test status monitoring with a quick command

        // Test with CommandRunner
        let mut runner = CommandRunner::new_local();
        let mut process = runner
            .command("echo")
            .arg("quick test")
            .start()
            .await
            .expect("Should start CommandRunner echo");

        // Initially might be running or might have finished quickly
        let _initial_status = process.status().await.expect("Should check initial status");

        // Wait for completion
        let exit_status = process.wait().await.expect("Should wait for completion");
        assert!(exit_status.success(), "Echo command should succeed");

        // After wait, status should show completion
        let final_status = process.status().await.expect("Should check final status");
        assert!(
            final_status.is_some(),
            "Should have exit status after completion"
        );
        assert!(
            final_status.unwrap().success(),
            "Should show successful exit"
        );

        // Test with tokio::process::Command for comparison
        let mut tokio_child = create_tokio_command("echo", &["quick test"], None, &[], None)
            .await
            .expect("Should start tokio echo");

        // Wait for completion
        let tokio_exit_status = tokio_child
            .wait()
            .await
            .expect("Should wait for tokio completion");
        assert!(
            tokio_exit_status.success(),
            "Tokio echo command should succeed"
        );

        // After wait, status should show completion
        let tokio_final_status = tokio_child
            .inner()
            .try_wait()
            .expect("Should check tokio final status");
        assert!(
            tokio_final_status.is_some(),
            "Should have tokio exit status after completion"
        );
        assert!(
            tokio_final_status.unwrap().success(),
            "Should show tokio successful exit"
        );
    }

    #[tokio::test]
    async fn test_wait_for_completion() {
        // Test waiting for process completion with specific exit codes

        // Test successful command (exit code 0)
        let mut runner = CommandRunner::new_local();
        let mut process = runner
            .command("true") // Command that exits with 0
            .start()
            .await
            .expect("Should start true command");

        let exit_status = process
            .wait()
            .await
            .expect("Should wait for true completion");
        assert!(exit_status.success(), "true command should succeed");
        assert_eq!(exit_status.code(), Some(0), "true should exit with code 0");

        // Test failing command (exit code 1)
        let mut runner2 = CommandRunner::new_local();
        let mut process2 = runner2
            .command("false") // Command that exits with 1
            .start()
            .await
            .expect("Should start false command");

        let exit_status2 = process2
            .wait()
            .await
            .expect("Should wait for false completion");
        assert!(!exit_status2.success(), "false command should fail");
        assert_eq!(
            exit_status2.code(),
            Some(1),
            "false should exit with code 1"
        );

        // Compare with tokio::process::Command
        let mut tokio_child = create_tokio_command("true", &[], None, &[], None)
            .await
            .expect("Should start tokio true");

        let tokio_exit_status = tokio_child
            .wait()
            .await
            .expect("Should wait for tokio true");
        assert!(tokio_exit_status.success(), "tokio true should succeed");
        assert_eq!(
            tokio_exit_status.code(),
            Some(0),
            "tokio true should exit with code 0"
        );

        let mut tokio_child2 = create_tokio_command("false", &[], None, &[], None)
            .await
            .expect("Should start tokio false");

        let tokio_exit_status2 = tokio_child2
            .wait()
            .await
            .expect("Should wait for tokio false");
        assert!(!tokio_exit_status2.success(), "tokio false should fail");
        assert_eq!(
            tokio_exit_status2.code(),
            Some(1),
            "tokio false should exit with code 1"
        );
    }
}
