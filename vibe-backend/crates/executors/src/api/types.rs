//! Common types for API executor operations

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Request to an API executor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiRequest {
    /// The prompt to send to the AI
    pub prompt: String,

    /// The model to use (e.g., "claude-sonnet-4", "gemini-2.0-flash")
    pub model: String,

    /// System prompt/instructions
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,

    /// Maximum tokens to generate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,

    /// Temperature for generation (0.0 - 2.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,

    /// Whether to stream the response
    #[serde(default = "default_stream")]
    pub stream: bool,

    /// Optional context about the task
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<TaskContext>,
}

fn default_stream() -> bool {
    true
}

impl ApiRequest {
    /// Create a new API request with just a prompt and model
    pub fn new(prompt: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            prompt: prompt.into(),
            model: model.into(),
            system_prompt: None,
            max_tokens: None,
            temperature: None,
            stream: true,
            context: None,
        }
    }

    /// Add a system prompt
    pub fn with_system_prompt(mut self, system_prompt: impl Into<String>) -> Self {
        self.system_prompt = Some(system_prompt.into());
        self
    }

    /// Set max tokens
    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = Some(max_tokens);
        self
    }

    /// Set temperature
    pub fn with_temperature(mut self, temperature: f32) -> Self {
        self.temperature = Some(temperature);
        self
    }

    /// Disable streaming
    pub fn without_streaming(mut self) -> Self {
        self.stream = false;
        self
    }

    /// Add task context
    pub fn with_context(mut self, context: TaskContext) -> Self {
        self.context = Some(context);
        self
    }
}

/// Context about the task being worked on
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskContext {
    /// Task ID
    pub task_id: String,

    /// Task title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,

    /// Task description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Working directory path
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,

    /// Files relevant to the task
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub relevant_files: Vec<String>,
}

/// Events emitted during streaming API execution
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum ApiStreamEvent {
    /// Content being streamed
    ContentDelta {
        /// The text content delta
        text: String,
        /// Index for content ordering
        #[serde(skip_serializing_if = "Option::is_none")]
        index: Option<usize>,
    },

    /// Thinking/reasoning content (for models that support it)
    ThinkingDelta {
        /// The thinking content delta
        thinking: String,
    },

    /// Tool use request from the model
    ToolUse {
        /// Tool name
        name: String,
        /// Tool input as JSON
        input: serde_json::Value,
        /// Tool use ID for correlation
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },

    /// Stream completed successfully
    Done {
        /// Token usage information
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<ApiUsage>,
        /// Stop reason
        #[serde(skip_serializing_if = "Option::is_none")]
        stop_reason: Option<String>,
    },

    /// Error occurred during streaming
    Error {
        /// Error message
        message: String,
        /// Error code if available
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
    },

    /// Metadata about the response
    Metadata {
        /// Model used
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        /// Message ID
        #[serde(skip_serializing_if = "Option::is_none")]
        message_id: Option<String>,
    },
}

/// Token usage information
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ApiUsage {
    /// Input tokens consumed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u64>,

    /// Output tokens generated
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u64>,

    /// Cache creation tokens (Anthropic-specific)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u64>,

    /// Cache read tokens (Anthropic-specific)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u64>,

    /// Total tokens
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u64>,
}

impl ApiUsage {
    /// Calculate total tokens if not already set
    pub fn calculate_total(&mut self) {
        if self.total_tokens.is_none() {
            self.total_tokens = Some(
                self.input_tokens.unwrap_or(0) + self.output_tokens.unwrap_or(0),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_request_builder() {
        let request = ApiRequest::new("Hello", "claude-sonnet-4")
            .with_system_prompt("You are helpful")
            .with_max_tokens(1000)
            .with_temperature(0.7);

        assert_eq!(request.prompt, "Hello");
        assert_eq!(request.model, "claude-sonnet-4");
        assert_eq!(request.system_prompt, Some("You are helpful".to_string()));
        assert_eq!(request.max_tokens, Some(1000));
        assert_eq!(request.temperature, Some(0.7));
        assert!(request.stream);
    }

    #[test]
    fn test_api_usage_calculate_total() {
        let mut usage = ApiUsage {
            input_tokens: Some(100),
            output_tokens: Some(50),
            ..Default::default()
        };

        usage.calculate_total();
        assert_eq!(usage.total_tokens, Some(150));
    }
}
