//! Type definitions for Claude Code control protocol
//!
//! Similar to: https://github.com/ZhangHanDong/claude-code-api-rs/blob/main/claude-code-sdk-rs/src/types.rs

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use ts_rs::TS;

/// Claude Code settings that can be passed to configure the CLI
/// Maps to the structure of ~/.claude/settings.json
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeSettings {
    /// Permissions configuration for tool access
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permissions: Option<ClaudeCodePermissions>,

    /// Hooks for automation (pre/post tool use, session events)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hooks: Option<ClaudeCodeHooks>,

    /// Maximum tokens for responses
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,

    /// Temperature for model responses (0.0 - 1.0)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,

    /// Custom system prompt to prepend
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,

    /// Additional environment variables to set
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<std::collections::HashMap<String, String>>,
}

/// Permissions configuration for Claude Code
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodePermissions {
    /// Tools to allow without prompting
    /// Examples: "Read", "Write", "Bash(git *)", "Bash(npm *)"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allowed_tools: Option<Vec<String>>,

    /// Tools to deny/block
    /// Examples: "Bash(rm *)", "Read(.env*)"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deny: Option<Vec<String>>,

    /// Default permission mode
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_mode: Option<String>,
}

/// Structure to deserialize ~/.claude/settings.json which uses different field names
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalClaudeSettings {
    #[serde(default)]
    pub permissions: Option<LocalClaudePermissions>,
    #[serde(default)]
    pub model: Option<String>,
}

/// Permissions from local settings file (uses "allow" instead of "allowedTools")
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalClaudePermissions {
    /// "allow" in local settings maps to "allowedTools"
    #[serde(default)]
    pub allow: Option<Vec<String>>,
    #[serde(default)]
    pub deny: Option<Vec<String>>,
    #[serde(default)]
    pub default_mode: Option<String>,
}

impl ClaudeCodeSettings {
    /// Load settings from the user's local ~/.claude/settings.json file
    pub fn load_from_local() -> Option<Self> {
        let home = dirs::home_dir()?;
        let settings_path = home.join(".claude").join("settings.json");
        Self::load_from_path(&settings_path)
    }

    /// Load settings from a specific path
    pub fn load_from_path(path: &PathBuf) -> Option<Self> {
        let content = std::fs::read_to_string(path).ok()?;
        let local: LocalClaudeSettings = serde_json::from_str(&content).ok()?;

        // Convert LocalClaudeSettings to ClaudeCodeSettings
        let permissions = local.permissions.map(|p| ClaudeCodePermissions {
            allowed_tools: p.allow,
            deny: p.deny,
            default_mode: p.default_mode,
        });

        Some(Self {
            permissions,
            hooks: None, // Local settings hooks have different structure, skip for now
            max_tokens: None,
            temperature: None,
            system_prompt: None,
            env: None,
        })
    }

    /// Merge with another settings object. `self` takes precedence (profile settings override local)
    pub fn merge_with_local(&self, local: &ClaudeCodeSettings) -> Self {
        Self {
            permissions: self.merge_permissions(&local.permissions),
            hooks: self.hooks.clone().or_else(|| local.hooks.clone()),
            max_tokens: self.max_tokens.or(local.max_tokens),
            temperature: self.temperature.or(local.temperature),
            system_prompt: self.system_prompt.clone().or_else(|| local.system_prompt.clone()),
            env: self.merge_env(&local.env),
        }
    }

    fn merge_permissions(
        &self,
        local_permissions: &Option<ClaudeCodePermissions>,
    ) -> Option<ClaudeCodePermissions> {
        match (&self.permissions, local_permissions) {
            (Some(profile), Some(local)) => Some(ClaudeCodePermissions {
                // Profile allowed_tools override local, but merge deny lists
                allowed_tools: profile.allowed_tools.clone().or_else(|| local.allowed_tools.clone()),
                deny: Self::merge_vec_option(&profile.deny, &local.deny),
                default_mode: profile.default_mode.clone().or_else(|| local.default_mode.clone()),
            }),
            (Some(profile), None) => Some(profile.clone()),
            (None, Some(local)) => Some(local.clone()),
            (None, None) => None,
        }
    }

    fn merge_vec_option(
        a: &Option<Vec<String>>,
        b: &Option<Vec<String>>,
    ) -> Option<Vec<String>> {
        match (a, b) {
            (Some(a_vec), Some(b_vec)) => {
                let mut merged = a_vec.clone();
                for item in b_vec {
                    if !merged.contains(item) {
                        merged.push(item.clone());
                    }
                }
                Some(merged)
            }
            (Some(a_vec), None) => Some(a_vec.clone()),
            (None, Some(b_vec)) => Some(b_vec.clone()),
            (None, None) => None,
        }
    }

    fn merge_env(
        &self,
        local_env: &Option<std::collections::HashMap<String, String>>,
    ) -> Option<std::collections::HashMap<String, String>> {
        match (&self.env, local_env) {
            (Some(profile_env), Some(local_env)) => {
                let mut merged = local_env.clone();
                merged.extend(profile_env.clone()); // Profile takes precedence
                Some(merged)
            }
            (Some(env), None) => Some(env.clone()),
            (None, Some(env)) => Some(env.clone()),
            (None, None) => None,
        }
    }
}

/// Hooks configuration for Claude Code automation
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, JsonSchema, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub struct ClaudeCodeHooks {
    /// Hooks to run before a tool is used
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pre_tool_use: Option<Vec<ClaudeCodeHookEntry>>,

    /// Hooks to run after a tool is used
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub post_tool_use: Option<Vec<ClaudeCodeHookEntry>>,

    /// Hooks to run when user submits a prompt
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_prompt_submit: Option<Vec<ClaudeCodeHookEntry>>,

    /// Hooks to run at session start
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_start: Option<Vec<ClaudeCodeHookEntry>>,

    /// Hooks to run at session end
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_end: Option<Vec<ClaudeCodeHookEntry>>,

    /// Hooks to run when the agent stops
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<ClaudeCodeHookEntry>>,
}

/// A single hook entry
#[derive(Debug, Clone, Serialize, Deserialize, TS, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeHookEntry {
    /// Pattern to match (regex for tool names, glob for files)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matcher: Option<String>,

    /// Hook actions to execute
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hooks: Option<Vec<ClaudeCodeHookAction>>,

    /// Hook callback IDs for custom handling
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hook_callback_ids: Option<Vec<String>>,
}

/// A hook action (command to run)
#[derive(Debug, Clone, Serialize, Deserialize, TS, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeHookAction {
    /// Type of hook action (usually "command")
    #[serde(rename = "type")]
    pub action_type: String,

    /// The command to execute
    pub command: String,
}

/// Top-level message types from CLI stdout
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CLIMessage {
    ControlRequest {
        request_id: String,
        request: ControlRequestType,
    },
    ControlResponse {
        response: ControlResponseType,
    },
    Result(serde_json::Value),
    #[serde(untagged)]
    Other(serde_json::Value),
}

/// Control request from SDK to CLI (outgoing)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SDKControlRequest {
    #[serde(rename = "type")]
    message_type: String, // Always "control_request"
    pub request_id: String,
    pub request: SDKControlRequestType,
}

impl SDKControlRequest {
    pub fn new(request: SDKControlRequestType) -> Self {
        use uuid::Uuid;
        Self {
            message_type: "control_request".to_string(),
            request_id: Uuid::new_v4().to_string(),
            request,
        }
    }
}

/// Control response from SDK to CLI (outgoing)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponseMessage {
    #[serde(rename = "type")]
    message_type: String, // Always "control_response"
    pub response: ControlResponseType,
}

impl ControlResponseMessage {
    pub fn new(response: ControlResponseType) -> Self {
        Self {
            message_type: "control_response".to_string(),
            response,
        }
    }
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
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_use_id: Option<String>,
    },
    HookCallback {
        #[serde(rename = "callback_id")]
        callback_id: String,
        input: Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_use_id: Option<String>,
    },
}

/// Result of permission check
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "behavior", rename_all = "camelCase")]
pub enum PermissionResult {
    Allow {
        #[serde(rename = "updatedInput")]
        updated_input: Value,
        #[serde(skip_serializing_if = "Option::is_none", rename = "updatedPermissions")]
        updated_permissions: Option<Vec<PermissionUpdate>>,
    },
    Deny {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        interrupt: Option<bool>,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionUpdateType {
    SetMode,
    AddRules,
    RemoveRules,
    ClearRules,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionUpdateDestination {
    Session,
    UserSettings,
    ProjectSettings,
    LocalSettings,
}

/// Permission update operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionUpdate {
    #[serde(rename = "type")]
    pub update_type: PermissionUpdateType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<PermissionMode>,
    pub destination: PermissionUpdateDestination,
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
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Message {
    User { message: ClaudeUserMessage },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeUserMessage {
    role: String,
    content: String,
}

impl Message {
    pub fn new_user(content: String) -> Self {
        Self::User {
            message: ClaudeUserMessage {
                role: "user".to_string(),
                content,
            },
        }
    }
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
    Interrupt {},
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
