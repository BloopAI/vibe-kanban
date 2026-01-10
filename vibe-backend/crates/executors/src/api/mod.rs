//! API Executor Module
//!
//! This module provides direct HTTP API-based execution for AI agents,
//! enabling inline prompt interactions without spawning CLI processes.

pub mod claude;
pub mod config;
pub mod error;
pub mod gemini;
pub mod openai;
pub mod types;

use std::pin::Pin;

use async_trait::async_trait;
use futures::Stream;

pub use self::claude::ClaudeApiClient;
pub use self::config::ApiExecutorConfig;
pub use self::error::ApiExecutorError;
pub use self::gemini::GeminiApiClient;
pub use self::openai::OpenAiApiClient;
pub use self::types::{ApiRequest, ApiStreamEvent, ApiUsage};

/// Trait for API-based AI agent execution
#[async_trait]
pub trait ApiExecutor: Send + Sync {
    /// Execute a prompt and return a streaming response
    async fn execute_stream(
        &self,
        request: ApiRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<ApiStreamEvent, ApiExecutorError>> + Send>>,
        ApiExecutorError,
    >;

    /// Check if the API key is configured and valid
    fn is_available(&self) -> bool;

    /// Get the provider name (e.g., "anthropic", "google", "openai")
    fn provider_name(&self) -> &'static str;

    /// Get supported model names
    fn supported_models(&self) -> Vec<&'static str>;
}

/// Factory for creating API executor clients based on provider
pub struct ApiExecutorFactory;

impl ApiExecutorFactory {
    /// Create an API executor for the given provider
    pub fn create(provider: &str) -> Result<Box<dyn ApiExecutor>, ApiExecutorError> {
        match provider.to_lowercase().as_str() {
            "claude" | "anthropic" | "claude_code" => {
                Ok(Box::new(ClaudeApiClient::new()?))
            }
            "gemini" | "google" => {
                Ok(Box::new(GeminiApiClient::new()?))
            }
            "openai" | "codex" | "gpt" => {
                Ok(Box::new(OpenAiApiClient::new()?))
            }
            _ => Err(ApiExecutorError::UnsupportedProvider(provider.to_string())),
        }
    }

    /// Check which providers are available (have API keys configured)
    pub fn available_providers() -> Vec<&'static str> {
        let mut providers = Vec::new();

        if std::env::var("ANTHROPIC_API_KEY").is_ok() {
            providers.push("anthropic");
        }
        if std::env::var("GOOGLE_AI_API_KEY").is_ok()
            || std::env::var("GEMINI_API_KEY").is_ok()
        {
            providers.push("google");
        }
        if std::env::var("OPENAI_API_KEY").is_ok() {
            providers.push("openai");
        }

        providers
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_available_providers_empty_without_env() {
        // This test just verifies the function doesn't panic
        let _providers = ApiExecutorFactory::available_providers();
    }
}
