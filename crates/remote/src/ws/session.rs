use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use tokio_stream::wrappers::BroadcastStream;

use super::{
    WsQueryParams,
    message::{ClientMessage, ServerMessage},
};
use crate::{
    AppState, activity::ActivityEvent, auth::RequestContext, db::activity::ActivityRepository,
};

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

    dbg!("Starting websocket session for org:", &org_id);

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
                        if let Message::Text(text) = msg
                             && let Err(error) = handle_inbound_message(&text).await {
                                tracing::debug!(?error, "invalid inbound message");
                            }

                    }
                    Some(Err(error)) => {
                        tracing::debug!(?error, "websocket receive error");
                        break;
                    }
                    None => break,
                }
            }
        }
    }
}

async fn send_activity(
    sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    event: &ActivityEvent,
) -> Result<(), ()> {
    dbg!("Sending activity event:", event.event_type.as_str());

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

async fn handle_inbound_message(payload: &str) -> Result<(), serde_json::Error> {
    let message: ClientMessage = serde_json::from_str(payload)?;
    match message {
        ClientMessage::Ack { cursor: _ } => {
            // No-op for now;
        }
    }
    Ok(())
}
