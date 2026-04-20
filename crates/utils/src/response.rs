use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ApiErrorEnvelope {
    /// Stable machine-readable error kind. Managers branch on this.
    pub kind: String,
    /// Whether the request can safely be retried as-is.
    pub retryable: bool,
    /// True when automatic retry will not help (missing auth, missing binary, etc.).
    pub human_intervention_required: bool,
    /// Last ~2 KiB of the executor's stderr, for diagnostic display.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr_tail: Option<String>,
    /// Executor program name (e.g. `"claude"`, `"codex"`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub program: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ApiResponse<T, E = T> {
    success: bool,
    data: Option<T>,
    error_data: Option<E>,
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    error: Option<ApiErrorEnvelope>,
}

impl<T, E> ApiResponse<T, E> {
    /// Creates a successful response, with `data` and no message.
    pub fn success(data: T) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            message: None,
            error_data: None,
            error: None,
        }
    }

    /// Creates an error response, with `message` and no data.
    pub fn error(message: &str) -> Self {
        ApiResponse {
            success: false,
            data: None,
            message: Some(message.to_string()),
            error_data: None,
            error: None,
        }
    }

    /// Creates an error response carrying a structured `ApiErrorEnvelope`.
    pub fn error_with_envelope(message: &str, envelope: ApiErrorEnvelope) -> Self {
        ApiResponse {
            success: false,
            data: None,
            message: Some(message.to_string()),
            error_data: None,
            error: Some(envelope),
        }
    }

    /// Creates an error response, with no `data`, no `message`, but with arbitrary `error_data`.
    pub fn error_with_data(data: E) -> Self {
        ApiResponse {
            success: false,
            data: None,
            error_data: Some(data),
            message: None,
            error: None,
        }
    }

    /// Returns true if the response was successful.
    pub fn is_success(&self) -> bool {
        self.success
    }

    /// Returns a reference to the error message if present.
    pub fn message(&self) -> Option<&str> {
        self.message.as_deref()
    }

    /// Returns a reference to the structured error envelope if present.
    pub fn error_envelope(&self) -> Option<&ApiErrorEnvelope> {
        self.error.as_ref()
    }

    /// Consumes the response, returning the data payload if present.
    pub fn into_data(self) -> Option<T> {
        self.data
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_round_trip_retains_all_fields() {
        let env = ApiErrorEnvelope {
            kind: "executor_not_found".to_string(),
            retryable: false,
            human_intervention_required: true,
            stderr_tail: Some("claude: command not found".to_string()),
            program: Some("claude".to_string()),
        };
        let json = serde_json::to_string(&env).expect("serialize");
        let back: ApiErrorEnvelope = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.kind, env.kind);
        assert_eq!(back.retryable, env.retryable);
        assert_eq!(
            back.human_intervention_required,
            env.human_intervention_required
        );
        assert_eq!(back.stderr_tail, env.stderr_tail);
        assert_eq!(back.program, env.program);
    }

    #[test]
    fn response_error_field_is_skipped_when_none() {
        let resp: ApiResponse<(), ()> = ApiResponse::error("oops");
        let json = serde_json::to_string(&resp).unwrap();
        assert!(
            !json.contains("\"error\":"),
            "unexpected `error` key in {json}"
        );
    }

    #[test]
    fn response_with_error_envelope_serializes() {
        let resp: ApiResponse<(), ()> = ApiResponse::error_with_envelope(
            "spawn failed",
            ApiErrorEnvelope {
                kind: "spawn_failed".to_string(),
                retryable: true,
                human_intervention_required: false,
                stderr_tail: None,
                program: None,
            },
        );
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"kind\":\"spawn_failed\""));
    }
}
