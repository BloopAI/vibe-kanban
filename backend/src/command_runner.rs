use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncRead;

use crate::models::Environment;

mod local;
mod remote;

pub use local::LocalCommandExecutor;
pub use remote::RemoteCommandExecutor;

// Core trait that defines the interface for command execution
#[async_trait]
pub trait CommandExecutor: Send + Sync {
    /// Start a process and return a handle to it
    async fn start(
        &self,
        request: &CommandRunnerArgs,
    ) -> Result<Box<dyn ProcessHandle>, CommandError>;
}

// Trait for managing running processes
#[async_trait]
pub trait ProcessHandle: Send + Sync {
    /// Check if the process is still running, return exit status if finished
    async fn try_wait(&mut self) -> Result<Option<CommandExitStatus>, CommandError>;

    /// Wait for the process to complete and return exit status
    async fn wait(&mut self) -> Result<CommandExitStatus, CommandError>;

    /// Kill the process
    async fn kill(&mut self) -> Result<(), CommandError>;

    /// Get streams for stdout and stderr
    async fn stream(&mut self) -> Result<CommandStream, CommandError>;

    /// Get process identifier (for debugging/logging)
    fn process_id(&self) -> String;

    /// Check current status (alias for try_wait for backward compatibility)
    async fn status(&mut self) -> Result<Option<CommandExitStatus>, CommandError> {
        self.try_wait().await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRunnerArgs {
    pub command: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
    pub env_vars: Vec<(String, String)>,
    pub stdin: Option<String>,
}

pub struct CommandRunner {
    executor: Box<dyn CommandExecutor>,
    command: Option<String>,
    args: Vec<String>,
    working_dir: Option<String>,
    env_vars: Vec<(String, String)>,
    stdin: Option<String>,
}
impl Default for CommandRunner {
    fn default() -> Self {
        Self::new()
    }
}

pub struct CommandProcess {
    handle: Box<dyn ProcessHandle>,
}

impl std::fmt::Debug for CommandProcess {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CommandProcess")
            .field("process_id", &self.handle.process_id())
            .finish()
    }
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
    /// Returns true if the process exited successfully
    pub fn success(&self) -> bool {
        self.success
    }

    /// Returns the exit code of the process, if available
    pub fn code(&self) -> Option<i32> {
        self.code
    }
}

pub struct CommandStream {
    pub stdout: Option<Box<dyn AsyncRead + Unpin + Send>>,
    pub stderr: Option<Box<dyn AsyncRead + Unpin + Send>>,
}

impl CommandRunner {
    pub fn new() -> Self {
        let env = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "local".to_string());
        let mode = env.parse().unwrap_or(Environment::Local);
        match mode {
            Environment::Cloud => CommandRunner {
                executor: Box::new(RemoteCommandExecutor::new()),
                command: None,
                args: Vec::new(),
                working_dir: None,
                env_vars: Vec::new(),
                stdin: None,
            },
            Environment::Local => CommandRunner {
                executor: Box::new(LocalCommandExecutor::new()),
                command: None,
                args: Vec::new(),
                working_dir: None,
                env_vars: Vec::new(),
                stdin: None,
            },
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
    pub fn to_args(&self) -> Option<CommandRunnerArgs> {
        Some(CommandRunnerArgs {
            command: self.command.clone()?,
            args: self.args.clone(),
            working_dir: self.working_dir.clone(),
            env_vars: self.env_vars.clone(),
            stdin: self.stdin.clone(),
        })
    }

    /// Create a CommandRunner from a CreateCommandRequest, respecting the environment
    #[allow(dead_code)]
    pub fn from_args(request: CommandRunnerArgs) -> Self {
        let mut runner = Self::new();
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
        let request = self.to_args().ok_or(CommandError::NoCommandSet)?;
        let handle = self.executor.start(&request).await?;

        Ok(CommandProcess { handle })
    }
}

impl CommandProcess {
    #[allow(dead_code)]
    pub async fn status(&mut self) -> Result<Option<CommandExitStatus>, CommandError> {
        self.handle.status().await
    }

    pub async fn try_wait(&mut self) -> Result<Option<CommandExitStatus>, CommandError> {
        self.handle.try_wait().await
    }

    pub async fn kill(&mut self) -> Result<(), CommandError> {
        self.handle.kill().await
    }

    pub async fn stream(&mut self) -> Result<CommandStream, CommandError> {
        self.handle.stream().await
    }

    #[allow(dead_code)]
    pub async fn wait(&mut self) -> Result<CommandExitStatus, CommandError> {
        self.handle.wait().await
    }
}
