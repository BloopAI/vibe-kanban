use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use sqlx::PgPool;
use thiserror::Error;
use tokio::time::{self, MissedTickBehavior};
use tokio_stream::wrappers::errors::BroadcastStreamRecvError;
use tracing::{Span, instrument};
use utils::ws::{WS_AUTH_REFRESH_INTERVAL, WS_BULK_SYNC_THRESHOLD};
use uuid::Uuid;

use super::{
    WsQueryParams,
    message::{ClientMessage, ServerMessage},
};
use crate::{
    AppState,
    activity::{ActivityBroker, ActivityEvent, ActivityStream},
    auth::{JwtError, JwtIdentity, JwtService, RequestContext},
    db::{
        activity::ActivityRepository,
        auth::{AuthSessionError, AuthSessionRepository},
    },
};

#[instrument(
    name = "ws.session",
    skip(socket, state, ctx, params),
    fields(
        user_id = %ctx.user.id,
        project_id = %params.project_id,
        org_id = tracing::field::Empty,
        session_id = %ctx.session_id
    )
)]
pub async fn handle(
    socket: WebSocket,
    state: AppState,
    ctx: RequestContext,
    params: WsQueryParams,
) {
    let config = state.config();
    let pool_ref = state.pool();
    let project_id = params.project_id;
    let organization_id = match crate::routes::organization_members::ensure_project_access(
        pool_ref,
        ctx.user.id,
        project_id,
    )
    .await
    {
        Ok(org_id) => org_id,
        Err(error) => {
            tracing::info!(
            ?error,
            user_id = %ctx.user.id,
                %project_id,
                "websocket project access denied"
            );
            return;
        }
    };
    Span::current().record("org_id", format_args!("{organization_id}"));

    let pool = pool_ref.clone();
    let mut last_sent_seq = params.cursor;
    let mut auth_state = WsAuthState::new(
        state.jwt(),
        pool.clone(),
        ctx.session_id,
        ctx.session_secret.clone(),
        ctx.user.id,
        project_id,
    );
    let mut auth_check_interval = time::interval(WS_AUTH_REFRESH_INTERVAL);
    auth_check_interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

    let (mut sender, mut inbound) = socket.split();
    let mut activity_stream = state.broker().subscribe(project_id);

    if let Ok(history) = ActivityRepository::new(&pool)
        .fetch_since(project_id, params.cursor, config.activity_default_limit)
        .await
    {
        for event in history {
            if send_activity(&mut sender, &event).await.is_err() {
                return;
            }
            last_sent_seq = Some(event.seq);
        }
    }

    tracing::debug!(org_id = %organization_id, project_id = %project_id, "starting websocket session");

    loop {
        tokio::select! {
            maybe_activity = activity_stream.next() => {
                match maybe_activity {
                    Some(Ok(event)) => {
                        tracing::trace!(?event, "received activity event");
                        assert_eq!(event.project_id, project_id, "activity stream emitted cross-project event");
                        if let Some(prev_seq) = last_sent_seq {
                            if prev_seq >= event.seq {
                                continue;
                            }
                            if event.seq > prev_seq + 1 {
                                tracing::warn!(
                                    expected_next = prev_seq + 1,
                                    actual = event.seq,
                                    org_id = %organization_id,
                                    project_id = %project_id,
                                    "activity stream skipped sequence; running catch-up"
                                );
                                match activity_stream_catch_up(
                                    &mut sender,
                                    &pool,
                                    project_id,
                                    organization_id,
                                    prev_seq,
                                    state.broker(),
                                    config.activity_catchup_batch_size,
                                    WS_BULK_SYNC_THRESHOLD as i64,
                                    "gap",
                                ).await {
                                    Ok((seq, stream)) => {
                                        last_sent_seq = Some(seq);
                                        activity_stream = stream;
                                    }
                                    Err(()) => break,
                                }
                                continue;
                            }
                        }
                        if send_activity(&mut sender, &event).await.is_err() {
                            break;
                        }
                        last_sent_seq = Some(event.seq);
                    }
                    Some(Err(BroadcastStreamRecvError::Lagged(skipped))) => {
                        tracing::warn!(skipped, org_id = %organization_id, project_id = %project_id, "activity stream lagged");
                        let Some(prev_seq) = last_sent_seq else {
                            tracing::info!(
                                org_id = %organization_id,
                                project_id = %project_id,
                                "activity stream lagged without baseline; forcing bulk sync"
                            );
                            let _ = send_error(&mut sender, "activity backlog dropped").await;
                            break;
                        };

                        match activity_stream_catch_up(
                            &mut sender,
                            &pool,
                            project_id,
                            organization_id,
                            prev_seq,
                            state.broker(),
                            config.activity_catchup_batch_size,
                            WS_BULK_SYNC_THRESHOLD as i64,
                            "lag",
                        ).await {
                            Ok((seq, stream)) => {
                                last_sent_seq = Some(seq);
                                activity_stream = stream;
                            }
                            Err(()) => break,
                        }
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
                                Ok(ClientMessage::Ack { .. }) => {}
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
                    Err(error) => {
                        tracing::info!(?error, "closing websocket due to auth verification error");
                        let message = match error {
                            AuthVerifyError::Revoked | AuthVerifyError::SecretMismatch => {
                                "authorization revoked"
                            }
                            AuthVerifyError::MembershipRevoked => "project access revoked",
                            AuthVerifyError::UserMismatch { .. }
                            | AuthVerifyError::Decode(_)
                            | AuthVerifyError::Session(_) => "authorization error",
                        };
                        let _ = send_error(&mut sender, message).await;
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
        project_id = %event.project_id,
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
    jwt: Arc<JwtService>,
    pool: PgPool,
    session_id: Uuid,
    session_secret: String,
    expected_user_id: Uuid,
    project_id: Uuid,
    pending_token: Option<String>,
}

impl WsAuthState {
    fn new(
        jwt: Arc<JwtService>,
        pool: PgPool,
        session_id: Uuid,
        session_secret: String,
        expected_user_id: Uuid,
        project_id: Uuid,
    ) -> Self {
        Self {
            jwt,
            pool,
            session_id,
            session_secret,
            expected_user_id,
            project_id,
            pending_token: None,
        }
    }

    fn store_token(&mut self, token: String) {
        self.pending_token = Some(token);
    }

    async fn verify(&mut self) -> Result<(), AuthVerifyError> {
        if let Some(token) = self.pending_token.take() {
            let identity = self.jwt.decode(&token).map_err(AuthVerifyError::Decode)?;
            self.apply_identity(identity).await?;
        }

        self.validate_session().await?;
        self.validate_membership().await
    }

    async fn apply_identity(&mut self, identity: JwtIdentity) -> Result<(), AuthVerifyError> {
        if identity.user_id != self.expected_user_id {
            return Err(AuthVerifyError::UserMismatch {
                expected: self.expected_user_id,
                received: identity.user_id,
            });
        }

        self.session_id = identity.session_id;
        self.session_secret = identity.nonce;
        self.validate_session().await
    }

    async fn validate_session(&self) -> Result<(), AuthVerifyError> {
        let repo = AuthSessionRepository::new(&self.pool);
        let session = repo
            .get(self.session_id)
            .await
            .map_err(AuthVerifyError::Session)?;

        if session.revoked_at.is_some() {
            return Err(AuthVerifyError::Revoked);
        }

        if !self
            .jwt
            .verify_session_secret(session.session_secret_hash.as_deref(), &self.session_secret)
            .unwrap_or(false)
        {
            return Err(AuthVerifyError::SecretMismatch);
        }

        Ok(())
    }

    async fn validate_membership(&self) -> Result<(), AuthVerifyError> {
        crate::routes::organization_members::ensure_project_access(
            &self.pool,
            self.expected_user_id,
            self.project_id,
        )
        .await
        .map(|_| ())
        .map_err(|error| {
            tracing::warn!(
                ?error,
                user_id = %self.expected_user_id,
                project_id = %self.project_id,
                "websocket membership validation failed"
            );
            AuthVerifyError::MembershipRevoked
        })
    }
}

#[derive(Debug, Error)]
enum AuthVerifyError {
    #[error(transparent)]
    Decode(#[from] JwtError),
    #[error("received token for unexpected user: expected {expected}, received {received}")]
    UserMismatch { expected: Uuid, received: Uuid },
    #[error(transparent)]
    Session(#[from] AuthSessionError),
    #[error("session revoked")]
    Revoked,
    #[error("session rotated")]
    SecretMismatch,
    #[error("organization membership revoked")]
    MembershipRevoked,
}

#[allow(clippy::too_many_arguments)]
async fn activity_stream_catch_up(
    sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    pool: &PgPool,
    project_id: Uuid,
    organization_id: Uuid,
    last_seq: i64,
    broker: &ActivityBroker,
    batch_size: i64,
    bulk_limit: i64,
    reason: &'static str,
) -> Result<(i64, ActivityStream), ()> {
    let mut activity_stream = broker.subscribe(project_id);

    let event = match activity_stream.next().await {
        Some(Ok(event)) => event,
        Some(Err(_)) | None => {
            let _ = send_error(sender, "activity backlog dropped").await;
            return Err(());
        }
    };
    let target_seq = event.seq;

    if target_seq <= last_seq {
        return Ok((last_seq, activity_stream));
    }

    let bulk_limit = bulk_limit.max(1);
    let diff = target_seq - last_seq;
    if diff > bulk_limit {
        tracing::info!(
            org_id = %organization_id,
            project_id = %project_id,
            threshold = bulk_limit,
            reason,
            "activity catch up exceeded threshold; forcing bulk sync"
        );
        let _ = send_error(sender, "activity backlog dropped").await;
        return Err(());
    }

    let catch_up_result = catch_up_from_db(
        sender,
        pool,
        project_id,
        organization_id,
        last_seq,
        target_seq,
        batch_size.max(1),
    )
    .await;

    match catch_up_result {
        Ok(seq) => Ok((seq, activity_stream)),
        Err(CatchUpError::Stale) => {
            let _ = send_error(sender, "activity backlog dropped").await;
            Err(())
        }
        Err(CatchUpError::Send) => Err(()),
    }
}

#[derive(Debug, Error)]
enum CatchUpError {
    #[error("activity stream went stale during catch up")]
    Stale,
    #[error("failed to send activity event")]
    Send,
}

async fn catch_up_from_db(
    sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    pool: &PgPool,
    project_id: Uuid,
    organization_id: Uuid,
    last_seq: i64,
    target_seq: i64,
    batch_size: i64,
) -> Result<i64, CatchUpError> {
    let repository = ActivityRepository::new(pool);
    let mut current_seq = last_seq;
    let mut cursor = last_seq;

    loop {
        let events = repository
            .fetch_since(project_id, Some(cursor), batch_size)
            .await
            .map_err(|error| {
                tracing::error!(?error, org_id = %organization_id, project_id = %project_id, "failed to fetch activity catch up");
                CatchUpError::Stale
            })?;

        if events.is_empty() {
            tracing::warn!(org_id = %organization_id, project_id = %project_id, "activity catch up returned no events");
            return Err(CatchUpError::Stale);
        }

        for event in events {
            if event.seq <= current_seq {
                continue;
            }
            if event.seq > target_seq {
                return Ok(current_seq);
            }
            if send_activity(sender, &event).await.is_err() {
                return Err(CatchUpError::Send);
            }
            current_seq = event.seq;
            cursor = event.seq;
        }

        if current_seq >= target_seq {
            break;
        }
    }

    Ok(current_seq)
}
