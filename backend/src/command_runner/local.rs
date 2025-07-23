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
    CommandError, CommandExecutor, CommandExitStatus, CommandRunnerArgs, CommandStream,
    ProcessHandle,
};

pub struct LocalCommandExecutor;

impl Default for LocalCommandExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalCommandExecutor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl CommandExecutor for LocalCommandExecutor {
    async fn start(
        &self,
        request: &CommandRunnerArgs,
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

    async fn stream(&mut self) -> Result<CommandStream, CommandError> {
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

// Local-specific implementations for shared types
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
}

impl CommandStream {
    /// Create a CommandStream from local process streams
    pub fn from_local(
        stdout: Option<tokio::process::ChildStdout>,
        stderr: Option<tokio::process::ChildStderr>,
    ) -> Self {
        Self {
            stdout: stdout.map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
            stderr: stderr.map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
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

    use crate::command_runner::*;

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
        // Ensure we're using local execution for this test
        std::env::set_var("ENVIRONMENT", "local");
        let test_message = "hello world";

        // Test with CommandRunner
        let mut runner = CommandRunner::new();
        let mut process = runner
            .command("echo")
            .arg(test_message)
            .start()
            .await
            .expect("CommandRunner should start echo command");

        let mut stream = process.stream().await.expect("Should get stream");
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
        // Ensure we're using local execution for this test
        std::env::set_var("ENVIRONMENT", "local");
        let test_input = "test input data\n";

        // Test with CommandRunner (using cat to echo stdin)
        let mut runner = CommandRunner::new();
        let mut process = runner
            .command("cat")
            .stdin(test_input)
            .start()
            .await
            .expect("CommandRunner should start cat command");

        let mut stream = process.stream().await.expect("Should get stream");
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
        std::env::set_var("ENVIRONMENT", "local");
        let mut runner = CommandRunner::new();
        let mut process = runner
            .command("pwd")
            .working_dir(test_dir)
            .start()
            .await
            .expect("CommandRunner should start pwd command");

        let mut stream = process.stream().await.expect("Should get stream");
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
        std::env::set_var("ENVIRONMENT", "local");
        let mut runner = CommandRunner::new();
        let mut process = runner
            .command("printenv")
            .arg(test_var)
            .env(test_var, test_value)
            .start()
            .await
            .expect("CommandRunner should start printenv command");

        let mut stream = process.stream().await.expect("Should get stream");
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
        std::env::set_var("ENVIRONMENT", "local");
        let mut runner = CommandRunner::new();
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
        std::env::set_var("ENVIRONMENT", "local");
        let mut runner = CommandRunner::new();
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
        std::env::set_var("ENVIRONMENT", "local");
        let mut runner = CommandRunner::new();
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
        std::env::set_var("ENVIRONMENT", "local");
        let mut runner = CommandRunner::new();
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
        let mut runner2 = CommandRunner::new();
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
