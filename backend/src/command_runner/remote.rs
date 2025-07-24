use std::{
    pin::Pin,
    task::{Context, Poll},
};

use async_trait::async_trait;
use base64::Engine;
use futures_util::Stream;
use reqwest_eventsource::{Event, EventSource};
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
    client: reqwest::Client,
}

impl RemoteProcessHandle {
    pub fn new(process_id: String, cloud_server_url: String) -> Self {
        Self {
            process_id,
            cloud_server_url,
            client: reqwest::Client::new(),
        }
    }

    // Helper method to get process status from the remote server
    async fn get_status(&self) -> Result<ProcessStatus, CommandError> {
        let response = self
            .client
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
        let exit_code = data["exit_code"].as_i64().map(|c| c as i32);
        let success = data["success"].as_bool().unwrap_or(false);

        Ok(ProcessStatus {
            running,
            exit_code,
            success,
        })
    }
}

// Helper struct for process status
struct ProcessStatus {
    running: bool,
    exit_code: Option<i32>,
    success: bool,
}

#[async_trait]
impl ProcessHandle for RemoteProcessHandle {
    async fn try_wait(&mut self) -> Result<Option<CommandExitStatus>, CommandError> {
        let status = self.get_status().await?;

        if status.running {
            Ok(None) // Still running
        } else {
            // Process completed, extract exit status
            Ok(Some(CommandExitStatus::from_remote(
                status.exit_code,
                status.success,
                Some(self.process_id.clone()),
                None,
            )))
        }
    }

    async fn wait(&mut self) -> Result<CommandExitStatus, CommandError> {
        // Poll the status endpoint until process completes
        loop {
            let status = self.get_status().await?;

            if !status.running {
                // Process completed, extract exit status and return
                return Ok(CommandExitStatus::from_remote(
                    status.exit_code,
                    status.success,
                    Some(self.process_id.clone()),
                    None,
                ));
            }

            // Wait a bit before polling again
            tokio::time::sleep(tokio::time::Duration::from_millis(20)).await;
        }
    }

    async fn kill(&mut self) -> Result<(), CommandError> {
        let response = self
            .client
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
            tokio::try_join!(SSEAsyncRead::new(stdout_url), SSEAsyncRead::new(stderr_url))?;

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

/// SSE-based AsyncRead wrapper that parses Server-Sent Events
pub struct SSEAsyncRead {
    event_source: EventSource,
    current_buffer: Vec<u8>,
    buffer_position: usize,
    finished: bool,
}

// SSEAsyncRead needs to be Unpin to work with the AsyncRead trait bounds
impl Unpin for SSEAsyncRead {}

impl SSEAsyncRead {
    pub async fn new(url: String) -> Result<Self, CommandError> {
        let client = reqwest::Client::new();
        let event_source =
            EventSource::new(client.get(&url)).map_err(|e| CommandError::IoError {
                error: std::io::Error::other(e),
            })?;

        Ok(Self {
            event_source,
            current_buffer: Vec::new(),
            buffer_position: 0,
            finished: false,
        })
    }
}

impl AsyncRead for SSEAsyncRead {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        if self.finished {
            return Poll::Ready(Ok(()));
        }

        loop {
            // First, try to read from current buffer if available
            if self.buffer_position < self.current_buffer.len() {
                let remaining_in_buffer = self.current_buffer.len() - self.buffer_position;
                let to_read = std::cmp::min(remaining_in_buffer, buf.remaining());

                let buffer_data =
                    &self.current_buffer[self.buffer_position..self.buffer_position + to_read];
                buf.put_slice(buffer_data);
                self.buffer_position += to_read;

                return Poll::Ready(Ok(()));
            }

            // Current buffer is exhausted, try to get the next SSE event
            match Pin::new(&mut self.event_source).poll_next(cx) {
                Poll::Ready(Some(Ok(event))) => {
                    match event {
                        Event::Open => {
                            // Connection opened, continue polling for next event
                            continue;
                        }
                        Event::Message(message) => {
                            // Handle different message types based on event type
                            match message.event.as_str() {
                                "message" | "" => {
                                    // Standard data message, decode base64 data
                                    match base64::engine::general_purpose::STANDARD
                                        .decode(&message.data)
                                    {
                                        Ok(decoded_data) => {
                                            if decoded_data.is_empty() {
                                                // Empty data, continue polling for next event
                                                continue;
                                            } else {
                                                // New data available
                                                self.current_buffer = decoded_data;
                                                self.buffer_position = 0;

                                                // Read from the new buffer
                                                let to_read = std::cmp::min(
                                                    self.current_buffer.len(),
                                                    buf.remaining(),
                                                );
                                                let buffer_data = &self.current_buffer[..to_read];
                                                buf.put_slice(buffer_data);
                                                self.buffer_position = to_read;

                                                return Poll::Ready(Ok(()));
                                            }
                                        }
                                        Err(e) => {
                                            tracing::error!("Failed to decode base64 data: {}", e);
                                            return Poll::Ready(Err(std::io::Error::other(
                                                format!("Failed to decode base64 data: {}", e),
                                            )));
                                        }
                                    }
                                }
                                "error" => {
                                    // Server sent an error event
                                    return Poll::Ready(Err(std::io::Error::other(format!(
                                        "Server error: {}",
                                        message.data
                                    ))));
                                }
                                "close" => {
                                    // Server is closing the connection
                                    self.finished = true;
                                    return Poll::Ready(Ok(()));
                                }
                                _ => {
                                    // Unknown event type, continue
                                    continue;
                                }
                            }
                        }
                    }
                }
                Poll::Ready(Some(Err(e))) => {
                    // Check if this is a normal stream end vs actual error
                    let error_msg = e.to_string();
                    if error_msg.contains("Stream ended") {
                        self.finished = true;
                        return Poll::Ready(Ok(()));
                    } else {
                        tracing::warn!("SSE stream error: {}", e);
                        return Poll::Ready(Err(std::io::Error::other(format!(
                            "SSE connection error: {}",
                            e
                        ))));
                    }
                }
                Poll::Ready(None) => {
                    // Stream ended
                    self.finished = true;
                    return Poll::Ready(Ok(()));
                }
                Poll::Pending => return Poll::Pending,
            }
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
