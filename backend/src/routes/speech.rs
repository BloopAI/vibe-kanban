use axum::{
    extract::State,
    http::StatusCode,
    response::Json as ResponseJson,
    Json, Router, routing::post,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{app_state::AppState, models::ApiResponse, utils::claude_config::get_anthropic_api_key};

#[derive(Deserialize)]
pub struct ProcessSpeechRequest {
    pub transcript: String,
    pub task_type: Option<TaskType>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    Title,
    Description,
}

#[derive(Serialize)]
pub struct ProcessSpeechResponse {
    pub enhanced_text: String,
    pub suggestions: Vec<String>,
}

pub async fn process_speech_text(
    State(_app_state): State<AppState>,
    Json(payload): Json<ProcessSpeechRequest>,
) -> Result<ResponseJson<ApiResponse<ProcessSpeechResponse>>, StatusCode> {
    // Get Anthropic API key from .claude.json or environment
    let api_key = get_anthropic_api_key();
    
    // If no API key is provided, return the original transcript
    let enhanced_text = if let Some(api_key) = api_key {
        // Create a prompt based on task type
        let prompt = match payload.task_type {
            Some(TaskType::Title) => {
                format!(
                    "Transform this speech transcript into a clear, concise task title. \
                    Make it actionable and specific. Keep it under 80 characters if possible.\n\n\
                    Transcript: \"{}\"\n\n\
                    Return only the improved title, nothing else.",
                    payload.transcript
                )
            }
            Some(TaskType::Description) => {
                format!(
                    "Transform this speech transcript into a well-structured task description. \
                    Fix any grammar issues, organize the content clearly, and make it actionable. \
                    Include relevant details while keeping it concise.\n\n\
                    Transcript: \"{}\"\n\n\
                    Return only the improved description, nothing else.",
                    payload.transcript
                )
            }
            None => {
                format!(
                    "Improve this speech transcript by fixing grammar, organizing the content, \
                    and making it more readable while preserving the original meaning.\n\n\
                    Transcript: \"{}\"\n\n\
                    Return only the improved text, nothing else.",
                    payload.transcript
                )
            }
        };

        // Create the request body
        let body = json!({
            "model": "claude-3-haiku-20240307",
            "max_tokens": 300,
            "messages": [{
                "role": "user",
                "content": prompt
            }]
        });

        // Make request to Anthropic API
        let client = reqwest::Client::new();
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("Content-Type", "application/json")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<serde_json::Value>().await {
                    Ok(response_body) => {
                        // Extract the enhanced text from the response
                        response_body
                            .get("content")
                            .and_then(|content| content.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|item| item.get("text"))
                            .and_then(|text| text.as_str())
                            .unwrap_or(&payload.transcript)
                            .to_string()
                    }
                    Err(_) => payload.transcript.clone()
                }
            }
            _ => payload.transcript.clone()
        }
    } else {
        // No API key, return original transcript
        payload.transcript.clone()
    };

    // Generate some basic suggestions
    let suggestions = match payload.task_type {
        Some(TaskType::Title) => vec![
            "Consider adding priority level".to_string(),
            "Specify timeline if urgent".to_string(),
        ],
        Some(TaskType::Description) => vec![
            "Add acceptance criteria".to_string(),
            "Include relevant files or context".to_string(),
            "Specify testing requirements".to_string(),
        ],
        None => vec![
            "Review for clarity".to_string(),
            "Add more context if needed".to_string(),
        ],
    };

    let response = ProcessSpeechResponse {
        enhanced_text,
        suggestions,
    };

    Ok(ResponseJson(ApiResponse::success(response)))
}

pub fn speech_router() -> Router<AppState> {
    Router::new()
        .route("/process-speech", post(process_speech_text))
}