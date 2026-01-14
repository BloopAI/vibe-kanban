use db::models::task::TaskLabel;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing;

/// Predefined task categories with their colors
pub const CATEGORIES: &[(&str, &str)] = &[
    ("🎨 UI", "#8B5CF6"),          // purple
    ("⚙️ Logic", "#6366F1"),       // indigo
    ("🐛 Bug", "#EF4444"),         // red
    ("✨ Feature", "#22C55E"),     // green
    ("🔧 Refactor", "#F97316"),    // orange
    ("📚 Docs", "#3B82F6"),        // blue
    ("🧪 Test", "#14B8A6"),        // teal
    ("🔒 Security", "#DC2626"),    // dark red
    ("🚀 Performance", "#EAB308"), // yellow
    ("🔌 Integration", "#EC4899"), // pink
];

#[derive(Error, Debug)]
pub enum CategorizationError {
    #[error("API key not configured")]
    MissingApiKey,
    #[error("HTTP request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),
    #[error("Failed to parse response: {0}")]
    ParseError(String),
    #[error("API error: {0}")]
    ApiError(String),
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<Message>,
}

#[derive(Debug, Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
    #[serde(default)]
    error: Option<ApiErrorResponse>,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorResponse {
    message: String,
}

/// Service for categorizing tasks using LLM
pub struct CategorizationService {
    client: Client,
    api_key: Option<String>,
}

impl CategorizationService {
    pub fn new() -> Self {
        let api_key = std::env::var("ANTHROPIC_API_KEY").ok();
        Self {
            client: Client::new(),
            api_key,
        }
    }

    /// Check if the service is available (API key configured)
    pub fn is_available(&self) -> bool {
        self.api_key.is_some()
    }

    /// Categorize a task based on its title and description
    pub async fn categorize(
        &self,
        title: &str,
        description: Option<&str>,
    ) -> Result<Vec<TaskLabel>, CategorizationError> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or(CategorizationError::MissingApiKey)?;

        let prompt = self.build_prompt(title, description);

        let request = AnthropicRequest {
            model: "claude-3-5-haiku-latest".to_string(),
            max_tokens: 256,
            messages: vec![Message {
                role: "user".to_string(),
                content: prompt,
            }],
        };

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        let response_text = response.text().await?;

        if !status.is_success() {
            tracing::error!("Anthropic API error: {} - {}", status, response_text);
            return Err(CategorizationError::ApiError(format!(
                "API returned status {}: {}",
                status, response_text
            )));
        }

        let anthropic_response: AnthropicResponse = serde_json::from_str(&response_text)
            .map_err(|e| CategorizationError::ParseError(e.to_string()))?;

        if let Some(error) = anthropic_response.error {
            return Err(CategorizationError::ApiError(error.message));
        }

        // Extract text from response
        let text = anthropic_response
            .content
            .iter()
            .filter(|c| c.content_type == "text")
            .filter_map(|c| c.text.as_ref())
            .cloned()
            .collect::<Vec<String>>()
            .join("");

        self.parse_categories(&text)
    }

    fn build_prompt(&self, title: &str, description: Option<&str>) -> String {
        let categories_list = CATEGORIES
            .iter()
            .map(|(name, _)| format!("- {}", name))
            .collect::<Vec<_>>()
            .join("\n");

        let task_content = if let Some(desc) = description {
            if desc.trim().is_empty() {
                title.to_string()
            } else {
                format!("{}\n\n{}", title, desc)
            }
        } else {
            title.to_string()
        };

        format!(
            r#"You are a task categorization assistant. Analyze the following task and assign 1-2 category labels from this list:

{categories_list}

Category descriptions:
- 🎨 UI: User interface changes, styling, layout, visual components
- ⚙️ Logic: Business logic, algorithms, data flow, core functionality
- 🐛 Bug: Bug fixes, error handling, issue resolution
- ✨ Feature: New functionality, new capabilities
- 🔧 Refactor: Code cleanup, optimization, restructuring
- 📚 Docs: Documentation updates, comments, README changes
- 🧪 Test: Test coverage, QA, testing infrastructure
- 🔒 Security: Security fixes, authentication, authorization changes
- 🚀 Performance: Speed improvements, efficiency, optimization
- 🔌 Integration: API integrations, third-party services, external systems

Task:
{task_content}

Respond with ONLY a JSON array of category names (1-2 categories). Example: ["🎨 UI", "✨ Feature"]
Do not include any other text or explanation."#
        )
    }

    fn parse_categories(&self, response: &str) -> Result<Vec<TaskLabel>, CategorizationError> {
        // Try to extract JSON array from response
        let trimmed = response.trim();

        // Find JSON array in response
        let start = trimmed.find('[').ok_or_else(|| {
            CategorizationError::ParseError("No JSON array found in response".to_string())
        })?;
        let end = trimmed.rfind(']').ok_or_else(|| {
            CategorizationError::ParseError("No closing bracket found in response".to_string())
        })?;

        let json_str = &trimmed[start..=end];
        let categories: Vec<String> = serde_json::from_str(json_str)
            .map_err(|e| CategorizationError::ParseError(e.to_string()))?;

        // Map category names to TaskLabels with colors
        let labels: Vec<TaskLabel> = categories
            .iter()
            .filter_map(|cat| {
                CATEGORIES
                    .iter()
                    .find(|(name, _)| name == cat)
                    .map(|(name, color)| TaskLabel {
                        name: name.to_string(),
                        color: color.to_string(),
                    })
            })
            .take(2) // Limit to 2 categories
            .collect();

        Ok(labels)
    }
}

impl Default for CategorizationService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to test parsing without constructing the full service
    fn parse_categories_test(response: &str) -> Result<Vec<TaskLabel>, CategorizationError> {
        // Try to extract JSON array from response
        let trimmed = response.trim();

        // Find JSON array in response
        let start = trimmed.find('[').ok_or_else(|| {
            CategorizationError::ParseError("No JSON array found in response".to_string())
        })?;
        let end = trimmed.rfind(']').ok_or_else(|| {
            CategorizationError::ParseError("No closing bracket found in response".to_string())
        })?;

        let json_str = &trimmed[start..=end];
        let categories: Vec<String> = serde_json::from_str(json_str)
            .map_err(|e| CategorizationError::ParseError(e.to_string()))?;

        // Map category names to TaskLabels with colors
        let labels: Vec<TaskLabel> = categories
            .iter()
            .filter_map(|cat| {
                CATEGORIES
                    .iter()
                    .find(|(name, _)| name == cat)
                    .map(|(name, color)| TaskLabel {
                        name: name.to_string(),
                        color: color.to_string(),
                    })
            })
            .take(2) // Limit to 2 categories
            .collect();

        Ok(labels)
    }

    #[test]
    fn test_parse_categories_simple() {
        let result = parse_categories_test(r#"["🎨 UI", "✨ Feature"]"#);
        assert!(result.is_ok());
        let labels = result.unwrap();
        assert_eq!(labels.len(), 2);
        assert_eq!(labels[0].name, "🎨 UI");
        assert_eq!(labels[0].color, "#8B5CF6");
        assert_eq!(labels[1].name, "✨ Feature");
        assert_eq!(labels[1].color, "#22C55E");
    }

    #[test]
    fn test_parse_categories_with_surrounding_text() {
        let result =
            parse_categories_test(r#"Here are the categories: ["🐛 Bug"] based on analysis"#);
        assert!(result.is_ok());
        let labels = result.unwrap();
        assert_eq!(labels.len(), 1);
        assert_eq!(labels[0].name, "🐛 Bug");
    }

    #[test]
    fn test_parse_categories_limits_to_two() {
        let result = parse_categories_test(r#"["🎨 UI", "✨ Feature", "🐛 Bug"]"#);
        assert!(result.is_ok());
        let labels = result.unwrap();
        assert_eq!(labels.len(), 2);
    }

    #[test]
    fn test_parse_categories_invalid_category() {
        let result = parse_categories_test(r#"["🎨 UI", "Invalid Category"]"#);
        assert!(result.is_ok());
        let labels = result.unwrap();
        assert_eq!(labels.len(), 1); // Only valid category included
    }
}
