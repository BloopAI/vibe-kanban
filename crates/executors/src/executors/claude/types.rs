//! Type definitions for Claude Code control protocol
//!
//! Similar to: https://github.com/ZhangHanDong/claude-code-api-rs/blob/main/claude-code-sdk-rs/src/types.rs

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

/// Control request from SDK to CLI (outgoing)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SDKControlRequestMessage {
    #[serde(rename = "type")]
    pub message_type: String, // "control_request"
    pub request_id: String,
    pub request: SDKControlRequestType,
}

/// Control response from SDK to CLI (outgoing)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponseMessage {
    #[serde(rename = "type")]
    pub message_type: String, // "control_response"
    pub response: ControlResponseType,
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
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_use_id: Option<String>,
    },
}

/// Control response from SDK to CLI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "subtype", rename_all = "snake_case")]
pub enum ControlResponseType {
    Success {
        request_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        response: Option<Value>,
    },
    Error {
        request_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "subtype", rename_all = "snake_case")]
pub enum SDKControlRequestType {
    SetPermissionMode {
        mode: PermissionMode,
    },
    Initialize {
        #[serde(skip_serializing_if = "Option::is_none")]
        hooks: Option<Value>,
    },
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
}

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

impl std::fmt::Display for PermissionMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
