use std::{
    borrow::Cow,
    pin::Pin,
    task::{Context, Poll},
};

use axum::{
    extract::{
        FromRef, FromRequestParts,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::request::Parts,
    response::IntoResponse,
};
use deployment::Deployment;
use futures_util::{Sink, SinkExt, Stream, StreamExt};
use relay_control::signing::{RelaySigningService, RequestSignature};
use relay_ws::{SignedAxumSocket, signed_axum_websocket};

use crate::{DeploymentImpl, middleware::RelayRequestSignatureContext};

struct RelaySigningContext {
    request_signature: RequestSignature,
    signing: RelaySigningService,
}

enum SigningMode {
    LocalPlain,
    RelaySigned(RelaySigningContext),
    RelayMissingSession,
}

pub struct SignedWsUpgrade {
    ws: WebSocketUpgrade,
    signing_mode: SigningMode,
}

impl<S> FromRequestParts<S> for SignedWsUpgrade
where
    S: Send + Sync,
    DeploymentImpl: FromRef<S>,
{
    type Rejection = axum::extract::ws::rejection::WebSocketUpgradeRejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let ws = WebSocketUpgrade::from_request_parts(parts, state).await?;
        let deployment = DeploymentImpl::from_ref(state);
        let relay_ctx = parts
            .extensions
            .get::<RelayRequestSignatureContext>()
            .cloned();

        let signing_mode = if let Some(ctx) = relay_ctx {
            let peer_verify_key = deployment
                .relay_signing()
                .get_session_peer_key(ctx.signing_session_id)
                .await;
            if peer_verify_key.is_some() {
                SigningMode::RelaySigned(RelaySigningContext {
                    request_signature: ctx,
                    signing: deployment.relay_signing().clone(),
                })
            } else {
                SigningMode::RelayMissingSession
            }
        } else {
            SigningMode::LocalPlain
        };

        Ok(Self { ws, signing_mode })
    }
}

enum WebSocketInner {
    Plain(Box<WebSocket>),
    Signed(Box<SignedAxumSocket>),
}

impl SignedWsUpgrade {
    pub fn protocols<I>(mut self, protocols: I) -> Self
    where
        I: IntoIterator,
        I::Item: Into<Cow<'static, str>>,
    {
        self.ws = self.ws.protocols(protocols);
        self
    }

    pub fn on_upgrade<F, Fut>(self, callback: F) -> impl IntoResponse
    where
        F: FnOnce(MaybeSignedWebSocket) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = ()> + Send + 'static,
    {
        let relay_signing = match self.signing_mode {
            SigningMode::RelaySigned(params) => Some(params),
            SigningMode::LocalPlain => None,
            SigningMode::RelayMissingSession => {
                tracing::warn!(
                    "Rejecting relayed WebSocket upgrade: signing session expired or missing"
                );
                return axum::http::StatusCode::UNAUTHORIZED.into_response();
            }
        };

        self.ws.on_upgrade(move |socket| async move {
            let inner = match relay_signing {
                Some(ctx) => {
                    match signed_axum_websocket(&ctx.signing, &ctx.request_signature, socket).await
                    {
                        Ok(signed) => WebSocketInner::Signed(Box::new(signed)),
                        Err(e) => {
                            tracing::warn!(
                                session_id = %ctx.request_signature.signing_session_id,
                                error = %e,
                                "Failed to create signed WebSocket"
                            );
                            return;
                        }
                    }
                }
                None => WebSocketInner::Plain(Box::new(socket)),
            };
            callback(MaybeSignedWebSocket { inner }).await;
        })
    }
}

pub struct MaybeSignedWebSocket {
    inner: WebSocketInner,
}

impl MaybeSignedWebSocket {
    pub async fn send(&mut self, message: Message) -> anyhow::Result<()> {
        match &mut self.inner {
            WebSocketInner::Plain(ws) => SinkExt::send(ws, message)
                .await
                .map_err(anyhow::Error::from),
            WebSocketInner::Signed(ws) => ws.send(message).await,
        }
    }

    pub async fn recv(&mut self) -> anyhow::Result<Option<Message>> {
        match &mut self.inner {
            WebSocketInner::Plain(ws) => match ws.next().await {
                Some(Ok(msg)) => Ok(Some(msg)),
                Some(Err(e)) => Err(anyhow::Error::from(e)),
                None => Ok(None),
            },
            WebSocketInner::Signed(ws) => ws.recv().await,
        }
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        match &mut self.inner {
            WebSocketInner::Plain(ws) => SinkExt::close(ws).await.map_err(anyhow::Error::from),
            WebSocketInner::Signed(ws) => ws.close().await,
        }
    }
}

impl Stream for MaybeSignedWebSocket {
    type Item = Result<Message, anyhow::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        match &mut this.inner {
            WebSocketInner::Plain(ws) => Pin::new(ws)
                .poll_next(cx)
                .map(|opt| opt.map(|r| r.map_err(anyhow::Error::from))),
            WebSocketInner::Signed(ws) => Pin::new(ws).poll_next(cx),
        }
    }
}

impl Sink<Message> for MaybeSignedWebSocket {
    type Error = anyhow::Error;

    fn poll_ready(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        let this = self.get_mut();
        match &mut this.inner {
            WebSocketInner::Plain(ws) => Pin::new(ws).poll_ready(cx).map_err(anyhow::Error::from),
            WebSocketInner::Signed(ws) => Pin::new(ws).poll_ready(cx),
        }
    }

    fn start_send(self: Pin<&mut Self>, item: Message) -> Result<(), Self::Error> {
        let this = self.get_mut();
        match &mut this.inner {
            WebSocketInner::Plain(ws) => Pin::new(ws).start_send(item).map_err(anyhow::Error::from),
            WebSocketInner::Signed(ws) => Pin::new(ws).start_send(item),
        }
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        let this = self.get_mut();
        match &mut this.inner {
            WebSocketInner::Plain(ws) => Pin::new(ws).poll_flush(cx).map_err(anyhow::Error::from),
            WebSocketInner::Signed(ws) => Pin::new(ws).poll_flush(cx),
        }
    }

    fn poll_close(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        let this = self.get_mut();
        match &mut this.inner {
            WebSocketInner::Plain(ws) => Pin::new(ws).poll_close(cx).map_err(anyhow::Error::from),
            WebSocketInner::Signed(ws) => Pin::new(ws).poll_close(cx),
        }
    }
}
