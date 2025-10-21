//! Type definitions for Claude Code control protocol
//!
//! Reference: https://github.com/ZhangHanDong/claude-code-api-rs/blob/main/claude-code-sdk-rs/src/types.rs

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Control request from CLI to SDK (incoming)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlRequestMessage {
    #[serde(rename = "type")]
    pub message_type: String, // "control_request"
    pub request_id: String,
    pub request: ControlRequestType,
}

/// Control response from SDK to CLI (outgoing)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponseMessage {
    #[serde(rename = "type")]
    pub message_type: String, // "control_response"
    pub response: ControlResponse,
}

/// Types of control requests
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "subtype", rename_all = "snake_case")]
pub enum ControlRequestType {
    CanUseTool {
        tool_name: String,
        input: Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        permission_suggestions: Option<Vec<PermissionUpdate>>,
    },
    HookCallback {
        #[serde(rename = "callback_id")]
        callback_id: String,
        input: Value,
    },
    // Add more as needed: Initialize, SetPermissionMode, etc.
}

/// Control response from SDK to CLI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponse {
    pub request_id: String,
    pub subtype: String, // "success" or "error"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Result of permission check
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "behavior", rename_all = "lowercase")]
pub enum PermissionResult {
    Allow {
        #[serde(rename = "updatedInput")]
        updated_input: Value,
        #[serde(rename = "updatedPermissions", skip_serializing_if = "Option::is_none")]
        updated_permissions: Option<Vec<PermissionUpdate>>,
    },
    Deny {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        interrupt: Option<bool>,
    },
}

/// Permission update operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionUpdate {
    #[serde(rename = "type")]
    pub update_type: String, // "setMode", "addRules", etc.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>, // "bypassPermissions", "plan", "default", "acceptEdits"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub destination: Option<String>, // "session", "userSettings", "projectSettings", "localSettings"
    // Add more fields as needed: rules, behavior, directories
}

/// Permission modes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    Default,
    AcceptEdits,
    Plan,
    BypassPermissions,
}

impl PermissionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::AcceptEdits => "acceptEdits",
            Self::Plan => "plan",
            Self::BypassPermissions => "bypassPermissions",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_mode_serialization() {
        let mode = PermissionMode::Plan;
        let json = serde_json::to_string(&mode).unwrap();
        assert_eq!(json, r#""plan""#);
    }

    #[test]
    fn test_control_request_deserialization() {
        let json = r#"{
            "request_id": "req_123",
            "subtype": "can_use_tool",
            "tool_name": "Write",
            "input": {"file_path": "test.txt", "content": "hello"}
        }"#;

        let req: ControlRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.request_id, "req_123");

        match req.request {
            ControlRequestType::CanUseTool { tool_name, .. } => {
                assert_eq!(tool_name, "Write");
            }
        }
    }

    #[test]
    fn test_permission_result_serialization() {
        let result = PermissionResult::Allow {
            updated_input: serde_json::json!({"file_path": "test.txt"}),
            updated_permissions: Some(vec![PermissionUpdate {
                update_type: "setMode".to_string(),
                mode: Some("bypassPermissions".to_string()),
                destination: Some("session".to_string()),
            }]),
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains(r#""behavior":"allow"#));
        assert!(json.contains(r#""updatedInput"#));
        assert!(json.contains(r#""updatedPermissions"#));
    }
}
