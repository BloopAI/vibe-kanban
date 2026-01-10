//! OpenAI API Client (Chat Completions API)
//!
//! Implements the OpenAI Chat Completions API for direct AI interactions.
//! API Reference: https://platform.openai.com/docs/api-reference/chat

use std::pin::Pin;

use async_stream::try_stream;
use async_trait::async_trait;
use futures::Stream;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};

use super::{
    ApiExecutor, ApiExecutorConfig, ApiExecutorError, ApiRequest, ApiStreamEvent, ApiUsage,
};

const DEFAULT_MAX_TOKENS: u32 = 4096;

/// OpenAI API client using Chat Completions API
pub struct OpenAiApiClient {
    client: reqwest::Client,
    config: ApiExecutorConfig,
}

impl OpenAiApiClient {
    /// Create a new OpenAI API client
    pub fn new() -> Result<Self, ApiExecutorError> {
        let config = ApiExecutorConfig::openai()
            .map_err(|_| ApiExecutorError::MissingApiKey("OPENAI_API_KEY"))?;

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
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.config.api_key))
                .map_err(|_| ApiExecutorError::ConfigError("Invalid API key format".into()))?,
        );
        Ok(headers)
    }

    fn build_request_body(&self, request: &ApiRequest) -> OpenAiRequest {
        let model = if request.model.is_empty() {
            self.config
                .default_model
                .clone()
                .unwrap_or_else(|| "gpt-4o".to_string())
        } else {
            normalize_openai_model(&request.model)
        };

        let max_tokens = request
            .max_tokens
            .or(self.config.default_max_tokens)
            .unwrap_or(DEFAULT_MAX_TOKENS);

        let mut messages = Vec::new();

        // Add system message if provided
        if let Some(system) = &request.system_prompt {
            messages.push(OpenAiMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }

        // Add user message
        messages.push(OpenAiMessage {
            role: "user".to_string(),
            content: request.prompt.clone(),
        });

        OpenAiRequest {
            model,
            messages,
            max_completion_tokens: Some(max_tokens),
            temperature: request.temperature.or(self.config.default_temperature),
            stream: request.stream,
            stream_options: if request.stream {
                Some(StreamOptions {
                    include_usage: true,
                })
            } else {
                None
            },
        }
    }
}

#[async_trait]
impl ApiExecutor for OpenAiApiClient {
    async fn execute_stream(
        &self,
        request: ApiRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<ApiStreamEvent, ApiExecutorError>> + Send>>,
        ApiExecutorError,
    > {
        let headers = self.build_headers()?;
        let body = self.build_request_body(&request);

        let url = format!("{}/v1/chat/completions", self.config.base_url);

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
                    if line.is_empty() {
                        continue;
                    }

                    // Parse SSE data
                    if let Some(data) = line.strip_prefix("data: ") {
                        // Handle [DONE] marker
                        if data == "[DONE]" {
                            yield ApiStreamEvent::Done {
                                usage: None,
                                stop_reason: Some("stop".to_string()),
                            };
                            continue;
                        }

                        if let Ok(chunk) = serde_json::from_str::<OpenAiStreamChunk>(data) {
                            // Emit metadata on first chunk
                            if let Some(id) = chunk.id.as_ref() {
                                if chunk.choices.is_empty()
                                    || chunk.choices.first().is_some_and(|c| c.index == 0)
                                {
                                    yield ApiStreamEvent::Metadata {
                                        model: Some(chunk.model.clone()),
                                        message_id: Some(id.clone()),
                                    };
                                }
                            }

                            // Process choices
                            for choice in chunk.choices {
                                if let Some(delta) = choice.delta {
                                    // Handle content delta
                                    if let Some(content) = delta.content {
                                        if !content.is_empty() {
                                            yield ApiStreamEvent::ContentDelta {
                                                text: content,
                                                index: Some(choice.index),
                                            };
                                        }
                                    }

                                    // Handle tool calls
                                    if let Some(tool_calls) = delta.tool_calls {
                                        for tool_call in tool_calls {
                                            if let Some(function) = tool_call.function {
                                                yield ApiStreamEvent::ToolUse {
                                                    name: function.name.unwrap_or_default(),
                                                    input: serde_json::from_str(
                                                        &function.arguments.unwrap_or_default()
                                                    ).unwrap_or(serde_json::Value::Null),
                                                    id: tool_call.id,
                                                };
                                            }
                                        }
                                    }
                                }

                                // Check finish reason
                                if let Some(finish_reason) = choice.finish_reason {
                                    let usage = chunk.usage.as_ref().map(|u| ApiUsage {
                                        input_tokens: Some(u.prompt_tokens as u64),
                                        output_tokens: Some(u.completion_tokens as u64),
                                        total_tokens: Some(u.total_tokens as u64),
                                        ..Default::default()
                                    });

                                    yield ApiStreamEvent::Done {
                                        usage,
                                        stop_reason: Some(finish_reason),
                                    };
                                }
                            }
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
        "openai"
    }

    fn supported_models(&self) -> Vec<&'static str> {
        vec![
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4-turbo",
            "gpt-4",
            "o1",
            "o1-mini",
            "o3-mini",
        ]
    }
}

/// Normalize model name shortcuts to full OpenAI model IDs
fn normalize_openai_model(model: &str) -> String {
    match model.to_lowercase().as_str() {
        "gpt4o" | "gpt-4-o" | "4o" => "gpt-4o".to_string(),
        "gpt4o-mini" | "gpt-4o-mini" | "4o-mini" => "gpt-4o-mini".to_string(),
        "gpt4" | "gpt-4" | "4" => "gpt-4".to_string(),
        "gpt4-turbo" | "gpt-4-turbo" | "4-turbo" => "gpt-4-turbo".to_string(),
        "o1" | "o-1" => "o1".to_string(),
        "o1-mini" | "o-1-mini" => "o1-mini".to_string(),
        "o3-mini" | "o-3-mini" => "o3-mini".to_string(),
        _ => model.to_string(),
    }
}

// OpenAI API types

#[derive(Debug, Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_completion_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream_options: Option<StreamOptions>,
}

#[derive(Debug, Serialize)]
struct StreamOptions {
    include_usage: bool,
}

#[derive(Debug, Serialize)]
struct OpenAiMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiStreamChunk {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    model: String,
    #[serde(default)]
    choices: Vec<OpenAiChoice>,
    #[serde(default)]
    usage: Option<OpenAiUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    index: usize,
    #[serde(default)]
    delta: Option<OpenAiDelta>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OpenAiToolCall>>,
}

#[derive(Debug, Deserialize)]
struct OpenAiToolCall {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<OpenAiFunction>,
}

#[derive(Debug, Deserialize)]
struct OpenAiFunction {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_openai_model() {
        assert_eq!(normalize_openai_model("gpt4o"), "gpt-4o");
        assert_eq!(normalize_openai_model("4o"), "gpt-4o");
        assert_eq!(normalize_openai_model("gpt4"), "gpt-4");
        assert_eq!(normalize_openai_model("o1"), "o1");
        assert_eq!(normalize_openai_model("custom-model"), "custom-model");
    }

    #[test]
    fn test_request_serialization() {
        let request = OpenAiRequest {
            model: "gpt-4o".to_string(),
            messages: vec![
                OpenAiMessage {
                    role: "system".to_string(),
                    content: "You are helpful".to_string(),
                },
                OpenAiMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                },
            ],
            max_completion_tokens: Some(1000),
            temperature: Some(0.7),
            stream: true,
            stream_options: Some(StreamOptions {
                include_usage: true,
            }),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("max_completion_tokens"));
        assert!(json.contains("stream_options"));
        assert!(json.contains("Hello"));
    }

    #[test]
    fn test_stream_chunk_parsing() {
        let json = r#"{"id":"chatcmpl-123","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}"#;
        let chunk: OpenAiStreamChunk = serde_json::from_str(json).unwrap();

        assert_eq!(chunk.id, Some("chatcmpl-123".to_string()));
        assert_eq!(chunk.model, "gpt-4o");
        assert_eq!(chunk.choices.len(), 1);
        assert_eq!(
            chunk.choices[0].delta.as_ref().unwrap().content,
            Some("Hello".to_string())
        );
    }
}
