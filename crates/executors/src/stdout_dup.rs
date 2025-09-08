//! Cross-platform stdout duplication utility for child processes
//!
//! Provides a single function to duplicate a child process's stdout stream.
//! Supports Unix and Windows platforms.

#[cfg(unix)]
use std::os::unix::io::{FromRawFd, IntoRawFd, OwnedFd};
#[cfg(windows)]
use std::os::windows::io::{FromRawHandle, IntoRawHandle, OwnedHandle};

use command_group::AsyncGroupChild;
use futures::{StreamExt, stream::BoxStream};
use tokio::io::{AsyncWrite, AsyncWriteExt};
use tokio_stream::wrappers::UnboundedReceiverStream;
use tokio_util::io::ReaderStream;

use crate::executors::ExecutorError;

/// Duplicate stdout from AsyncGroupChild.
///
/// Creates a stream that mirrors stdout of child process without consuming it.
///
/// # Returns
/// A stream of `io::Result<String>` that receives a copy of all stdout data.
pub fn duplicate_stdout(
    child: &mut AsyncGroupChild,
) -> Result<BoxStream<'static, std::io::Result<String>>, ExecutorError> {
    // The implementation strategy is:
    // 1. create a new file descriptor.
    // 2. read the original stdout file descriptor.
    // 3. write the data to both the new file descriptor and a duplicate stream.

    // Take the original stdout
    let original_stdout = child.inner().stdout.take().ok_or_else(|| {
        ExecutorError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Child process has no stdout",
        ))
    })?;

    // Create a new file descriptor in a cross-platform way (using os_pipe crate)
    let (pipe_reader, pipe_writer) = os_pipe::pipe().map_err(|e| {
        ExecutorError::Io(std::io::Error::other(format!("Failed to create pipe: {e}")))
    })?;
    // Use fd as new child stdout
    child.inner().stdout = Some(wrap_fd_as_child_stdout(pipe_reader)?);

    // Obtain writer from fd
    let mut fd_writer = wrap_fd_as_tokio_writer(pipe_writer)?;

    // Create the duplicate stdout stream
    let (dup_writer, dup_reader) =
        tokio::sync::mpsc::unbounded_channel::<std::io::Result<String>>();

    // Read original stdout and write to both new ChildStdout and duplicate stream
    tokio::spawn(async move {
        let mut stdout_stream = ReaderStream::new(original_stdout);

        while let Some(res) = stdout_stream.next().await {
            match res {
                Ok(data) => {
                    let _ = fd_writer.write_all(&data).await;

                    let string_chunk = String::from_utf8_lossy(&data).into_owned();
                    let _ = dup_writer.send(Ok(string_chunk));
                }
                Err(err) => {
                    tracing::error!("Error reading from child stdout: {}", err);
                    let _ = dup_writer.send(Err(err));
                }
            }
        }
    });

    // Return the channel receiver as a boxed stream
    Ok(Box::pin(UnboundedReceiverStream::new(dup_reader)))
}

/// Handle to append additional lines into the child's stdout stream.
pub struct StdoutAppender {
    tx: tokio::sync::mpsc::UnboundedSender<String>,
}

impl StdoutAppender {
    pub fn append_line<S: Into<String>>(&self, line: S) {
        // Best-effort; ignore send errors if writer task ended
        let _ = self.tx.send(line.into());
    }
}

/// Tee the child's stdout and provide both a duplicate stream and an appender to write additional
/// lines into the child's stdout. This keeps the original stdout functional and mirrors output to
/// the returned duplicate stream.
pub fn tee_stdout_with_appender(
    child: &mut AsyncGroupChild,
) -> Result<(BoxStream<'static, std::io::Result<String>>, StdoutAppender), ExecutorError> {
    // Take original stdout
    let original_stdout = child.inner().stdout.take().ok_or_else(|| {
        ExecutorError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Child process has no stdout",
        ))
    })?;

    // Create replacement pipe and set as new child stdout
    let (pipe_reader, pipe_writer) = os_pipe::pipe().map_err(|e| {
        ExecutorError::Io(std::io::Error::other(format!("Failed to create pipe: {e}")))
    })?;
    child.inner().stdout = Some(wrap_fd_as_child_stdout(pipe_reader)?);

    // Single shared writer for both original stdout forwarding and injected lines
    let writer = wrap_fd_as_tokio_writer(pipe_writer)?;
    let shared_writer = std::sync::Arc::new(tokio::sync::Mutex::new(writer));

    // Create duplicate stream publisher
    let (dup_tx, dup_rx) = tokio::sync::mpsc::unbounded_channel::<std::io::Result<String>>();
    // Create injector channel
    let (inj_tx, mut inj_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Task 1: forward original stdout to child stdout and duplicate stream
    {
        let shared_writer = shared_writer.clone();
        tokio::spawn(async move {
            let mut stdout_stream = ReaderStream::new(original_stdout);
            while let Some(res) = stdout_stream.next().await {
                match res {
                    Ok(data) => {
                        // forward to child stdout
                        let mut w = shared_writer.lock().await;
                        let _ = w.write_all(&data).await;
                        // publish duplicate
                        let string_chunk = String::from_utf8_lossy(&data).into_owned();
                        let _ = dup_tx.send(Ok(string_chunk));
                    }
                    Err(err) => {
                        let _ = dup_tx.send(Err(err));
                    }
                }
            }
        });
    }

    // Task 2: write injected lines to child stdout
    {
        let shared_writer = shared_writer.clone();
        tokio::spawn(async move {
            while let Some(line) = inj_rx.recv().await {
                let mut data = line.into_bytes();
                data.push(b'\n');
                let mut w = shared_writer.lock().await;
                let _ = w.write_all(&data).await;
            }
        });
    }

    Ok((
        Box::pin(UnboundedReceiverStream::new(dup_rx)),
        StdoutAppender { tx: inj_tx },
    ))
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
