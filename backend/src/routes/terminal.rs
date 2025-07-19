use axum::{
    extract::{Path, State, WebSocketUpgrade},
    response::Response,
    routing::get,
    Router,
};
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::mpsc;
use tracing::{error, info};
use uuid::Uuid;

use crate::{app_state::AppState, models::task_attempt::TaskAttempt};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum TerminalMessage {
    #[serde(rename = "input")]
    Input { data: String },
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
}

pub fn terminal_router() -> Router<AppState> {
    Router::new().route("/terminal/:attempt_id", get(terminal_handler))
}

async fn terminal_handler(
    Path(attempt_id): Path<String>,
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    info!("Terminal WebSocket connection requested for attempt: {}", attempt_id);
    
    // Parse UUID
    let attempt_uuid = match Uuid::parse_str(&attempt_id) {
        Ok(id) => id,
        Err(e) => {
            error!("Invalid attempt ID: {}", e);
            return ws.on_upgrade(|socket| handle_error_socket(socket, "Invalid attempt ID"));
        }
    };
    
    // Get task attempt to find worktree path
    let task_attempt = match TaskAttempt::find_by_id(&state.db_pool, attempt_uuid).await {
        Ok(Some(attempt)) => attempt,
        Ok(None) => {
            error!("Task attempt not found: {}", attempt_id);
            return ws.on_upgrade(|socket| handle_error_socket(socket, "Task attempt not found"));
        }
        Err(e) => {
            error!("Failed to get task attempt: {}", e);
            return ws.on_upgrade(|socket| handle_error_socket(socket, "Failed to get task attempt"));
        }
    };

    // Check if worktree still exists
    let worktree_path = std::path::Path::new(&task_attempt.worktree_path);
    if !worktree_path.exists() {
        error!("Worktree path does not exist: {}", task_attempt.worktree_path);
        return ws.on_upgrade(|socket| handle_error_socket(socket, "Worktree does not exist"));
    }

    ws.on_upgrade(move |socket| handle_socket(socket, task_attempt.worktree_path))
}

async fn handle_error_socket(mut socket: WebSocket, error_msg: &str) {
    let _ = socket.send(Message::Text(format!("\x1b[31mError: {}\x1b[0m\r\n", error_msg))).await;
    let _ = socket.close().await;
}

async fn handle_socket(socket: WebSocket, worktree_path: String) {
    let (mut sender, mut receiver) = socket.split();
    
    // Start shell process
    let shell = if cfg!(target_os = "windows") {
        "cmd.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    };

    let mut child = match Command::new(&shell)
        .current_dir(&worktree_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            error!("Failed to spawn shell: {}", e);
            let _ = sender.send(Message::Text(format!("\x1b[31mFailed to spawn shell: {}\x1b[0m\r\n", e))).await;
            return;
        }
    };

    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();

    // Channel for sending data from shell to WebSocket
    let (tx, mut rx) = mpsc::channel::<String>(100);

    // Task to read from stdout
    let tx_stdout = tx.clone();
    let stdout_task = tokio::spawn(async move {
        let mut buffer = vec![0; 4096];
        loop {
            match stdout.read(&mut buffer).await {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    if tx_stdout.send(data).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    error!("Error reading stdout: {}", e);
                    break;
                }
            }
        }
    });

    // Task to read from stderr
    let tx_stderr = tx.clone();
    let stderr_task = tokio::spawn(async move {
        let mut buffer = vec![0; 4096];
        loop {
            match stderr.read(&mut buffer).await {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    if tx_stderr.send(data).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    error!("Error reading stderr: {}", e);
                    break;
                }
            }
        }
    });

    // Task to send shell output to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(data) = rx.recv().await {
            if sender.send(Message::Text(data)).await.is_err() {
                break;
            }
        }
    });

    // Handle WebSocket messages
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                match serde_json::from_str::<TerminalMessage>(&text) {
                    Ok(TerminalMessage::Input { data }) => {
                        if let Err(e) = stdin.write_all(data.as_bytes()).await {
                            error!("Failed to write to stdin: {}", e);
                            break;
                        }
                        if let Err(e) = stdin.flush().await {
                            error!("Failed to flush stdin: {}", e);
                            break;
                        }
                    }
                    Ok(TerminalMessage::Resize { cols, rows }) => {
                        // TODO: Implement terminal resize using ioctl
                        info!("Terminal resize requested: {}x{}", cols, rows);
                    }
                    Err(e) => {
                        error!("Failed to parse terminal message: {}", e);
                    }
                }
            }
            Ok(Message::Close(_)) => {
                info!("WebSocket closed");
                break;
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    // Cleanup
    drop(tx);
    let _ = child.kill().await;
    stdout_task.abort();
    stderr_task.abort();
    send_task.abort();
}