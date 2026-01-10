//! Configuration for API executors

use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Configuration for an API executor client
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiExecutorConfig {
    /// Base URL for the API
    pub base_url: String,

    /// API key (loaded from environment)
    #[serde(skip)]
    pub api_key: String,

    /// Request timeout in seconds
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,

    /// Maximum retries for failed requests
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,

    /// Default model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,

    /// Default max tokens
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_max_tokens: Option<u32>,

    /// Default temperature
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_temperature: Option<f32>,
}

fn default_timeout() -> u64 {
    120
}

fn default_max_retries() -> u32 {
    3
}

impl ApiExecutorConfig {
    /// Create configuration for Anthropic/Claude API
    pub fn anthropic() -> Result<Self, std::env::VarError> {
        Ok(Self {
            base_url: "https://api.anthropic.com".to_string(),
            api_key: std::env::var("ANTHROPIC_API_KEY")?,
            timeout_secs: default_timeout(),
            max_retries: default_max_retries(),
            default_model: Some("claude-sonnet-4-20250514".to_string()),
            default_max_tokens: Some(8192),
            default_temperature: None,
        })
    }

    /// Create configuration for Google AI/Gemini API
    pub fn google() -> Result<Self, std::env::VarError> {
        // Try GOOGLE_AI_API_KEY first, then GEMINI_API_KEY
        let api_key = std::env::var("GOOGLE_AI_API_KEY")
            .or_else(|_| std::env::var("GEMINI_API_KEY"))?;

        Ok(Self {
            base_url: "https://generativelanguage.googleapis.com".to_string(),
            api_key,
            timeout_secs: default_timeout(),
            max_retries: default_max_retries(),
            default_model: Some("gemini-2.0-flash".to_string()),
            default_max_tokens: Some(8192),
            default_temperature: None,
        })
    }

    /// Create configuration for OpenAI API
    pub fn openai() -> Result<Self, std::env::VarError> {
        Ok(Self {
            base_url: "https://api.openai.com".to_string(),
            api_key: std::env::var("OPENAI_API_KEY")?,
            timeout_secs: default_timeout(),
            max_retries: default_max_retries(),
            default_model: Some("gpt-4o".to_string()),
            default_max_tokens: Some(4096),
            default_temperature: None,
        })
    }

    /// Get timeout as Duration
    pub fn timeout(&self) -> Duration {
        Duration::from_secs(self.timeout_secs)
    }

    /// Create a reqwest client with this configuration
    pub fn create_client(&self) -> Result<reqwest::Client, reqwest::Error> {
        reqwest::Client::builder()
            .timeout(self.timeout())
            .build()
    }
}

/// Model information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    /// Model identifier
    pub id: String,

    /// Human-readable name
    pub name: String,

    /// Provider (anthropic, google, openai)
    pub provider: String,

    /// Maximum context window in tokens
    pub max_context: u32,

    /// Whether the model supports tool use
    pub supports_tools: bool,

    /// Whether the model supports vision
    pub supports_vision: bool,

    /// Whether the model supports streaming
    pub supports_streaming: bool,
}

impl ModelInfo {
    /// Claude Opus 4 model info
    pub fn claude_opus_4() -> Self {
        Self {
            id: "claude-opus-4-20250514".to_string(),
            name: "Claude Opus 4".to_string(),
            provider: "anthropic".to_string(),
            max_context: 200_000,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        }
    }

    /// Claude Sonnet 4 model info
    pub fn claude_sonnet_4() -> Self {
        Self {
            id: "claude-sonnet-4-20250514".to_string(),
            name: "Claude Sonnet 4".to_string(),
            provider: "anthropic".to_string(),
            max_context: 200_000,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        }
    }

    /// Gemini 2.0 Flash model info
    pub fn gemini_2_flash() -> Self {
        Self {
            id: "gemini-2.0-flash".to_string(),
            name: "Gemini 2.0 Flash".to_string(),
            provider: "google".to_string(),
            max_context: 1_000_000,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        }
    }

    /// GPT-4o model info
    pub fn gpt_4o() -> Self {
        Self {
            id: "gpt-4o".to_string(),
            name: "GPT-4o".to_string(),
            provider: "openai".to_string(),
            max_context: 128_000,
            supports_tools: true,
            supports_vision: true,
            supports_streaming: true,
        }
    }
}
