use std::time::Duration;

use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::tungstenite::Message;
use tracing::{error, info, warn};

use crate::services::tick::{SlackContext, TickTrigger, TickTriggerSender};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackConfig {
    pub bot_token: String,
    pub app_token: String,
    pub default_channel: String,
}

impl SlackConfig {
    /// Load Slack config from asset_dir()/slack.json, falling back to env vars.
    pub fn load() -> Option<Self> {
        let config_path = utils::assets::asset_dir().join("slack.json");

        if let Ok(contents) = std::fs::read_to_string(&config_path) {
            match serde_json::from_str::<SlackConfig>(&contents) {
                Ok(config) => return Some(config),
                Err(e) => warn!("Failed to parse slack.json: {}", e),
            }
        }

        // Fall back to environment variables
        let bot_token = std::env::var("SLACK_BOT_TOKEN").ok()?;
        let app_token = std::env::var("SLACK_APP_TOKEN").ok()?;
        let default_channel =
            std::env::var("SLACK_DEFAULT_CHANNEL").unwrap_or_else(|_| String::new());

        Some(SlackConfig {
            bot_token,
            app_token,
            default_channel,
        })
    }
}

/// Response from Slack's apps.connections.open
#[derive(Debug, Deserialize)]
struct ConnectionOpenResponse {
    ok: bool,
    url: Option<String>,
    error: Option<String>,
}

/// Envelope wrapping all Socket Mode messages
#[derive(Debug, Deserialize)]
struct SocketEnvelope {
    envelope_id: Option<String>,
    #[serde(rename = "type")]
    event_type: Option<String>,
    payload: Option<serde_json::Value>,
}

/// Slash command payload
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SlashCommand {
    command: Option<String>,
    text: Option<String>,
    user_id: Option<String>,
    channel_id: Option<String>,
}

/// Events API payload wrapper (Socket Mode wraps the event callback)
#[derive(Debug, Deserialize)]
struct EventsApiPayload {
    event: Option<EventPayload>,
}

/// Individual event within an Events API callback
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct EventPayload {
    #[serde(rename = "type")]
    event_type: Option<String>,
    text: Option<String>,
    user: Option<String>,
    channel: Option<String>,
    ts: Option<String>,
}

/// Acknowledgement message sent back over WebSocket
#[derive(Debug, Serialize)]
struct Acknowledge {
    envelope_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
}

pub struct SlackService;

impl SlackService {
    pub fn spawn(config: SlackConfig, tick_trigger: TickTriggerSender) {
        tokio::spawn(async move {
            loop {
                if let Err(e) = Self::run(&config, &tick_trigger).await {
                    error!("Slack Socket Mode connection error: {}", e);
                }
                info!("Reconnecting to Slack in 5 seconds...");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });
    }

    async fn run(
        config: &SlackConfig,
        tick_trigger: &TickTriggerSender,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Step 1: Get WebSocket URL via apps.connections.open
        let client = reqwest::Client::new();
        let resp: ConnectionOpenResponse = client
            .post("https://slack.com/api/apps.connections.open")
            .header("Authorization", format!("Bearer {}", config.app_token))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .send()
            .await?
            .json()
            .await?;

        if !resp.ok {
            return Err(format!(
                "apps.connections.open failed: {}",
                resp.error.unwrap_or_default()
            )
            .into());
        }

        let wss_url = resp.url.ok_or("No WebSocket URL in response")?;

        info!("Connected to Slack Socket Mode");

        // Step 2: Connect to WebSocket
        let (ws_stream, _) = tokio_tungstenite::connect_async(&wss_url).await?;
        let (mut write, mut read) = ws_stream.split();

        // Step 3: Process messages
        while let Some(msg) = read.next().await {
            let msg = match msg {
                Ok(m) => m,
                Err(e) => {
                    error!("WebSocket read error: {}", e);
                    break;
                }
            };

            let text = match msg {
                Message::Text(t) => t,
                Message::Ping(_) => continue,
                Message::Close(_) => {
                    info!("Slack WebSocket closed");
                    break;
                }
                _ => continue,
            };

            let envelope: SocketEnvelope = match serde_json::from_str(&text) {
                Ok(e) => e,
                Err(e) => {
                    warn!("Failed to parse Socket Mode message: {}", e);
                    continue;
                }
            };

            let event_type = envelope.event_type.as_deref().unwrap_or("");

            match event_type {
                "hello" => {
                    info!("Slack Socket Mode handshake complete");
                }
                "disconnect" => {
                    info!("Slack requested disconnect, will reconnect");
                    break;
                }
                "slash_commands" => {
                    // Acknowledge immediately
                    if let Some(envelope_id) = &envelope.envelope_id {
                        let ack = Acknowledge {
                            envelope_id: envelope_id.clone(),
                            payload: Some(serde_json::json!({
                                "text": "Tick triggered!"
                            })),
                        };
                        let ack_json = serde_json::to_string(&ack)?;
                        write.send(Message::Text(ack_json.into())).await?;
                    }

                    // Parse the slash command
                    if let Some(payload) = &envelope.payload {
                        let cmd: SlashCommand =
                            serde_json::from_value(payload.clone()).unwrap_or(SlashCommand {
                                command: None,
                                text: None,
                                user_id: None,
                                channel_id: None,
                            });

                        let trigger_id = if let Some(text) = &cmd.text {
                            let trimmed = text.trim();
                            if trimmed.is_empty() {
                                "slack".to_string()
                            } else {
                                format!("slack:{}", trimmed)
                            }
                        } else {
                            "slack".to_string()
                        };

                        info!(
                            "Slack slash command from user {:?} in channel {:?}: trigger={}",
                            cmd.user_id, cmd.channel_id, trigger_id
                        );

                        if let Err(e) = tick_trigger.send(TickTrigger {
                            trigger_id,
                            slack_context: None,
                        }) {
                            error!("Failed to send tick trigger from Slack: {}", e);
                        }
                    }
                }
                "events_api" => {
                    // Acknowledge immediately
                    if let Some(envelope_id) = &envelope.envelope_id {
                        let ack = Acknowledge {
                            envelope_id: envelope_id.clone(),
                            payload: None,
                        };
                        let ack_json = serde_json::to_string(&ack)?;
                        write.send(Message::Text(ack_json.into())).await?;
                    }

                    // Handle app_mention events
                    if let Some(payload) = &envelope.payload {
                        if let Ok(events_payload) =
                            serde_json::from_value::<EventsApiPayload>(payload.clone())
                        {
                            if let Some(event) = events_payload.event {
                                if event.event_type.as_deref() == Some("app_mention") {
                                    // Strip the @mention from the text to get the trigger ID
                                    let trigger_id = event
                                        .text
                                        .as_deref()
                                        .map(|t| {
                                            // Text looks like "<@U123ABC> some text"
                                            // Strip the mention prefix
                                            let trimmed = if let Some(rest) = t.split('>').nth(1) {
                                                rest.trim()
                                            } else {
                                                t.trim()
                                            };
                                            if trimmed.is_empty() {
                                                "slack".to_string()
                                            } else {
                                                format!("slack:{}", trimmed)
                                            }
                                        })
                                        .unwrap_or_else(|| "slack".to_string());

                                    // Build Slack context for thread replies
                                    let slack_context = match (&event.channel, &event.ts) {
                                        (Some(channel), Some(ts)) => Some(SlackContext {
                                            channel: channel.clone(),
                                            thread_ts: ts.clone(),
                                        }),
                                        _ => None,
                                    };

                                    info!(
                                        "Slack app_mention from user {:?} in channel {:?} (ts={:?}): trigger={}",
                                        event.user, event.channel, event.ts, trigger_id
                                    );

                                    if let Err(e) = tick_trigger.send(TickTrigger {
                                        trigger_id,
                                        slack_context,
                                    }) {
                                        error!("Failed to send tick trigger from Slack: {}", e);
                                    }
                                }
                            }
                        }
                    }
                }
                "interactive" => {
                    // Acknowledge but don't act on interactive events
                    if let Some(envelope_id) = &envelope.envelope_id {
                        let ack = Acknowledge {
                            envelope_id: envelope_id.clone(),
                            payload: None,
                        };
                        let ack_json = serde_json::to_string(&ack)?;
                        write.send(Message::Text(ack_json.into())).await?;
                    }
                }
                _ => {
                    // Acknowledge unknown events
                    if let Some(envelope_id) = &envelope.envelope_id {
                        let ack = Acknowledge {
                            envelope_id: envelope_id.clone(),
                            payload: None,
                        };
                        let ack_json = serde_json::to_string(&ack)?;
                        write.send(Message::Text(ack_json.into())).await?;
                    }
                }
            }
        }

        Ok(())
    }
}
