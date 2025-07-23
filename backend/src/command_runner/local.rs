use std::{process::Stdio, time::Duration};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
#[cfg(unix)]
use nix::{
    sys::signal::{killpg, Signal},
    unistd::{getpgid, Pid},
};
use tokio::process::Command;

use crate::command_runner::{
    CommandError, CommandExecutor, CommandExitStatus, CommandStream, CreateCommandRequest,
    ProcessHandle,
};

pub struct LocalCommandExecutor;

impl LocalCommandExecutor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl CommandExecutor for LocalCommandExecutor {
    async fn start(
        &self,
        request: &CreateCommandRequest,
    ) -> Result<Box<dyn ProcessHandle>, CommandError> {
        let mut cmd = Command::new(&request.command);

        cmd.args(&request.args)
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(dir) = &request.working_dir {
            cmd.current_dir(dir);
        }

        for (key, val) in &request.env_vars {
            cmd.env(key, val);
        }

        let mut child = cmd.group_spawn().map_err(|e| CommandError::SpawnFailed {
            command: format!("{} {}", request.command, request.args.join(" ")),
            error: e,
        })?;

        if let Some(prompt) = &request.stdin {
            // Write prompt to stdin safely
            if let Some(mut stdin) = child.inner().stdin.take() {
                use tokio::io::AsyncWriteExt;
                stdin.write_all(prompt.as_bytes()).await?;
                stdin.shutdown().await?;
            }
        }

        Ok(Box::new(LocalProcessHandle::new(child)))
    }

    fn executor_type(&self) -> &'static str {
        "local"
    }
}

pub struct LocalProcessHandle {
    child: Option<AsyncGroupChild>,
    process_id: String,
}

impl LocalProcessHandle {
    pub fn new(mut child: AsyncGroupChild) -> Self {
        let process_id = child
            .inner()
            .id()
            .map(|id| id.to_string())
            .unwrap_or_else(|| "unknown".to_string());

        Self {
            child: Some(child),
            process_id,
        }
    }
}

#[async_trait]
impl ProcessHandle for LocalProcessHandle {
    async fn try_wait(&mut self) -> Result<Option<CommandExitStatus>, CommandError> {
        match &mut self.child {
            Some(child) => match child
                .inner()
                .try_wait()
                .map_err(|e| CommandError::StatusCheckFailed { error: e })?
            {
                Some(status) => Ok(Some(CommandExitStatus::from_local(status))),
                None => Ok(None),
            },
            None => Err(CommandError::ProcessNotStarted),
        }
    }

    async fn wait(&mut self) -> Result<CommandExitStatus, CommandError> {
        match &mut self.child {
            Some(child) => {
                let status = child
                    .wait()
                    .await
                    .map_err(|e| CommandError::KillFailed { error: e })?;
                Ok(CommandExitStatus::from_local(status))
            }
            None => Err(CommandError::ProcessNotStarted),
        }
    }

    async fn kill(&mut self) -> Result<(), CommandError> {
        match &mut self.child {
            Some(child) => {
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
                self.child = None;
                Ok(())
            }
            None => Err(CommandError::ProcessNotStarted),
        }
    }

    fn stream(&mut self) -> Result<CommandStream, CommandError> {
        match &mut self.child {
            Some(child) => {
                let stdout = child.inner().stdout.take();
                let stderr = child.inner().stderr.take();
                Ok(CommandStream::from_local(stdout, stderr))
            }
            None => Err(CommandError::ProcessNotStarted),
        }
    }

    fn process_id(&self) -> String {
        self.process_id.clone()
    }
}
