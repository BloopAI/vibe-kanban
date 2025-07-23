use std::{
    pin::Pin,
    task::{Context, Poll},
};

use async_trait::async_trait;
use tokio::io::AsyncRead;

use crate::command_runner::{
    CommandError, CommandExecutor, CommandExitStatus, CommandRunnerArgs, CommandStream,
    ProcessHandle,
};

pub struct RemoteCommandExecutor {
    cloud_server_url: String,
}

impl Default for RemoteCommandExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl RemoteCommandExecutor {
    pub fn new() -> Self {
        let cloud_server_url = std::env::var("CLOUD_SERVER_URL")
            .unwrap_or_else(|_| "http://localhost:8000".to_string());
        Self { cloud_server_url }
    }
}

#[async_trait]
impl CommandExecutor for RemoteCommandExecutor {
    async fn start(
        &self,
        request: &CommandRunnerArgs,
    ) -> Result<Box<dyn ProcessHandle>, CommandError> {
        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/commands", self.cloud_server_url))
            .json(request)
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

        Ok(Box::new(RemoteProcessHandle::new(
            process_id.to_string(),
            self.cloud_server_url.clone(),
        )))
    }
}

pub struct RemoteProcessHandle {
    process_id: String,
    cloud_server_url: String,
}

impl RemoteProcessHandle {
    pub fn new(process_id: String, cloud_server_url: String) -> Self {
        Self {
            process_id,
            cloud_server_url,
        }
    }
}

#[async_trait]
impl ProcessHandle for RemoteProcessHandle {
    async fn try_wait(&mut self) -> Result<Option<CommandExitStatus>, CommandError> {
        // Make HTTP request to get status from cloud server
        let client = reqwest::Client::new();
        let response = client
            .get(format!(
                "{}/commands/{}/status",
                self.cloud_server_url, self.process_id
            ))
            .send()
            .await
            .map_err(|e| CommandError::StatusCheckFailed {
                error: std::io::Error::other(e),
            })?;

        if !response.status().is_success() {
            if response.status() == reqwest::StatusCode::NOT_FOUND {
                return Err(CommandError::StatusCheckFailed {
                    error: std::io::Error::new(std::io::ErrorKind::NotFound, "Process not found"),
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

        let data = result["data"]
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
                Some(self.process_id.clone()),
                None,
            )))
        }
    }

    async fn wait(&mut self) -> Result<CommandExitStatus, CommandError> {
        // Poll the status endpoint until process completes
        loop {
            let client = reqwest::Client::new();
            let response = client
                .get(format!(
                    "{}/commands/{}/status",
                    self.cloud_server_url, self.process_id
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

            if !running {
                // Process completed, extract exit status and return
                let exit_code = data["exit_code"].as_i64().map(|c| c as i32);
                let success = data["success"].as_bool().unwrap_or(false);

                return Ok(CommandExitStatus::from_remote(
                    exit_code,
                    success,
                    Some(self.process_id.clone()),
                    None,
                ));
            }

            // Wait a bit before polling again
            tokio::time::sleep(tokio::time::Duration::from_millis(20)).await;
        }
    }

    async fn kill(&mut self) -> Result<(), CommandError> {
        let client = reqwest::Client::new();
        let response = client
            .delete(format!(
                "{}/commands/{}",
                self.cloud_server_url, self.process_id
            ))
            .send()
            .await
            .map_err(|e| CommandError::KillFailed {
                error: std::io::Error::other(e),
            })?;

        if !response.status().is_success() {
            if response.status() == reqwest::StatusCode::NOT_FOUND {
                // Process not found, might have already finished - treat as success
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

        Ok(())
    }

    async fn stream(&mut self) -> Result<CommandStream, CommandError> {
        // Create HTTP streams for stdout and stderr concurrently
        let stdout_url = format!(
            "{}/commands/{}/stdout",
            self.cloud_server_url, self.process_id
        );
        let stderr_url = format!(
            "{}/commands/{}/stderr",
            self.cloud_server_url, self.process_id
        );

        // Create both streams concurrently using tokio::try_join!
        let (stdout_result, stderr_result) =
            tokio::try_join!(HTTPStream::new(stdout_url), HTTPStream::new(stderr_url))?;

        let stdout_stream: Option<Box<dyn AsyncRead + Unpin + Send>> =
            Some(Box::new(stdout_result) as Box<dyn AsyncRead + Unpin + Send>);
        let stderr_stream: Option<Box<dyn AsyncRead + Unpin + Send>> =
            Some(Box::new(stderr_result) as Box<dyn AsyncRead + Unpin + Send>);

        Ok(CommandStream {
            stdout: stdout_stream,
            stderr: stderr_stream,
        })
    }

    fn process_id(&self) -> String {
        self.process_id.clone()
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

// Remote-specific implementations for shared types
impl CommandExitStatus {
    /// Create a CommandExitStatus for remote processes
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
}
