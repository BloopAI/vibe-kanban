//! Minimal JSON-RPC helper tailored for the Codex executor.
//!
//! We keep this bespoke layer because the codex-app-server client must handle server-initiated
//! requests as well as client-initiated requests. When a bidirectional client that
//! supports this pattern is available, this module should be straightforward to
//! replace.

use std::{
    collections::HashMap,
    fmt::Debug,
    io,
    sync::{
        Arc,
        atomic::{AtomicI64, Ordering},
    },
};

use async_trait::async_trait;
use codex_app_server_protocol::{
    JSONRPCError, JSONRPCMessage, JSONRPCNotification, JSONRPCRequest, JSONRPCResponse, RequestId,
};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, ChildStdout},
    sync::{Mutex, oneshot},
};

use crate::executors::ExecutorError;

#[derive(Debug)]
pub enum PendingResponse {
    Result(Value),
    Error(JSONRPCError),
    Shutdown,
}

#[derive(Clone)]
pub struct ExitSignalSender {
    inner: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

impl ExitSignalSender {
    pub fn new(sender: oneshot::Sender<()>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Some(sender))),
        }
    }
    pub async fn send_exit_signal(&self) {
        if let Some(sender) = self.inner.lock().await.take() {
            let _ = sender.send(());
        }
    }
}

#[derive(Clone)]
pub struct JsonRpcPeer {
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Arc<Mutex<HashMap<RequestId, oneshot::Sender<PendingResponse>>>>,
    id_counter: Arc<AtomicI64>,
}

impl JsonRpcPeer {
    pub fn spawn(
        stdin: ChildStdin,
        stdout: ChildStdout,
        callbacks: Arc<dyn JsonRpcCallbacks>,
        exit_tx: ExitSignalSender,
    ) -> Self {
        let peer = Self {
            stdin: Arc::new(Mutex::new(stdin)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            id_counter: Arc::new(AtomicI64::new(1)),
        };

        let reader_peer = peer.clone();
        let callbacks = callbacks.clone();

        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut buffer = String::new();

            loop {
                buffer.clear();
                match reader.read_line(&mut buffer).await {
                    Ok(0) => break,
                    Ok(_) => {
                        let line = buffer.trim_end_matches(['\n', '\r']);
                        if line.is_empty() {
                            continue;
                        }

                        match serde_json::from_str::<JSONRPCMessage>(line) {
                            Ok(JSONRPCMessage::Response(response)) => {
                                let request_id = response.id.clone();
                                let result = response.result.clone();
                                if callbacks
                                    .on_response(&reader_peer, line, &response)
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                                reader_peer
                                    .resolve(request_id, PendingResponse::Result(result))
                                    .await;
                            }
                            Ok(JSONRPCMessage::Error(error)) => {
                                let request_id = error.id.clone();
                                if callbacks
                                    .on_error(&reader_peer, line, &error)
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                                reader_peer
                                    .resolve(request_id, PendingResponse::Error(error))
                                    .await;
                            }
                            Ok(JSONRPCMessage::Request(request)) => {
                                if callbacks
                                    .on_request(&reader_peer, line, request)
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                            }
                            Ok(JSONRPCMessage::Notification(notification)) => {
                                match callbacks
                                    .on_notification(&reader_peer, line, notification)
                                    .await
                                {
                                    // finished
                                    Ok(true) => break,
                                    Ok(false) => {}
                                    Err(_) => {
                                        break;
                                    }
                                }
                            }
                            Err(_) => {
                                if callbacks.on_non_json(line).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    Err(err) => {
                        tracing::warn!("Error reading Codex output: {err}");
                        break;
                    }
                }
            }

            exit_tx.send_exit_signal().await;
            let _ = reader_peer.shutdown().await;
        });

        peer
    }

    pub fn next_request_id(&self) -> RequestId {
        RequestId::Integer(self.id_counter.fetch_add(1, Ordering::Relaxed))
    }

    pub async fn register(&self, request_id: RequestId) -> PendingReceiver {
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(request_id, sender);
        receiver
    }

    pub async fn resolve(&self, request_id: RequestId, response: PendingResponse) {
        if let Some(sender) = self.pending.lock().await.remove(&request_id) {
            let _ = sender.send(response);
        }
    }

    pub async fn shutdown(&self) -> Result<(), ExecutorError> {
        let mut pending = self.pending.lock().await;
        for (_, sender) in pending.drain() {
            let _ = sender.send(PendingResponse::Shutdown);
        }
        Ok(())
    }

    pub async fn send<T>(&self, message: &T) -> Result<(), ExecutorError>
    where
        T: Serialize + Sync,
    {
        let raw = serde_json::to_string(message)
            .map_err(|err| ExecutorError::Io(io::Error::other(err.to_string())))?;
        self.send_raw(&raw).await
    }

    pub async fn request<R, T>(
        &self,
        request_id: RequestId,
        message: &T,
        label: &str,
    ) -> Result<R, ExecutorError>
    where
        R: DeserializeOwned + Debug,
        T: Serialize + Sync,
    {
        let receiver = self.register(request_id).await;
        self.send(message).await?;
        await_response(receiver, label).await
    }

    async fn send_raw(&self, payload: &str) -> Result<(), ExecutorError> {
        let mut guard = self.stdin.lock().await;
        guard
            .write_all(payload.as_bytes())
            .await
            .map_err(ExecutorError::Io)?;
        guard.write_all(b"\n").await.map_err(ExecutorError::Io)?;
        guard.flush().await.map_err(ExecutorError::Io)?;
        Ok(())
    }
}

pub type PendingReceiver = oneshot::Receiver<PendingResponse>;

pub async fn await_response<R>(receiver: PendingReceiver, label: &str) -> Result<R, ExecutorError>
where
    R: DeserializeOwned + Debug,
{
    match receiver.await {
        Ok(PendingResponse::Result(value)) => serde_json::from_value(value).map_err(|err| {
            ExecutorError::Io(io::Error::other(format!(
                "failed to decode {label} response: {err}",
            )))
        }),
        Ok(PendingResponse::Error(error)) => Err(ExecutorError::Io(io::Error::other(format!(
            "{label} request failed: {}",
            error.error.message
        )))),
        Ok(PendingResponse::Shutdown) => Err(ExecutorError::Io(io::Error::other(format!(
            "server was shutdown while waiting for {label} response",
        )))),
        Err(_) => Err(ExecutorError::Io(io::Error::other(format!(
            "{label} request was dropped",
        )))),
    }
}

#[async_trait]
pub trait JsonRpcCallbacks: Send + Sync {
    async fn on_request(
        &self,
        peer: &JsonRpcPeer,
        raw: &str,
        request: JSONRPCRequest,
    ) -> Result<(), ExecutorError>;

    async fn on_response(
        &self,
        peer: &JsonRpcPeer,
        raw: &str,
        response: &JSONRPCResponse,
    ) -> Result<(), ExecutorError>;

    async fn on_error(
        &self,
        peer: &JsonRpcPeer,
        raw: &str,
        error: &JSONRPCError,
    ) -> Result<(), ExecutorError>;

    async fn on_notification(
        &self,
        peer: &JsonRpcPeer,
        raw: &str,
        notification: JSONRPCNotification,
    ) -> Result<bool, ExecutorError>;

    async fn on_non_json(&self, _raw: &str) -> Result<(), ExecutorError>;
}
