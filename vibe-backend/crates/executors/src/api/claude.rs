//! Claude API Client (Anthropic Messages API)
//!
//! Implements the Anthropic Messages API for direct AI interactions.
//! API Reference: https://docs.anthropic.com/en/api/messages

use std::pin::Pin;

use async_stream::try_stream;
use async_trait::async_trait;
use futures::Stream;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};

use super::{
    ApiExecutor, ApiExecutorConfig, ApiExecutorError, ApiRequest, ApiStreamEvent, ApiUsage,
};

const ANTHROPIC_VERSION: &str = "2023-06-01";
const DEFAULT_MAX_TOKENS: u32 = 8192;

/// Claude API client using Anthropic Messages API
pub struct ClaudeApiClient {
    client: reqwest::Client,
    config: ApiExecutorConfig,
}

impl ClaudeApiClient {
    /// Create a new Claude API client
    pub fn new() -> Result<Self, ApiExecutorError> {
        let config = ApiExecutorConfig::anthropic()
            .map_err(|_| ApiExecutorError::MissingApiKey("ANTHROPIC_API_KEY"))?;

        let client = config.create_client()?;

        Ok(Self { client, config })
    }

    /// Create with custom configuration
    pub fn with_config(config: ApiExecutorConfig) -> Result<Self, ApiExecutorError> {
        let client = config.create_client()?;
        Ok(Self { client, config })
    }

    fn build_headers(&self) -> Result<HeaderMap, ApiExecutorError> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            "x-api-key",
            HeaderValue::from_str(&self.config.api_key)
                .map_err(|_| ApiExecutorError::ConfigError("Invalid API key format".into()))?,
        );
        headers.insert(
            "anthropic-version",
            HeaderValue::from_static(ANTHROPIC_VERSION),
        );
        Ok(headers)
    }

    fn build_request_body(&self, request: &ApiRequest) -> AnthropicRequest {
        let model = if request.model.is_empty() {
            self.config
                .default_model
                .clone()
                .unwrap_or_else(|| "claude-sonnet-4-20250514".to_string())
        } else {
            // Normalize model names
            normalize_claude_model(&request.model)
        };

        let max_tokens = request
            .max_tokens
            .or(self.config.default_max_tokens)
            .unwrap_or(DEFAULT_MAX_TOKENS);

        AnthropicRequest {
            model,
            max_tokens,
            messages: vec![AnthropicMessage {
                role: "user".to_string(),
                content: request.prompt.clone(),
            }],
            system: request.system_prompt.clone(),
            temperature: request.temperature.or(self.config.default_temperature),
            stream: request.stream,
        }
    }

    #[allow(dead_code)]
    async fn parse_stream_line(
        &self,
        line: &str,
    ) -> Option<Result<ApiStreamEvent, ApiExecutorError>> {
        let line = line.trim();

        // Skip empty lines and comments
        if line.is_empty() || line.starts_with(':') {
            return None;
        }

        // Parse SSE event
        if let Some(data) = line.strip_prefix("data: ") {
            // Handle [DONE] marker
            if data == "[DONE]" {
                return Some(Ok(ApiStreamEvent::Done {
                    usage: None,
                    stop_reason: Some("end_turn".to_string()),
                }));
            }

            // Parse JSON event
            match serde_json::from_str::<AnthropicStreamEvent>(data) {
                Ok(event) => Some(self.convert_stream_event(event)),
                Err(e) => {
                    tracing::warn!("Failed to parse Claude stream event: {e}");
                    None
                }
            }
        } else {
            None
        }
    }

    #[allow(dead_code)]
    fn convert_stream_event(
        &self,
        event: AnthropicStreamEvent,
    ) -> Result<ApiStreamEvent, ApiExecutorError> {
        match event {
            AnthropicStreamEvent::MessageStart { message } => Ok(ApiStreamEvent::Metadata {
                model: Some(message.model),
                message_id: Some(message.id),
            }),
            AnthropicStreamEvent::ContentBlockStart { content_block, .. } => {
                match content_block.r#type.as_str() {
                    "text" => Ok(ApiStreamEvent::ContentDelta {
                        text: content_block.text.unwrap_or_default(),
                        index: None,
                    }),
                    "thinking" => Ok(ApiStreamEvent::ThinkingDelta {
                        thinking: content_block.thinking.unwrap_or_default(),
                    }),
                    "tool_use" => Ok(ApiStreamEvent::ToolUse {
                        name: content_block.name.unwrap_or_default(),
                        input: serde_json::Value::Object(serde_json::Map::new()),
                        id: content_block.id,
                    }),
                    _ => Ok(ApiStreamEvent::ContentDelta {
                        text: String::new(),
                        index: None,
                    }),
                }
            }
            AnthropicStreamEvent::ContentBlockDelta { delta, .. } => {
                if let Some(text) = delta.text {
                    Ok(ApiStreamEvent::ContentDelta { text, index: None })
                } else if let Some(thinking) = delta.thinking {
                    Ok(ApiStreamEvent::ThinkingDelta { thinking })
                } else if let Some(partial_json) = delta.partial_json {
                    // Tool input accumulation - just emit as content for now
                    Ok(ApiStreamEvent::ContentDelta {
                        text: partial_json,
                        index: None,
                    })
                } else {
                    Ok(ApiStreamEvent::ContentDelta {
                        text: String::new(),
                        index: None,
                    })
                }
            }
            AnthropicStreamEvent::ContentBlockStop { .. } => {
                // No-op for block stop
                Ok(ApiStreamEvent::ContentDelta {
                    text: String::new(),
                    index: None,
                })
            }
            AnthropicStreamEvent::MessageDelta { delta, usage } => {
                let api_usage = usage.map(|u| ApiUsage {
                    output_tokens: Some(u.output_tokens),
                    ..Default::default()
                });

                Ok(ApiStreamEvent::Done {
                    usage: api_usage,
                    stop_reason: delta.stop_reason,
                })
            }
            AnthropicStreamEvent::MessageStop => Ok(ApiStreamEvent::Done {
                usage: None,
                stop_reason: Some("end_turn".to_string()),
            }),
            AnthropicStreamEvent::Error { error } => Ok(ApiStreamEvent::Error {
                message: error.message,
                code: Some(error.r#type),
            }),
            AnthropicStreamEvent::Ping => Ok(ApiStreamEvent::ContentDelta {
                text: String::new(),
                index: None,
            }),
        }
    }
}

#[async_trait]
impl ApiExecutor for ClaudeApiClient {
    async fn execute_stream(
        &self,
        request: ApiRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<ApiStreamEvent, ApiExecutorError>> + Send>>,
        ApiExecutorError,
    > {
        let headers = self.build_headers()?;
        let body = self.build_request_body(&request);

        let url = format!("{}/v1/messages", self.config.base_url);

        let response = self
            .client
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_body = response.text().await.unwrap_or_default();

            if status.as_u16() == 429 {
                return Err(ApiExecutorError::RateLimited { retry_after: None });
            }

            return Err(ApiExecutorError::ApiError {
                status: status.as_u16(),
                message: error_body,
            });
        }

        let client = self.client.clone();
        let _ = client; // Silence unused warning for now

        let stream = try_stream! {
            let mut buffer = String::new();
            let mut byte_stream = response.bytes_stream();
            use futures::StreamExt;

            while let Some(chunk_result) = byte_stream.next().await {
                let chunk = chunk_result?;
                let chunk_str = String::from_utf8_lossy(&chunk);
                buffer.push_str(&chunk_str);

                // Process complete lines
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    let line = line.trim();
                    if line.is_empty() || line.starts_with(':') {
                        continue;
                    }

                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            yield ApiStreamEvent::Done {
                                usage: None,
                                stop_reason: Some("end_turn".to_string()),
                            };
                            continue;
                        }

                        if let Ok(event) = serde_json::from_str::<AnthropicStreamEvent>(data) {
                            let converted = match event {
                                AnthropicStreamEvent::MessageStart { message } => {
                                    ApiStreamEvent::Metadata {
                                        model: Some(message.model),
                                        message_id: Some(message.id),
                                    }
                                }
                                AnthropicStreamEvent::ContentBlockDelta { delta, .. } => {
                                    if let Some(text) = delta.text {
                                        ApiStreamEvent::ContentDelta { text, index: None }
                                    } else if let Some(thinking) = delta.thinking {
                                        ApiStreamEvent::ThinkingDelta { thinking }
                                    } else {
                                        continue;
                                    }
                                }
                                AnthropicStreamEvent::MessageDelta { delta, usage } => {
                                    ApiStreamEvent::Done {
                                        usage: usage.map(|u| ApiUsage {
                                            output_tokens: Some(u.output_tokens),
                                            ..Default::default()
                                        }),
                                        stop_reason: delta.stop_reason,
                                    }
                                }
                                AnthropicStreamEvent::MessageStop => {
                                    ApiStreamEvent::Done {
                                        usage: None,
                                        stop_reason: Some("end_turn".to_string()),
                                    }
                                }
                                AnthropicStreamEvent::Error { error } => {
                                    ApiStreamEvent::Error {
                                        message: error.message,
                                        code: Some(error.r#type),
                                    }
                                }
                                _ => continue,
                            };
                            yield converted;
                        }
                    }
                }
            }
        };

        Ok(Box::pin(stream))
    }

    fn is_available(&self) -> bool {
        !self.config.api_key.is_empty()
    }

    fn provider_name(&self) -> &'static str {
        "anthropic"
    }

    fn supported_models(&self) -> Vec<&'static str> {
        vec![
            "claude-opus-4-20250514",
            "claude-sonnet-4-20250514",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
        ]
    }
}

/// Normalize model name shortcuts to full Anthropic model IDs
fn normalize_claude_model(model: &str) -> String {
    match model.to_lowercase().as_str() {
        "claude-opus-4" | "opus-4" | "opus4" => "claude-opus-4-20250514".to_string(),
        "claude-sonnet-4" | "sonnet-4" | "sonnet4" => "claude-sonnet-4-20250514".to_string(),
        "claude-3.5-sonnet" | "claude-3-5-sonnet" | "sonnet-3.5" => {
            "claude-3-5-sonnet-20241022".to_string()
        }
        "claude-3.5-haiku" | "claude-3-5-haiku" | "haiku-3.5" => {
            "claude-3-5-haiku-20241022".to_string()
        }
        _ => model.to_string(),
    }
}

// Anthropic API types

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(dead_code)]
enum AnthropicStreamEvent {
    MessageStart {
        message: AnthropicMessageInfo,
    },
    ContentBlockStart {
        index: usize,
        content_block: AnthropicContentBlock,
    },
    ContentBlockDelta {
        index: usize,
        delta: AnthropicDelta,
    },
    ContentBlockStop {
        index: usize,
    },
    MessageDelta {
        delta: AnthropicMessageDelta,
        #[serde(default)]
        usage: Option<AnthropicUsage>,
    },
    MessageStop,
    Error {
        error: AnthropicError,
    },
    Ping,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessageInfo {
    id: String,
    model: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AnthropicContentBlock {
    r#type: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    thinking: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AnthropicDelta {
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    thinking: Option<String>,
    #[serde(default)]
    partial_json: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessageDelta {
    #[serde(default)]
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    output_tokens: u64,
}

#[derive(Debug, Deserialize)]
struct AnthropicError {
    r#type: String,
    message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_claude_model() {
        assert_eq!(
            normalize_claude_model("claude-opus-4"),
            "claude-opus-4-20250514"
        );
        assert_eq!(
            normalize_claude_model("sonnet-4"),
            "claude-sonnet-4-20250514"
        );
        assert_eq!(
            normalize_claude_model("claude-3.5-sonnet"),
            "claude-3-5-sonnet-20241022"
        );
        // Unknown models pass through
        assert_eq!(
            normalize_claude_model("custom-model"),
            "custom-model"
        );
    }

    #[test]
    fn test_stream_event_parsing() {
        let json = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;
        let event: AnthropicStreamEvent = serde_json::from_str(json).unwrap();

        match event {
            AnthropicStreamEvent::ContentBlockDelta { delta, .. } => {
                assert_eq!(delta.text, Some("Hello".to_string()));
            }
            _ => panic!("Expected ContentBlockDelta"),
        }
    }
}
