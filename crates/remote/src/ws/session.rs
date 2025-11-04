use axum::extract::ws::{Message, WebSocket};
use chrono::{Duration as ChronoDuration, Utc};
use futures::{SinkExt, StreamExt};
use thiserror::Error;
use tokio::time::{self, MissedTickBehavior};
use tokio_stream::wrappers::BroadcastStream;
use tracing::instrument;
use utils::ws::{WS_AUTH_REFRESH_INTERVAL, WS_TOKEN_EXPIRY_GRACE};

use super::{
    WsQueryParams,
    message::{ClientMessage, ServerMessage},
};
use crate::{
    AppState,
    activity::ActivityEvent,
    auth::{ClerkAuth, ClerkAuthError, ClerkIdentity, RequestContext},
    db::activity::ActivityRepository,
};

#[instrument(
    name = "ws.session",
    skip(socket, state, ctx, params),
    fields(org_id = %ctx.organization.id, user_id = %ctx.user.id, session_id = %ctx.identity.session_id)
)]
pub async fn handle(
    socket: WebSocket,
    state: AppState,
    ctx: RequestContext,
    params: WsQueryParams,
) {
    let config = state.config();
    let pool = state.pool().clone();
    let receiver = state.broker().subscribe();
    let mut activity_stream = BroadcastStream::new(receiver);
    let org_id = ctx.organization.id.clone();
    let mut auth_state = WsAuthState::new(
        state.auth().clone(),
        ctx.user.id.clone(),
        org_id.clone(),
        ctx.identity.clone(),
        ChronoDuration::from_std(WS_TOKEN_EXPIRY_GRACE)
            .expect("websocket token grace fits within chrono duration range"),
    );
    let mut auth_check_interval = time::interval(WS_AUTH_REFRESH_INTERVAL);
    auth_check_interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

    let (mut sender, mut inbound) = socket.split();

    if let Ok(history) = ActivityRepository::new(&pool)
        .fetch_since(&org_id, params.cursor, config.activity_default_limit)
        .await
    {
        for event in history {
            if send_activity(&mut sender, &event).await.is_err() {
                return;
            }
        }
    }

    tracing::debug!(%org_id, "starting websocket session");

    loop {
        tokio::select! {
            maybe_activity = activity_stream.next() => {
                match maybe_activity {
                    Some(Ok(event)) => {
                        tracing::info!(?event, "received activity event");
                        if event.organization_id.as_str() == org_id.as_str()
                            && send_activity(&mut sender, &event).await.is_err() {
                                break;
                            }

                    }
                    Some(Err(error)) => {
                        tracing::warn!(?error, "activity stream lagged");
                        let _ = send_error(&mut sender, "activity backlog dropped").await;
                        break;
                    }
                    None => break,
                }
            }

            maybe_message = inbound.next() => {
                match maybe_message {
                    Some(Ok(msg)) => {
                        if matches!(msg, Message::Close(_)) {
                            break;
                        }
                        if let Message::Text(text) = msg {
                            match serde_json::from_str::<ClientMessage>(&text) {
                                Ok(ClientMessage::Ack { cursor: _ }) => {
                                    // No-op for now;
                                }
                                Ok(ClientMessage::AuthToken { token }) => {
                                    auth_state.store_token(token);
                                }
                                Err(error) => {
                                    tracing::debug!(?error, "invalid inbound message");
                                }
                            }
                        }
                    }
                    Some(Err(error)) => {
                        tracing::debug!(?error, "websocket receive error");
                        break;
                    }
                    None => break,
                }
            }

            _ = auth_check_interval.tick() => {
                match auth_state.verify().await {
                    Ok(()) => {}
                    Err(AuthVerifyError::Expired(identity)) => {
                        tracing::info!(
                            session_id = %identity.session_id,
                            user_id = %identity.user_id,
                            "closing websocket due to expired token"
                        );
                        let _ = send_error(&mut sender, "authorization expired").await;
                        let _ = sender.send(Message::Close(None)).await;
                        break;
                    }
                    Err(error) => {
                        tracing::info!(
                            ?error,
                            "closing websocket due to auth verification error"
                        );
                        let _ = send_error(&mut sender, "authorization error").await;
                        let _ = sender.send(Message::Close(None)).await;
                        break;
                    }
                }
            }
        }
    }
}

async fn send_activity(
    sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    event: &ActivityEvent,
) -> Result<(), ()> {
    tracing::trace!(
        event_type = %event.event_type.as_str(),
        org_id = %event.organization_id,
        "sending activity event"
    );

    match serde_json::to_string(&ServerMessage::Activity(event.clone())) {
        Ok(json) => sender
            .send(Message::Text(json.into()))
            .await
            .map_err(|error| {
                tracing::debug!(?error, "failed to send activity message");
            }),
        Err(error) => {
            tracing::error!(?error, "failed to serialise activity event");
            Err(())
        }
    }
}

async fn send_error(
    sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    message: &str,
) -> Result<(), ()> {
    match serde_json::to_string(&ServerMessage::Error {
        message: message.to_string(),
    }) {
        Ok(json) => sender
            .send(Message::Text(json.into()))
            .await
            .map_err(|error| {
                tracing::debug!(?error, "failed to send websocket error message");
            }),
        Err(error) => {
            tracing::error!(?error, "failed to serialise websocket error message");
            Err(())
        }
    }
}

struct WsAuthState {
    auth: ClerkAuth,
    expected_user_id: String,
    expected_org_id: String,
    latest_identity: ClerkIdentity,
    expiry_grace: ChronoDuration,
    pending_token: Option<String>,
}

impl WsAuthState {
    fn new(
        auth: ClerkAuth,
        expected_user_id: String,
        expected_org_id: String,
        initial_identity: ClerkIdentity,
        expiry_grace: ChronoDuration,
    ) -> Self {
        Self {
            auth,
            expected_user_id,
            expected_org_id,
            latest_identity: initial_identity,
            expiry_grace,
            pending_token: None,
        }
    }

    fn store_token(&mut self, token: String) {
        self.pending_token = Some(token);
    }

    async fn verify(&mut self) -> Result<(), AuthVerifyError> {
        if let Some(token) = self.pending_token.take() {
            let identity = self.verify_token(&token).await?;
            self.latest_identity = identity;
        }

        if self.is_expired() {
            return Err(AuthVerifyError::Expired(self.latest_identity.clone()));
        }

        Ok(())
    }

    fn is_expired(&self) -> bool {
        Utc::now() > self.latest_identity.expires_at + self.expiry_grace
    }

    async fn verify_token(&self, token: &str) -> Result<ClerkIdentity, AuthRefreshError> {
        let identity = self
            .auth
            .verify(token)
            .await
            .map_err(AuthRefreshError::Verify)?;

        if identity.user_id != self.expected_user_id {
            return Err(AuthRefreshError::UserMismatch {
                expected: self.expected_user_id.clone(),
                received: identity.user_id,
            });
        }

        let org_matches_expected = identity
            .org_id
            .as_deref()
            .map(|org| org == self.expected_org_id)
            .unwrap_or(false);

        if !org_matches_expected {
            return Err(AuthRefreshError::OrgMismatch {
                expected: self.expected_org_id.clone(),
                received: identity.org_id,
            });
        }

        Ok(identity)
    }
}

#[derive(Debug, Error)]
enum AuthRefreshError {
    #[error("failed to verify refreshed token: {0}")]
    Verify(ClerkAuthError),
    #[error("received token for unexpected user: expected {expected}, received {received}")]
    UserMismatch { expected: String, received: String },
    #[error(
        "received token for unexpected organization: expected {expected}, received {received:?}"
    )]
    OrgMismatch {
        expected: String,
        received: Option<String>,
    },
}

#[derive(Debug, Error)]
enum AuthVerifyError {
    #[error(transparent)]
    Refresh(#[from] AuthRefreshError),
    #[error("authorization expired")]
    Expired(ClerkIdentity),
}
