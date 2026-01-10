//! Gemini API Client (Google AI Studio API)
//!
//! Implements the Google AI Generative Language API for direct AI interactions.
//! API Reference: https://ai.google.dev/api/rest/v1beta/models/generateContent

use std::pin::Pin;

use async_stream::try_stream;
use async_trait::async_trait;
use futures::Stream;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};

use super::{
    ApiExecutor, ApiExecutorConfig, ApiExecutorError, ApiRequest, ApiStreamEvent, ApiUsage,
};

const DEFAULT_MAX_TOKENS: u32 = 8192;

/// Gemini API client using Google AI Studio API
pub struct GeminiApiClient {
    client: reqwest::Client,
    config: ApiExecutorConfig,
}

impl GeminiApiClient {
    /// Create a new Gemini API client
    pub fn new() -> Result<Self, ApiExecutorError> {
        let config = ApiExecutorConfig::google()
            .map_err(|_| ApiExecutorError::MissingApiKey("GOOGLE_AI_API_KEY or GEMINI_API_KEY"))?;

        let client = config.create_client()?;

        Ok(Self { client, config })
    }

    /// Create with custom configuration
    pub fn with_config(config: ApiExecutorConfig) -> Result<Self, ApiExecutorError> {
        let client = config.create_client()?;
        Ok(Self { client, config })
    }

    fn build_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers
    }

    fn build_url(&self, request: &ApiRequest, stream: bool) -> String {
        let model = if request.model.is_empty() {
            self.config
                .default_model
                .clone()
                .unwrap_or_else(|| "gemini-2.0-flash".to_string())
        } else {
            normalize_gemini_model(&request.model)
        };

        let action = if stream {
            "streamGenerateContent"
        } else {
            "generateContent"
        };

        format!(
            "{}/v1beta/models/{}:{}?key={}",
            self.config.base_url, model, action, self.config.api_key
        )
    }

    fn build_request_body(&self, request: &ApiRequest) -> GeminiRequest {
        let max_tokens = request
            .max_tokens
            .or(self.config.default_max_tokens)
            .unwrap_or(DEFAULT_MAX_TOKENS);

        let mut contents = Vec::new();

        // Add system instruction if provided
        let system_instruction = request.system_prompt.as_ref().map(|s| GeminiContent {
            role: None,
            parts: vec![GeminiPart::Text { text: s.clone() }],
        });

        // Add user message
        contents.push(GeminiContent {
            role: Some("user".to_string()),
            parts: vec![GeminiPart::Text {
                text: request.prompt.clone(),
            }],
        });

        GeminiRequest {
            contents,
            system_instruction,
            generation_config: Some(GeminiGenerationConfig {
                max_output_tokens: Some(max_tokens),
                temperature: request.temperature.or(self.config.default_temperature),
                top_p: None,
                top_k: None,
            }),
        }
    }
}

#[async_trait]
impl ApiExecutor for GeminiApiClient {
    async fn execute_stream(
        &self,
        request: ApiRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<ApiStreamEvent, ApiExecutorError>> + Send>>,
        ApiExecutorError,
    > {
        let headers = self.build_headers();
        let url = self.build_url(&request, true);
        let body = self.build_request_body(&request);

        // For streaming, append alt=sse
        let url = format!("{}&alt=sse", url);

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
                        if let Ok(response) = serde_json::from_str::<GeminiResponse>(data) {
                            for candidate in response.candidates.unwrap_or_default() {
                                if let Some(content) = candidate.content {
                                    for part in content.parts {
                                        match part {
                                            GeminiPart::Text { text } => {
                                                yield ApiStreamEvent::ContentDelta {
                                                    text,
                                                    index: None,
                                                };
                                            }
                                            GeminiPart::FunctionCall { function_call } => {
                                                yield ApiStreamEvent::ToolUse {
                                                    name: function_call.name,
                                                    input: function_call.args,
                                                    id: None,
                                                };
                                            }
                                        }
                                    }
                                }

                                // Check finish reason
                                if let Some(finish_reason) = candidate.finish_reason {
                                    if finish_reason == "STOP" || finish_reason == "MAX_TOKENS" {
                                        // Get usage if available
                                        let usage = response.usage_metadata.as_ref().map(|u| ApiUsage {
                                            input_tokens: Some(u.prompt_token_count as u64),
                                            output_tokens: Some(u.candidates_token_count as u64),
                                            total_tokens: Some(u.total_token_count as u64),
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
            }

            // Emit final done if not already done
            yield ApiStreamEvent::Done {
                usage: None,
                stop_reason: Some("end".to_string()),
            };
        };

        Ok(Box::pin(stream))
    }

    fn is_available(&self) -> bool {
        !self.config.api_key.is_empty()
    }

    fn provider_name(&self) -> &'static str {
        "google"
    }

    fn supported_models(&self) -> Vec<&'static str> {
        vec![
            "gemini-2.0-flash",
            "gemini-2.0-flash-thinking",
            "gemini-1.5-pro",
            "gemini-1.5-flash",
        ]
    }
}

/// Normalize model name shortcuts to full Gemini model IDs
fn normalize_gemini_model(model: &str) -> String {
    match model.to_lowercase().as_str() {
        "gemini-2" | "gemini2" | "gemini-flash" | "flash" => "gemini-2.0-flash".to_string(),
        "gemini-2-thinking" | "gemini-thinking" => "gemini-2.0-flash-thinking".to_string(),
        "gemini-pro" | "gemini-1.5-pro" | "pro" => "gemini-1.5-pro".to_string(),
        "gemini-1.5-flash" | "gemini-flash-1.5" => "gemini-1.5-flash".to_string(),
        _ => model.to_string(),
    }
}

// Gemini API types

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<String>,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum GeminiPart {
    Text { text: String },
    FunctionCall { function_call: GeminiFunctionCall },
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiFunctionCall {
    name: String,
    args: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponse {
    #[serde(default)]
    candidates: Option<Vec<GeminiCandidate>>,
    #[serde(default)]
    usage_metadata: Option<GeminiUsageMetadata>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiCandidate {
    #[serde(default)]
    content: Option<GeminiContent>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiUsageMetadata {
    prompt_token_count: u32,
    candidates_token_count: u32,
    total_token_count: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_gemini_model() {
        assert_eq!(normalize_gemini_model("gemini-2"), "gemini-2.0-flash");
        assert_eq!(normalize_gemini_model("flash"), "gemini-2.0-flash");
        assert_eq!(normalize_gemini_model("gemini-pro"), "gemini-1.5-pro");
        assert_eq!(normalize_gemini_model("custom-model"), "custom-model");
    }

    #[test]
    fn test_request_serialization() {
        let request = GeminiRequest {
            contents: vec![GeminiContent {
                role: Some("user".to_string()),
                parts: vec![GeminiPart::Text {
                    text: "Hello".to_string(),
                }],
            }],
            system_instruction: None,
            generation_config: Some(GeminiGenerationConfig {
                max_output_tokens: Some(1000),
                temperature: Some(0.7),
                top_p: None,
                top_k: None,
            }),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("maxOutputTokens"));
        assert!(json.contains("Hello"));
    }
}
