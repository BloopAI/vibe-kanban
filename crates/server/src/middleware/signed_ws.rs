use std::{
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
use ed25519_dalek::{SigningKey, VerifyingKey};
use futures_util::{Sink, SinkExt, Stream, StreamExt};
use relay_ws::{SignedAxumSocket, signed_axum_websocket};

use crate::{DeploymentImpl, middleware::RelayRequestSignatureContext};

struct RelaySigningParams {
    session_id: String,
    nonce: String,
    signing_key: SigningKey,
    verify_key: VerifyingKey,
}

pub struct SignedWsUpgrade {
    ws: WebSocketUpgrade,
    relay_signing: Option<RelaySigningParams>,
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

        let relay_signing = if let Some(ctx) = relay_ctx {
            let signing_key = deployment.relay_signing().signing_key().clone();
            let peer_verify_key = deployment
                .relay_signing()
                .get_session_peer_key(ctx.signing_session_id)
                .await;
            peer_verify_key.map(|key| RelaySigningParams {
                session_id: ctx.signing_session_id.to_string(),
                nonce: ctx.request_nonce,
                signing_key,
                verify_key: key,
            })
        } else {
            None
        };

        Ok(Self { ws, relay_signing })
    }
}

enum WebSocketInner {
    Plain(Box<WebSocket>),
    Signed(Box<SignedAxumSocket>),
}

impl SignedWsUpgrade {
    pub fn on_upgrade<F, Fut>(self, callback: F) -> impl IntoResponse
    where
        F: FnOnce(MaybeSignedWebSocket) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = ()> + Send + 'static,
    {
        let relay_signing = self.relay_signing;
        self.ws.on_upgrade(move |socket| async move {
            let inner = match relay_signing {
                Some(params) => WebSocketInner::Signed(Box::new(signed_axum_websocket(
                    params.session_id,
                    params.nonce,
                    params.signing_key,
                    params.verify_key,
                    socket,
                ))),
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
