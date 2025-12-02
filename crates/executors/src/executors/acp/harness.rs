use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};

use agent_client_protocol as proto;
use agent_client_protocol::Agent as _;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use tokio::{io::AsyncWriteExt, process::Command, sync::mpsc};
use tokio_util::{
    compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt},
    io::ReaderStream,
};
use tracing::error;
use workspace_utils::stream_lines::LinesStreamExt;

use super::{AcpClient, SessionManager};
use crate::{
    command::CommandParts,
    env::ExecutionEnv,
    executors::{ExecutorError, ExecutorExitResult, SpawnedChild, acp::AcpEvent},
};

/// Reusable harness for ACP-based conns (Gemini, Qwen, etc.)
pub struct AcpAgentHarness {
    session_namespace: String,
}

impl Default for AcpAgentHarness {
    fn default() -> Self {
        // Keep existing behavior for Gemini
        Self::new()
    }
}

impl AcpAgentHarness {
    /// Create a harness with the default Gemini namespace
    pub fn new() -> Self {
        Self {
            session_namespace: "gemini_sessions".to_string(),
        }
    }

    /// Create a harness with a custom session namespace (e.g. for Qwen)
    pub fn with_session_namespace(namespace: impl Into<String>) -> Self {
        Self {
            session_namespace: namespace.into(),
        }
    }

    pub async fn spawn_with_command(
        &self,
        current_dir: &Path,
        prompt: String,
        command_parts: CommandParts,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (program_path, args) = command_parts.into_resolved().await?;
        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1");

        // Apply environment variables
        env.apply_to_command(&mut command);

        let mut child = command.group_spawn()?;

        let (exit_tx, exit_rx) = tokio::sync::oneshot::channel::<ExecutorExitResult>();
        Self::bootstrap_acp_connection(
            &mut child,
            current_dir.to_path_buf(),
            None,
            prompt,
            Some(exit_tx),
            self.session_namespace.clone(),
        )
        .await?;

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_rx),
            interrupt_sender: None,
        })
    }

    pub async fn spawn_follow_up_with_command(
        &self,
        current_dir: &Path,
        prompt: String,
        session_id: &str,
        command_parts: CommandParts,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (program_path, args) = command_parts.into_resolved().await?;
        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1");

        // Apply environment variables
        env.apply_to_command(&mut command);

        let mut child = command.group_spawn()?;

        let (exit_tx, exit_rx) = tokio::sync::oneshot::channel::<ExecutorExitResult>();
        Self::bootstrap_acp_connection(
            &mut child,
            current_dir.to_path_buf(),
            Some(session_id.to_string()),
            prompt,
            Some(exit_tx),
            self.session_namespace.clone(),
        )
        .await?;

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_rx),
            interrupt_sender: None,
        })
    }

    async fn bootstrap_acp_connection(
        child: &mut AsyncGroupChild,
        cwd: PathBuf,
        existing_session: Option<String>,
        prompt: String,
        exit_signal: Option<tokio::sync::oneshot::Sender<ExecutorExitResult>>,
        session_namespace: String,
    ) -> Result<(), ExecutorError> {
        // Take child's stdio for ACP wiring
        let orig_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Child process has no stdout",
            ))
        })?;
        let orig_stdin = child.inner().stdin.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Child process has no stdin",
            ))
        })?;

        // Create a fresh stdout pipe for logs
        let writer = crate::stdout_dup::create_stdout_pipe_writer(child)?;
        let shared_writer = Arc::new(tokio::sync::Mutex::new(writer));
        let (log_tx, mut log_rx) = mpsc::unbounded_channel::<String>();

        // Spawn log -> stdout writer task
        tokio::spawn(async move {
            while let Some(line) = log_rx.recv().await {
                let mut data = line.into_bytes();
                data.push(b'\n');
                let mut w = shared_writer.lock().await;
                let _ = w.write_all(&data).await;
            }
        });

        // ACP client STDIO
        let (mut to_acp_writer, acp_incoming_reader) = tokio::io::duplex(64 * 1024);
        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

        // Process stdout -> ACP
        let stdout_shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            let mut stdout_stream = ReaderStream::new(orig_stdout);
            while let Some(res) = stdout_stream.next().await {
                if *stdout_shutdown_rx.borrow() {
                    break;
                }
                match res {
                    Ok(data) => {
                        let _ = to_acp_writer.write_all(&data).await;
                    }
                    Err(_) => break,
                }
            }
        });

        // ACP crate expects futures::AsyncRead + AsyncWrite, use tokio compat to adapt tokio::io::AsyncRead + Write
        let (acp_out_writer, acp_out_reader) = tokio::io::duplex(64 * 1024);
        let outgoing = acp_out_writer.compat_write();
        let incoming = acp_incoming_reader.compat();

        // Process ACP -> stdin
        let stdin_shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            let mut child_stdin = orig_stdin;
            let mut lines = ReaderStream::new(acp_out_reader)
                .map(|res| res.map(|bytes| String::from_utf8_lossy(&bytes).into_owned()))
                .lines();
            while let Some(result) = lines.next().await {
                if *stdin_shutdown_rx.borrow() {
                    break;
                }
                match result {
                    Ok(line) => {
                        // Use \r\n on Windows for compatibility with buggy ACP implementations
                        const LINE_ENDING: &str = if cfg!(windows) { "\r\n" } else { "\n" };
                        let line = line + LINE_ENDING;
                        if let Err(err) = child_stdin.write_all(line.as_bytes()).await {
                            tracing::debug!("Failed to write to child stdin {err}");
                            break;
                        }
                        let _ = child_stdin.flush().await;
                    }
                    Err(err) => {
                        tracing::debug!("ACP stdin line error {err}");
                        break;
                    }
                }
            }
        });

        let mut exit_signal_tx = exit_signal;

        // Run ACP client in a LocalSet
        tokio::task::spawn_blocking(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("build runtime");

            rt.block_on(async move {
                let local = tokio::task::LocalSet::new();
                local
                    .run_until(async move {
                        // Create event and raw channels
                        // Typed events available for future use; raw lines forwarded and persisted
                        let (event_tx, mut event_rx) =
                            mpsc::unbounded_channel::<crate::executors::acp::AcpEvent>();

                        // Create session manager
                        let session_manager = match SessionManager::new(session_namespace) {
                            Ok(sm) => sm,
                            Err(e) => {
                                error!("Failed to create session manager: {}", e);
                                return;
                            }
                        };
                        let session_manager = std::sync::Arc::new(session_manager);

                        // Create ACP client
                        let client = AcpClient::new(event_tx.clone());

                        client.record_user_prompt_event(&prompt);

                        // Set up connection
                        let (conn, io_fut) =
                            proto::ClientSideConnection::new(client, outgoing, incoming, |fut| {
                                tokio::task::spawn_local(fut);
                            });

                        // Drive I/O
                        let io_handle = tokio::task::spawn_local(async move {
                            let _ = io_fut.await;
                        });

                        // Initialize
                        let _ = conn
                            .initialize(proto::InitializeRequest {
                                protocol_version: proto::V1,
                                client_capabilities: proto::ClientCapabilities {
                                    fs: proto::FileSystemCapability {
                                        read_text_file: false,
                                        write_text_file: false,
                                        meta: None,
                                    },
                                    terminal: false,
                                    meta: None,
                                },
                                meta: None,
                            })
                            .await;

                        // Handle session creation/forking
                        let (acp_session_id, display_session_id, prompt_to_send) =
                            if let Some(existing) = existing_session {
                                // Fork existing session
                                let new_ui_id = uuid::Uuid::new_v4().to_string();
                                let _ = session_manager.fork_session(&existing, &new_ui_id);

                                let history = session_manager.read_session_raw(&new_ui_id).ok();
                                let meta =
                                    history.map(|h| serde_json::json!({ "history_jsonl": h }));

                                match conn
                                    .new_session(proto::NewSessionRequest {
                                        mcp_servers: vec![],
                                        cwd: cwd.clone(),
                                        meta,
                                    })
                                    .await
                                {
                                    Ok(resp) => {
                                        let resume_prompt = session_manager
                                            .generate_resume_prompt(&new_ui_id, &prompt)
                                            .unwrap_or_else(|_| prompt.clone());
                                        (resp.session_id.0.to_string(), new_ui_id, resume_prompt)
                                    }
                                    Err(e) => {
                                        error!("Failed to create session: {}", e);
                                        return;
                                    }
                                }
                            } else {
                                // New session
                                match conn
                                    .new_session(proto::NewSessionRequest {
                                        mcp_servers: vec![],
                                        cwd: cwd.clone(),
                                        meta: None,
                                    })
                                    .await
                                {
                                    Ok(resp) => {
                                        let sid = resp.session_id.0.to_string();
                                        (sid.clone(), sid, prompt)
                                    }
                                    Err(e) => {
                                        error!("Failed to create session: {}", e);
                                        return;
                                    }
                                }
                            };

                        // Emit session ID
                        let _ = log_tx
                            .send(AcpEvent::SessionStart(display_session_id.clone()).to_string());

                        // Start raw event forwarder and persistence
                        let app_tx_clone = log_tx.clone();
                        let sess_id_for_writer = display_session_id.clone();
                        let sm_for_writer = session_manager.clone();
                        tokio::spawn(async move {
                            while let Some(event) = event_rx.recv().await {
                                // Forward to stdout
                                let _ = app_tx_clone.send(event.to_string());
                                // Persist to session file
                                let _ = sm_for_writer
                                    .append_raw_line(&sess_id_for_writer, &event.to_string());
                            }
                        });

                        // Save prompt to session
                        let _ = session_manager.append_raw_line(
                            &display_session_id,
                            &serde_json::to_string(&serde_json::json!({ "user": prompt_to_send }))
                                .unwrap_or_default(),
                        );

                        // Build prompt request
                        let req = proto::PromptRequest {
                            session_id: proto::SessionId(acp_session_id.clone().into()),
                            prompt: vec![proto::ContentBlock::Text(proto::TextContent {
                                annotations: None,
                                text: prompt_to_send,
                                meta: None,
                            })],
                            meta: None,
                        };

                        // Send the prompt and await completion to obtain stop_reason
                        match conn.prompt(req).await {
                            Ok(resp) => {
                                // Emit done with stop_reason
                                let stop_reason =
                                    serde_json::to_string(&resp.stop_reason).unwrap_or_default();
                                let _ = log_tx.send(AcpEvent::Done(stop_reason).to_string());
                            }
                            Err(e) => {
                                tracing::debug!("error {} {e} {:?}", e.code, e.data);
                                if e.code == agent_client_protocol::ErrorCode::INTERNAL_ERROR.code
                                    && e.data
                                        .as_ref()
                                        .is_some_and(|d| d == "server shut down unexpectedly")
                                {
                                    tracing::debug!("ACP server killed");
                                } else {
                                    let _ =
                                        log_tx.send(AcpEvent::Error(format!("{e}")).to_string());
                                }
                            }
                        }
                        // Notify container of completion
                        if let Some(tx) = exit_signal_tx.take() {
                            let _ = tx.send(ExecutorExitResult::Success);
                        }

                        // Cancel session work
                        let _ = conn
                            .cancel(proto::CancelNotification {
                                session_id: proto::SessionId(acp_session_id.into()),
                                meta: None,
                            })
                            .await;

                        // Cleanup
                        drop(conn);
                        let _ = shutdown_tx.send(true);
                        let _ = io_handle.await;
                        drop(log_tx);
                    })
                    .await;
            });
        });

        Ok(())
    }
}
