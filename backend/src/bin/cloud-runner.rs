use std::{collections::HashMap, sync::Arc};

use axum::{
    body::Body,
    extract::{Path, State},
    http::StatusCode,
    response::{Json, Response},
    routing::{delete, get, post},
    Router,
};
use serde::Serialize;
use tokio::sync::Mutex;
use tracing_subscriber::prelude::*;
use uuid::Uuid;
use vibe_kanban::{
    command_runner::{CommandProcess, CommandRunner, CreateCommandRequest, ProcessStatusResponse},
    models::ApiResponse,
};

// Structure to hold process and its streams
#[derive(Debug)]
struct ProcessEntry {
    process: CommandProcess,
    stdout_buffer: Arc<Mutex<Vec<u8>>>,
    stderr_buffer: Arc<Mutex<Vec<u8>>>,
    completed: Arc<Mutex<bool>>,
}

// Application state to manage running processes
#[derive(Clone)]
struct AppState {
    processes: Arc<Mutex<HashMap<String, ProcessEntry>>>,
}

// Response type for command creation
#[derive(Debug, Serialize)]
struct CreateCommandResponse {
    process_id: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cloud_runner=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Create application state
    let app_state = AppState {
        processes: Arc::new(Mutex::new(HashMap::new())),
    };

    // Build router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/commands", post(create_command))
        .route("/commands/:process_id", delete(kill_command))
        .route("/commands/:process_id/status", get(get_process_status))
        .route("/commands/:process_id/stdout", get(get_process_stdout))
        .route("/commands/:process_id/stderr", get(get_process_stderr))
        .route("/commands/:process_id/stream", get(get_process_stdout)) // Alias for stdout
        .with_state(app_state);

    // Get port from environment or default to 8000
    let port = std::env::var("PORT").unwrap_or_else(|_| "8000".to_string());
    let addr = format!("0.0.0.0:{}", port);

    tracing::info!("Cloud Runner server starting on {}", addr);

    // Start the server
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// Health check endpoint
async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success("Cloud Runner is healthy".to_string()))
}

// Create and start a new command
async fn create_command(
    State(state): State<AppState>,
    Json(request): Json<CreateCommandRequest>,
) -> Result<Json<ApiResponse<CreateCommandResponse>>, StatusCode> {
    tracing::info!("Creating command: {} {:?}", request.command, request.args);

    // Create a local command runner from the request
    let runner = CommandRunner::from_request(request);

    // Start the process
    let mut process = match runner.start().await {
        Ok(process) => process,
        Err(e) => {
            tracing::error!("Failed to start command: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Generate unique process ID
    let process_id = Uuid::new_v4().to_string();

    // Create buffers for stdout and stderr, and completion flag
    let stdout_buffer = Arc::new(Mutex::new(Vec::new()));
    let stderr_buffer = Arc::new(Mutex::new(Vec::new()));
    let completed = Arc::new(Mutex::new(false));

    // Get the streams from the process
    let mut streams = match process.stream().await {
        Ok(streams) => streams,
        Err(e) => {
            tracing::error!("Failed to get process streams: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Spawn background tasks to read from stdout and stderr
    let stdout_buffer_clone = stdout_buffer.clone();
    let stderr_buffer_clone = stderr_buffer.clone();
    let process_id_clone = process_id.clone();

    if let Some(stdout) = streams.stdout.take() {
        let process_id = process_id_clone.clone();
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut stdout = stdout;
            let mut buffer = [0u8; 8192];

            loop {
                match stdout.read(&mut buffer).await {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let mut buf = stdout_buffer_clone.lock().await;
                        buf.extend_from_slice(&buffer[..n]);
                        tracing::debug!(
                            "Read {} bytes to stdout buffer for process {}",
                            n,
                            process_id
                        );
                    }
                    Err(e) => {
                        tracing::error!("Error reading stdout for process {}: {}", process_id, e);
                        break;
                    }
                }
            }
            tracing::debug!("Stdout reading completed for process {}", process_id);
        });
    }

    if let Some(stderr) = streams.stderr.take() {
        let process_id = process_id_clone.clone();
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut stderr = stderr;
            let mut buffer = [0u8; 8192];

            loop {
                match stderr.read(&mut buffer).await {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let mut buf = stderr_buffer_clone.lock().await;
                        buf.extend_from_slice(&buffer[..n]);
                        tracing::debug!(
                            "Read {} bytes to stderr buffer for process {}",
                            n,
                            process_id
                        );
                    }
                    Err(e) => {
                        tracing::error!("Error reading stderr for process {}: {}", process_id, e);
                        break;
                    }
                }
            }
            tracing::debug!("Stderr reading completed for process {}", process_id);
        });
    }

    // Spawn a task to monitor process completion
    {
        let process_id_for_completion = process_id.clone();
        let completed_flag = completed.clone();
        let processes_ref = state.processes.clone();
        tokio::spawn(async move {
            // Wait for the process to complete
            if let Ok(mut processes) = processes_ref.try_lock() {
                if let Some(entry) = processes.get_mut(&process_id_for_completion) {
                    let _ = entry.process.wait().await;
                    *completed_flag.lock().await = true;
                    tracing::debug!("Marked process {} as completed", process_id_for_completion);
                }
            }
        });
    }

    // Create process entry
    let entry = ProcessEntry {
        process,
        stdout_buffer,
        stderr_buffer,
        completed: completed.clone(),
    };

    // Store the process entry
    {
        let mut processes = state.processes.lock().await;
        processes.insert(process_id.clone(), entry);
    }

    tracing::info!("Command started with process_id: {}", process_id);

    Ok(Json(ApiResponse::success(CreateCommandResponse {
        process_id,
    })))
}

// Kill a running command
async fn kill_command(
    State(state): State<AppState>,
    Path(process_id): Path<String>,
) -> Result<Json<ApiResponse<String>>, StatusCode> {
    tracing::info!("Killing command with process_id: {}", process_id);

    let mut processes = state.processes.lock().await;

    if let Some(mut entry) = processes.remove(&process_id) {
        // First check if the process has already finished
        match entry.process.status().await {
            Ok(Some(_)) => {
                // Process already finished, consider kill successful
                tracing::info!(
                    "Process {} already completed, kill considered successful",
                    process_id
                );
                Ok(Json(ApiResponse::success(
                    "Process was already completed".to_string(),
                )))
            }
            Ok(None) => {
                // Process still running, attempt to kill
                match entry.process.kill().await {
                    Ok(()) => {
                        tracing::info!("Successfully killed process: {}", process_id);
                        Ok(Json(ApiResponse::success(
                            "Process killed successfully".to_string(),
                        )))
                    }
                    Err(e) => {
                        tracing::error!("Failed to kill process {}: {}", process_id, e);

                        // Check if it's a "No such process" error (process finished during kill)
                        if e.to_string().contains("No such process") {
                            tracing::info!("Process {} finished during kill attempt", process_id);
                            Ok(Json(ApiResponse::success(
                                "Process finished during kill attempt".to_string(),
                            )))
                        } else {
                            Err(StatusCode::INTERNAL_SERVER_ERROR)
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to check status for process {}: {}", process_id, e);
                // Still attempt to kill
                match entry.process.kill().await {
                    Ok(()) => {
                        tracing::info!("Successfully killed process: {}", process_id);
                        Ok(Json(ApiResponse::success(
                            "Process killed successfully".to_string(),
                        )))
                    }
                    Err(e) => {
                        tracing::error!("Failed to kill process {}: {}", process_id, e);
                        Err(StatusCode::INTERNAL_SERVER_ERROR)
                    }
                }
            }
        }
    } else {
        tracing::warn!("Process not found: {}", process_id);
        Err(StatusCode::NOT_FOUND)
    }
}

// Get status of a running command
async fn get_process_status(
    State(state): State<AppState>,
    Path(process_id): Path<String>,
) -> Result<Json<ApiResponse<ProcessStatusResponse>>, StatusCode> {
    tracing::info!("Getting status for process_id: {}", process_id);

    let mut processes = state.processes.lock().await;

    if let Some(entry) = processes.get_mut(&process_id) {
        match entry.process.status().await {
            Ok(Some(exit_status)) => {
                // Process has completed
                let response = ProcessStatusResponse {
                    process_id: process_id.clone(),
                    running: false,
                    exit_code: exit_status.code(),
                    success: Some(exit_status.success()),
                };
                Ok(Json(ApiResponse::success(response)))
            }
            Ok(None) => {
                // Process is still running
                let response = ProcessStatusResponse {
                    process_id: process_id.clone(),
                    running: true,
                    exit_code: None,
                    success: None,
                };
                Ok(Json(ApiResponse::success(response)))
            }
            Err(e) => {
                tracing::error!("Failed to get status for process {}: {}", process_id, e);
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    } else {
        tracing::warn!("Process not found: {}", process_id);
        Err(StatusCode::NOT_FOUND)
    }
}

// Get stdout stream for a running command (true streaming)
async fn get_process_stdout(
    State(state): State<AppState>,
    Path(process_id): Path<String>,
) -> Result<Response, StatusCode> {
    tracing::info!("Starting stdout stream for process_id: {}", process_id);

    let processes = state.processes.lock().await;

    if let Some(entry) = processes.get(&process_id) {
        let stdout_buffer = entry.stdout_buffer.clone();
        let completed = entry.completed.clone();
        drop(processes); // Release the lock early

        // Create a stream that yields data as it becomes available
        let stream = async_stream::stream! {
            let mut position = 0;

            loop {
                let (current_data, is_completed) = {
                    let buffer = stdout_buffer.lock().await;
                    let completed_flag = *completed.lock().await;

                    if buffer.len() > position {
                        // New data available
                        let new_data = buffer[position..].to_vec();
                        position = buffer.len();
                        (Some(new_data), completed_flag)
                    } else {
                        // No new data
                        (None, completed_flag)
                    }
                };

                if let Some(data) = current_data {
                    yield Ok::<axum::body::Bytes, std::io::Error>(axum::body::Bytes::from(data));
                }

                if is_completed {
                    break; // Process finished, no more data will come
                }

                // Wait a bit before checking again
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            }
        };

        let response = Response::builder()
            .header("content-type", "application/octet-stream")
            .header("cache-control", "no-cache")
            .body(Body::from_stream(stream))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(response)
    } else {
        tracing::warn!("Process not found for stdout: {}", process_id);
        Err(StatusCode::NOT_FOUND)
    }
}

// Get stderr stream for a running command (true streaming)
async fn get_process_stderr(
    State(state): State<AppState>,
    Path(process_id): Path<String>,
) -> Result<Response, StatusCode> {
    tracing::info!("Starting stderr stream for process_id: {}", process_id);

    let processes = state.processes.lock().await;

    if let Some(entry) = processes.get(&process_id) {
        let stderr_buffer = entry.stderr_buffer.clone();
        let completed = entry.completed.clone();
        drop(processes); // Release the lock early

        // Create a stream that yields data as it becomes available
        let stream = async_stream::stream! {
            let mut position = 0;

            loop {
                let (current_data, is_completed) = {
                    let buffer = stderr_buffer.lock().await;
                    let completed_flag = *completed.lock().await;

                    if buffer.len() > position {
                        // New data available
                        let new_data = buffer[position..].to_vec();
                        position = buffer.len();
                        (Some(new_data), completed_flag)
                    } else {
                        // No new data
                        (None, completed_flag)
                    }
                };

                if let Some(data) = current_data {
                    yield Ok::<axum::body::Bytes, std::io::Error>(axum::body::Bytes::from(data));
                }

                if is_completed {
                    break; // Process finished, no more data will come
                }

                // Wait a bit before checking again
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            }
        };

        let response = Response::builder()
            .header("content-type", "application/octet-stream")
            .header("cache-control", "no-cache")
            .body(Body::from_stream(stream))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(response)
    } else {
        tracing::warn!("Process not found for stderr: {}", process_id);
        Err(StatusCode::NOT_FOUND)
    }
}
