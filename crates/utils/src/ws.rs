use std::{sync::Arc, time::Duration};

use axum::http::{self, HeaderName, HeaderValue};
use futures::future::BoxFuture;
use futures_util::{SinkExt, StreamExt};
use thiserror::Error;
use tokio::{
    sync::{mpsc, watch},
    time::sleep,
};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, protocol::Message},
};

pub type HeaderFuture = BoxFuture<'static, WsResult<Vec<(HeaderName, HeaderValue)>>>;
pub type HeaderFactory = Arc<dyn Fn() -> HeaderFuture + Send + Sync>;

#[derive(Error, Debug)]
pub enum WsError {
    #[error("WebSocket connection error: {0}")]
    Connection(#[from] tokio_tungstenite::tungstenite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Send error: {0}")]
    Send(String),

    #[error("Handler error: {0}")]
    Handler(#[from] Box<dyn std::error::Error + Send + Sync>),

    #[error("Shutdown channel closed unexpectedly")]
    ShutdownChannelClosed,

    #[error("failed to build websocket request: {0}")]
    Request(#[from] http::Error),

    #[error("failed to prepare websocket headers: {0}")]
    Header(String),
}

pub type WsResult<T> = std::result::Result<T, WsError>;

#[async_trait::async_trait]
pub trait WsHandler: Send + Sync + 'static {
    /// Called when a new `Message` is received.
    async fn handle_message(&mut self, msg: Message) -> WsResult<()>;

    /// Called when the socket is closed (either remote closed or error).
    async fn on_close(&mut self) -> WsResult<()>;
}

pub struct WsConfig {
    pub url: String,
    pub autoreconnect: bool,
    pub reconnect_base_delay: Duration,
    pub reconnect_max_delay: Duration,
    pub ping_interval: Option<Duration>,
    pub header_factory: Option<HeaderFactory>,
}

pub struct WsClient {
    msg_tx: mpsc::UnboundedSender<Message>,
    shutdown: watch::Sender<()>,
}

impl WsClient {
    pub fn send(&self, msg: Message) -> WsResult<()> {
        self.msg_tx
            .send(msg)
            .map_err(|e| WsError::Send(format!("WebSocket send error: {e}")))
    }

    pub fn shutdown(&self) -> WsResult<()> {
        self.shutdown
            .send(())
            .map_err(|_| WsError::ShutdownChannelClosed)
    }
}

/// Launches a WebSocket connection loop with read/write tasks and reconnection logic.
/// Returns a `WsClient` which you can use to send messages or request shutdown.
pub async fn run_ws_client<H>(mut handler: H, config: WsConfig) -> WsResult<WsClient>
where
    H: WsHandler,
{
    let (msg_tx, mut msg_rx) = mpsc::unbounded_channel();
    let (shutdown_tx, mut shutdown_rx) = watch::channel(());
    let task_tx = msg_tx.clone();

    tokio::spawn(async move {
        let mut backoff = config.reconnect_base_delay;

        loop {
            tracing::debug!(url = %config.url, "WebSocket connecting");
            let request = match build_request(&config).await {
                Ok(req) => req,
                Err(err) => {
                    tracing::error!(?err, "failed to build websocket request");
                    break;
                }
            };

            match connect_async(request).await {
                Ok((ws_stream, _resp)) => {
                    tracing::info!("WebSocket connected");
                    backoff = config.reconnect_base_delay;

                    let (mut ws_sink, mut ws_stream) = ws_stream.split();

                    let ping_task = if let Some(interval) = config.ping_interval {
                        let mut intv = tokio::time::interval(interval);
                        let mut shutdown_rx2 = shutdown_rx.clone();
                        let ping_tx2 = task_tx.clone();
                        Some(tokio::spawn(async move {
                            loop {
                                tokio::select! {
                                    _ = intv.tick() => {
                                        if ping_tx2.send(Message::Ping(Vec::new().into())).is_err() { break; }
                                    }
                                    _ = shutdown_rx2.changed() => { break; }
                                }
                            }
                        }))
                    } else {
                        None
                    };

                    loop {
                        tokio::select! {
                            maybe = msg_rx.recv() => {
                                match maybe {
                                    Some(msg) => {
                                        if let Err(err) = ws_sink.send(msg).await {
                                            tracing::error!("WebSocket send failed: {:?}", err);
                                            break;
                                        }
                                    }
                                    None => {
                                        tracing::debug!("WebSocket msg_rx closed");
                                        break;
                                    }
                                }
                            }

                            incoming = ws_stream.next() => {
                                match incoming {
                                    Some(Ok(msg)) => {
                                        if let Err(err) = handler.handle_message(msg).await {
                                            tracing::error!("WsHandler failed: {:?}", err);
                                            break;
                                        }
                                    }
                                    Some(Err(err)) => {
                                        tracing::error!("WebSocket stream error: {:?}", err);
                                        break;
                                    }
                                    None => {
                                        tracing::debug!("WebSocket stream ended");
                                        break;
                                    }
                                }
                            }

                            _ = shutdown_rx.changed() => {
                                tracing::debug!("WebSocket shutdown requested");
                                break;
                            }
                        }
                    }

                    if let Err(err) = handler.on_close().await {
                        tracing::error!("WsHandler on_close failed: {:?}", err);
                    }

                    if let Err(err) = ws_sink.close().await {
                        tracing::error!("WebSocket close failed: {:?}", err);
                    }

                    if let Some(task) = ping_task {
                        task.abort();
                    }

                    if !config.autoreconnect {
                        tracing::info!("autoreconnect disabled — exiting WS loop");
                        break;
                    }
                    if shutdown_rx.has_changed().unwrap_or(false) {
                        tracing::info!("shutdown signal seen — exiting WS loop");
                        break;
                    }
                }
                Err(err) => {
                    tracing::error!("WebSocket connect error: {:?}", err);
                }
            }

            tracing::debug!(delay = ?backoff, "WebSocket reconnecting after backoff");
            sleep(backoff).await;
            backoff = std::cmp::min(backoff * 2, config.reconnect_max_delay);
        }

        tracing::info!("WebSocket client task exiting");
    });

    Ok(WsClient {
        msg_tx,
        shutdown: shutdown_tx,
    })
}

async fn build_request(config: &WsConfig) -> WsResult<http::Request<()>> {
    let mut request = config.url.clone().into_client_request()?;
    if let Some(factory) = &config.header_factory {
        let headers = factory().await?;
        for (name, value) in headers {
            request.headers_mut().insert(name, value);
        }
    }

    Ok(request)
}
