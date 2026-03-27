//! Cross-platform stdout duplication utility for child processes
//!
//! Provides a single function to duplicate a child process's stdout stream.
//! Supports Unix and Windows platforms.

#[cfg(unix)]
use std::os::unix::io::{FromRawFd, IntoRawFd, OwnedFd};
#[cfg(windows)]
use std::os::windows::io::{FromRawHandle, IntoRawHandle, OwnedHandle};

use command_group::AsyncGroupChild;
use tokio::io::AsyncWrite;
use workspace_utils::command_ext::GroupSpawnNoWindowExt;

use crate::executors::{ExecutorError, SpawnedChild};

/// Create a fresh stdout pipe for the child process and return an async writer
/// that writes directly to the child's new stdout.
///
/// This helper does not read or duplicate any existing stdout; it simply
/// replaces the child's stdout with a new pipe reader and returns the
/// corresponding async writer for the caller to write into.
pub fn create_stdout_pipe_writer<'b>(
    child: &mut AsyncGroupChild,
) -> Result<impl AsyncWrite + 'b, ExecutorError> {
    // Create replacement pipe and set as new child stdout
    let (pipe_reader, pipe_writer) = os_pipe::pipe().map_err(|e| {
        ExecutorError::Io(std::io::Error::other(format!("Failed to create pipe: {e}")))
    })?;
    child.inner().stdout = Some(wrap_fd_as_child_stdout(pipe_reader)?);

    // Return async writer to the caller
    wrap_fd_as_tokio_writer(pipe_writer)
}

/// Create a helper child process to be used only for stdout duplication.
pub fn spawn_local_output_process()
-> Result<(SpawnedChild, impl AsyncWrite + Send + Unpin), ExecutorError> {
    let (pipe_reader, pipe_writer) = os_pipe::pipe().map_err(|e| {
        ExecutorError::Io(std::io::Error::other(format!(
            "Failed to create stdout pipe: {e}"
        )))
    })?;

    #[cfg(unix)]
    let mut cmd = {
        let mut cmd = tokio::process::Command::new("/bin/sh");
        cmd.args(["-c", "while :; do sleep 3600; done"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        cmd
    };

    #[cfg(windows)]
    let mut cmd = {
        let mut cmd = tokio::process::Command::new("powershell.exe");
        cmd.args([
            "-NoLogo",
            "-NonInteractive",
            "-Command",
            "[System.Threading.Thread]::Sleep([int]::MaxValue)",
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
        cmd
    };

    cmd.kill_on_drop(true);

    let mut child = cmd.group_spawn_no_window()?;

    // Replace stdout with our pipe
    child.inner().stdout = Some(wrap_fd_as_child_stdout(pipe_reader)?);

    let writer = wrap_fd_as_tokio_writer(pipe_writer)?;

    let spawned = SpawnedChild {
        child,
        exit_signal: None,
        cancel: None,
    };

    Ok((spawned, writer))
}

// =========================================
// OS file descriptor helper functions
// =========================================

/// Convert os_pipe::PipeReader to tokio::process::ChildStdout
fn wrap_fd_as_child_stdout(
    pipe_reader: os_pipe::PipeReader,
) -> Result<tokio::process::ChildStdout, ExecutorError> {
    #[cfg(unix)]
    {
        // On Unix: PipeReader -> raw fd -> OwnedFd -> std::process::ChildStdout -> tokio::process::ChildStdout
        let raw_fd = pipe_reader.into_raw_fd();
        let owned_fd = unsafe { OwnedFd::from_raw_fd(raw_fd) };
        let std_stdout = std::process::ChildStdout::from(owned_fd);
        tokio::process::ChildStdout::from_std(std_stdout).map_err(ExecutorError::Io)
    }

    #[cfg(windows)]
    {
        // On Windows: PipeReader -> raw handle -> OwnedHandle -> std::process::ChildStdout -> tokio::process::ChildStdout
        let raw_handle = pipe_reader.into_raw_handle();
        let owned_handle = unsafe { OwnedHandle::from_raw_handle(raw_handle) };
        let std_stdout = std::process::ChildStdout::from(owned_handle);
        tokio::process::ChildStdout::from_std(std_stdout).map_err(ExecutorError::Io)
    }
}

/// Convert os_pipe::PipeWriter to a tokio file for async writing
fn wrap_fd_as_tokio_writer(
    pipe_writer: os_pipe::PipeWriter,
) -> Result<impl AsyncWrite, ExecutorError> {
    #[cfg(unix)]
    {
        // On Unix: PipeWriter -> raw fd -> OwnedFd -> std::fs::File -> tokio::fs::File
        let raw_fd = pipe_writer.into_raw_fd();
        let owned_fd = unsafe { OwnedFd::from_raw_fd(raw_fd) };
        let std_file = std::fs::File::from(owned_fd);
        Ok(tokio::fs::File::from_std(std_file))
    }

    #[cfg(windows)]
    {
        // On Windows: PipeWriter -> raw handle -> OwnedHandle -> std::fs::File -> tokio::fs::File
        let raw_handle = pipe_writer.into_raw_handle();
        let owned_handle = unsafe { OwnedHandle::from_raw_handle(raw_handle) };
        let std_file = std::fs::File::from(owned_handle);
        Ok(tokio::fs::File::from_std(std_file))
    }
}
