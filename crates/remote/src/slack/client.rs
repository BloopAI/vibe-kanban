use reqwest::Client;
use serde::Deserialize;

const SLACK_API_BASE: &str = "https://slack.com/api";

#[derive(Debug, Deserialize)]
pub struct SlackResponse {
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum SlackClientError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Slack API error: {0}")]
    Api(String),
}

/// Validate a bot token using auth.test. Returns Ok(()) if valid.
pub async fn auth_test(http: &Client, bot_token: &str) -> Result<(), SlackClientError> {
    let resp: SlackResponse = http
        .post(format!("{SLACK_API_BASE}/auth.test"))
        .bearer_auth(bot_token)
        .send()
        .await?
        .json()
        .await?;

    if resp.ok {
        Ok(())
    } else {
        Err(SlackClientError::Api(
            resp.error.unwrap_or_else(|| "unknown_error".into()),
        ))
    }
}

/// Post a plain-text message to a Slack channel.
pub async fn post_message(
    http: &Client,
    bot_token: &str,
    channel_id: &str,
    text: &str,
) -> Result<(), SlackClientError> {
    let resp: SlackResponse = http
        .post(format!("{SLACK_API_BASE}/chat.postMessage"))
        .bearer_auth(bot_token)
        .json(&serde_json::json!({
            "channel": channel_id,
            "text": text,
        }))
        .send()
        .await?
        .json()
        .await?;

    if resp.ok {
        Ok(())
    } else {
        Err(SlackClientError::Api(
            resp.error.unwrap_or_else(|| "unknown_error".into()),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_test_response_ok_true_succeeds() {
        let body = serde_json::json!({ "ok": true, "user": "bot", "team": "MyTeam" });
        let resp: SlackResponse = serde_json::from_value(body).unwrap();
        assert!(resp.ok);
    }

    #[test]
    fn auth_test_response_ok_false_is_error() {
        let body = serde_json::json!({ "ok": false, "error": "invalid_auth" });
        let resp: SlackResponse = serde_json::from_value(body).unwrap();
        assert!(!resp.ok);
        assert_eq!(resp.error.as_deref(), Some("invalid_auth"));
    }
}
