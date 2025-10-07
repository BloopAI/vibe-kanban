use std::{
    io,
    sync::{Arc, OnceLock},
};

use async_trait::async_trait;
use codex_app_server_protocol::{
    AddConversationListenerParams, AddConversationSubscriptionResponse, ApplyPatchApprovalResponse,
    ClientInfo, ClientNotification, ClientRequest, ExecCommandApprovalResponse, InitializeParams,
    InitializeResponse, InputItem, JSONRPCError, JSONRPCNotification, JSONRPCRequest,
    JSONRPCResponse, NewConversationParams, NewConversationResponse, RequestId,
    ResumeConversationParams, ResumeConversationResponse, SendUserMessageParams,
    SendUserMessageResponse, ServerRequest,
};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use tokio::{
    io::{AsyncWrite, AsyncWriteExt, BufWriter},
    sync::Mutex,
};

use super::jsonrpc::{JsonRpcCallbacks, JsonRpcPeer};
use crate::executors::ExecutorError;

pub struct AppServerClient {
    rpc: OnceLock<JsonRpcPeer>,
    log_writer: LogWriter,
}

impl AppServerClient {
    pub fn new(log_writer: LogWriter) -> Arc<Self> {
        Arc::new(Self {
            rpc: OnceLock::new(),
            log_writer,
        })
    }

    pub fn connect(&self, peer: JsonRpcPeer) {
        let _ = self.rpc.set(peer);
    }

    fn rpc(&self) -> &JsonRpcPeer {
        self.rpc.get().expect("Codex RPC peer not attached")
    }

    pub async fn initialize(&self) -> Result<(), ExecutorError> {
        let request = ClientRequest::Initialize {
            request_id: self.next_request_id(),
            params: InitializeParams {
                client_info: ClientInfo {
                    name: "vibe-codex-executor".to_string(),
                    title: None,
                    version: env!("CARGO_PKG_VERSION").to_string(),
                },
            },
        };

        self.send_request::<InitializeResponse>(request, "initialize")
            .await?;
        self.send_message(&ClientNotification::Initialized).await
    }

    pub async fn new_conversation(
        &self,
        params: NewConversationParams,
    ) -> Result<NewConversationResponse, ExecutorError> {
        let request = ClientRequest::NewConversation {
            request_id: self.next_request_id(),
            params,
        };
        self.send_request(request, "newConversation").await
    }

    pub async fn resume_conversation(
        &self,
        rollout_path: std::path::PathBuf,
        overrides: NewConversationParams,
    ) -> Result<ResumeConversationResponse, ExecutorError> {
        let request = ClientRequest::ResumeConversation {
            request_id: self.next_request_id(),
            params: ResumeConversationParams {
                path: rollout_path,
                overrides: Some(overrides),
            },
        };
        self.send_request(request, "resumeConversation").await
    }

    pub async fn add_conversation_listener(
        &self,
        conversation_id: codex_protocol::ConversationId,
    ) -> Result<AddConversationSubscriptionResponse, ExecutorError> {
        let request = ClientRequest::AddConversationListener {
            request_id: self.next_request_id(),
            params: AddConversationListenerParams { conversation_id },
        };
        self.send_request(request, "addConversationListener").await
    }

    pub async fn send_user_message(
        &self,
        conversation_id: codex_protocol::ConversationId,
        message: String,
    ) -> Result<SendUserMessageResponse, ExecutorError> {
        let request = ClientRequest::SendUserMessage {
            request_id: self.next_request_id(),
            params: SendUserMessageParams {
                conversation_id,
                items: vec![InputItem::Text { text: message }],
            },
        };
        self.send_request(request, "sendUserMessage").await
    }

    async fn send_message<M>(&self, message: &M) -> Result<(), ExecutorError>
    where
        M: Serialize + Sync,
    {
        self.rpc().send(message).await
    }

    async fn send_request<R>(&self, request: ClientRequest, label: &str) -> Result<R, ExecutorError>
    where
        R: DeserializeOwned + std::fmt::Debug,
    {
        let request_id = request_id(&request);
        self.rpc().request(request_id, &request, label).await
    }

    fn next_request_id(&self) -> RequestId {
        self.rpc().next_request_id()
    }
}

#[async_trait]
impl JsonRpcCallbacks for AppServerClient {
    async fn on_request(
        &self,
        peer: &JsonRpcPeer,
        raw: &str,
        request: JSONRPCRequest,
    ) -> Result<(), ExecutorError> {
        self.log_writer.log_raw(raw).await?;
        match ServerRequest::try_from(request.clone()) {
            Ok(server_request) => handle_server_request(peer, server_request).await,
            Err(err) => {
                tracing::debug!("Unhandled server request `{}`: {err}", request.method);
                let response = JSONRPCResponse {
                    id: request.id,
                    result: Value::Null,
                };
                peer.send(&response).await
            }
        }
    }

    async fn on_response(
        &self,
        _peer: &JsonRpcPeer,
        raw: &str,
        _response: &JSONRPCResponse,
    ) -> Result<(), ExecutorError> {
        self.log_writer.log_raw(raw).await
    }

    async fn on_error(
        &self,
        _peer: &JsonRpcPeer,
        raw: &str,
        _error: &JSONRPCError,
    ) -> Result<(), ExecutorError> {
        self.log_writer.log_raw(raw).await
    }

    async fn on_notification(
        &self,
        _peer: &JsonRpcPeer,
        raw: &str,
        notification: JSONRPCNotification,
    ) -> Result<bool, ExecutorError> {
        self.log_writer.log_raw(raw).await?;
        let method = notification.method.as_str();
        if !method.starts_with("codex/event") {
            return Ok(false);
        }

        let has_finished = method
            .strip_prefix("codex/event/")
            .is_some_and(|suffix| suffix == "task_complete");

        Ok(has_finished)
    }

    async fn on_non_json(&self, raw: &str) -> Result<(), ExecutorError> {
        self.log_writer.log_raw(raw).await?;
        Ok(())
    }
}

// Aprovals
async fn handle_server_request(
    peer: &JsonRpcPeer,
    request: ServerRequest,
) -> Result<(), ExecutorError> {
    match request {
        ServerRequest::ApplyPatchApproval { request_id, .. } => {
            let response = ApplyPatchApprovalResponse {
                decision: codex_protocol::protocol::ReviewDecision::ApprovedForSession,
            };
            send_server_response(peer, request_id, response).await
        }
        ServerRequest::ExecCommandApproval { request_id, .. } => {
            let response = ExecCommandApprovalResponse {
                decision: codex_protocol::protocol::ReviewDecision::ApprovedForSession,
            };
            send_server_response(peer, request_id, response).await
        }
    }
}

async fn send_server_response<T>(
    peer: &JsonRpcPeer,
    request_id: RequestId,
    response: T,
) -> Result<(), ExecutorError>
where
    T: Serialize,
{
    let payload = JSONRPCResponse {
        id: request_id,
        result: serde_json::to_value(response)
            .map_err(|err| ExecutorError::Io(io::Error::other(err.to_string())))?,
    };

    peer.send(&payload).await
}

fn request_id(request: &ClientRequest) -> RequestId {
    match request {
        ClientRequest::Initialize { request_id, .. }
        | ClientRequest::NewConversation { request_id, .. }
        | ClientRequest::ResumeConversation { request_id, .. }
        | ClientRequest::AddConversationListener { request_id, .. }
        | ClientRequest::SendUserMessage { request_id, .. } => request_id.clone(),
        _ => unreachable!("request_id called for unsupported request variant"),
    }
}

#[derive(Clone)]
pub struct LogWriter {
    writer: Arc<Mutex<BufWriter<Box<dyn AsyncWrite + Send + Unpin>>>>,
}

impl LogWriter {
    pub fn new(writer: impl AsyncWrite + Send + Unpin + 'static) -> Self {
        Self {
            writer: Arc::new(Mutex::new(BufWriter::new(Box::new(writer)))),
        }
    }

    pub async fn log_raw(&self, raw: &str) -> Result<(), ExecutorError> {
        let mut guard = self.writer.lock().await;
        guard
            .write_all(raw.as_bytes())
            .await
            .map_err(ExecutorError::Io)?;
        guard.write_all(b"\n").await.map_err(ExecutorError::Io)?;
        guard.flush().await.map_err(ExecutorError::Io)?;
        Ok(())
    }
}
