use axum::{
    extract::{FromRef, FromRequestParts, ws::WebSocketUpgrade},
    http::request::Parts,
    response::IntoResponse,
};
use deployment::Deployment;
use ed25519_dalek::{SigningKey, VerifyingKey};
use relay_ws_crypto::RelaySessionCrypto;
use relay_ws_server::RelayServerSocket;

use crate::{DeploymentImpl, middleware::RelayRequestSignatureContext};

struct RelaySigningParams {
    session_id: String,
    nonce: String,
    signing_key: SigningKey,
    verify_key: VerifyingKey,
}

pub struct RelayWsUpgrade {
    ws: WebSocketUpgrade,
    relay_signing: Option<RelaySigningParams>,
}

impl<S> FromRequestParts<S> for RelayWsUpgrade
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

impl RelayWsUpgrade {
    pub fn on_upgrade<F, Fut>(self, callback: F) -> impl IntoResponse
    where
        F: FnOnce(RelayServerSocket) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = ()> + Send + 'static,
    {
        let relay_signing = self.relay_signing;
        self.ws.on_upgrade(move |socket| async move {
            let socket = match relay_signing {
                Some(params) => RelayServerSocket::signed(
                    RelaySessionCrypto::new(
                        params.session_id,
                        params.nonce,
                        params.signing_key,
                        params.verify_key,
                    ),
                    socket,
                ),
                None => RelayServerSocket::plain(socket),
            };
            callback(socket).await;
        })
    }
}
