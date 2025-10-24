use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::{command::CmdOverrides, executors::AppendPrompt};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Autonomy {
    Normal,
    Low,
    Medium,
    High,
    SkipPermissionsUnsafe,
}

fn default_autonomy() -> Autonomy {
    Autonomy::SkipPermissionsUnsafe
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(rename = "DroidReasoningEffort")]
pub enum ReasoningEffortLevel {
    None,
    Dynamic,
    Off,
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Droid {
    #[serde(default)]
    pub append_prompt: AppendPrompt,

    #[serde(default = "default_autonomy")]
    #[schemars(
        title = "Autonomy Level",
        description = "Permission level for file and system operations"
    )]
    pub autonomy: Autonomy,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Model",
        description = "Model to use (e.g., gpt-5-codex, claude-sonnet-4-5-20250929, gpt-5-2025-08-07, claude-opus-4-1-20250805, claude-haiku-4-5-20251001, glm-4.6)"
    )]
    pub model: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Reasoning Effort",
        description = "Reasoning effort level: none, dynamic, off, low, medium, high"
    )]
    pub reasoning_effort: Option<ReasoningEffortLevel>,

    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Droid {
    pub fn build_command_builder(&self) -> crate::command::CommandBuilder {
        use crate::command::{CommandBuilder, apply_overrides};

        let mut builder =
            CommandBuilder::new("droid exec").params(["--output-format", "stream-json"]);

        let autonomy_args: Vec<&str> = match &self.autonomy {
            Autonomy::Normal => vec![],
            Autonomy::Low => vec!["--auto", "low"],
            Autonomy::Medium => vec!["--auto", "medium"],
            Autonomy::High => vec!["--auto", "high"],
            Autonomy::SkipPermissionsUnsafe => vec!["--skip-permissions-unsafe"],
        };
        builder = builder.extend_params(autonomy_args);

        if let Some(ref model) = self.model {
            builder = builder.extend_params(["--model", model]);
        }

        if let Some(ref effort) = self.reasoning_effort {
            let effort_str = match effort {
                ReasoningEffortLevel::None => "none",
                ReasoningEffortLevel::Dynamic => "dynamic",
                ReasoningEffortLevel::Off => "off",
                ReasoningEffortLevel::Low => "low",
                ReasoningEffortLevel::Medium => "medium",
                ReasoningEffortLevel::High => "high",
            };
            builder = builder.extend_params(["--reasoning-effort", effort_str]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ToolError {
    #[serde(rename = "type")]
    pub kind: String,
    pub message: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(untagged)]
pub enum ToolResultPayload {
    Value { value: Value },
    Error { error: ToolError },
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DroidJson {
    System {
        #[serde(default)]
        subtype: Option<String>,
        session_id: String,
        #[serde(default)]
        cwd: Option<String>,
        #[serde(default)]
        tools: Option<Vec<String>>,
        #[serde(default)]
        model: Option<String>,
    },
    Message {
        role: String,
        id: String,
        text: String,
        timestamp: u64,
        session_id: String,
    },
    ToolCall {
        id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        parameters: Value,
        timestamp: u64,
        session_id: String,
    },
    ToolResult {
        id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "isError")]
        is_error: bool,
        #[serde(flatten)]
        payload: ToolResultPayload,
        timestamp: u64,
        session_id: String,
    },
    Error {
        source: String,
        message: String,
        timestamp: u64,
    },
}

impl DroidJson {
    pub fn session_id(&self) -> Option<&str> {
        match self {
            DroidJson::System { session_id, .. } => Some(session_id),
            DroidJson::Message { session_id, .. } => Some(session_id),
            DroidJson::ToolCall { session_id, .. } => Some(session_id),
            DroidJson::ToolResult { session_id, .. } => Some(session_id),
            DroidJson::Error { .. } => None,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "toolName", content = "parameters")]
pub enum DroidToolData {
    Read {
        #[serde(alias = "path")]
        file_path: String,
    },
    LS {
        directory_path: String,
        #[serde(default)]
        #[serde(rename = "ignorePatterns")]
        ignore_patterns: Option<Vec<String>>,
    },
    Glob {
        folder: String,
        patterns: Vec<String>,
        #[serde(default)]
        #[serde(rename = "excludePatterns")]
        exclude_patterns: Option<Vec<String>>,
    },
    Grep {
        pattern: String,
        #[serde(default)]
        path: Option<String>,
        #[serde(default)]
        #[serde(rename = "caseSensitive")]
        case_sensitive: Option<bool>,
    },
    Execute {
        command: String,
        #[serde(default)]
        timeout: Option<u64>,
        #[serde(default)]
        #[serde(rename = "riskLevel")]
        risk_level: Option<Value>,
    },
    Edit {
        #[serde(alias = "path")]
        file_path: String,
        #[serde(alias = "old_str")]
        old_string: String,
        #[serde(alias = "new_str")]
        new_string: String,
    },
    MultiEdit {
        #[serde(alias = "path")]
        file_path: String,
        edits: Vec<DroidEditItem>,
    },
    Create {
        #[serde(alias = "path")]
        file_path: String,
        content: String,
    },
    ApplyPatch {
        input: String,
    },
    TodoWrite {
        todos: Vec<DroidTodoItem>,
    },
    WebSearch {
        query: String,
        #[serde(default)]
        max_results: Option<u32>,
    },
    FetchUrl {
        url: String,
        #[serde(default)]
        method: Option<String>,
    },
    ExitSpecMode {
        #[serde(default)]
        reason: Option<String>,
    },
    #[serde(rename = "slack_post_message")]
    SlackPostMessage {
        channel: String,
        text: String,
    },
    #[serde(untagged)]
    Unknown {
        #[serde(flatten)]
        data: std::collections::HashMap<String, Value>,
    },
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct DroidTodoItem {
    #[serde(default)]
    pub id: Option<String>,
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct DroidEditItem {
    pub old_string: Option<String>,
    pub new_string: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_droid_json_parsing() {
        let system_msg = r#"{"type":"system","subtype":"init","cwd":"/test","session_id":"test-123","tools":["Read"],"model":"gpt-5-codex"}"#;
        let user_msg = r#"{"type":"message","role":"user","id":"u1","text":"hello","timestamp":12345,"session_id":"test-123"}"#;
        let tool_call = r#"{"type":"tool_call","id":"t1","messageId":"m1","toolId":"Read","toolName":"Read","parameters":{"file_path":"test.txt"},"timestamp":12345,"session_id":"test-123"}"#;

        let parsed_system: Result<DroidJson, _> = serde_json::from_str(system_msg);
        let parsed_user: Result<DroidJson, _> = serde_json::from_str(user_msg);
        let parsed_tool: Result<DroidJson, _> = serde_json::from_str(tool_call);

        assert!(parsed_system.is_ok(), "System message should parse");
        assert!(parsed_user.is_ok(), "User message should parse");
        assert!(parsed_tool.is_ok(), "Tool call should parse");
    }

    #[test]
    fn test_build_command_default() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::SkipPermissionsUnsafe,
            model: None,
            reasoning_effort: None,
            cmd: CmdOverrides::default(),
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(
            cmd,
            "droid exec --output-format stream-json --skip-permissions-unsafe"
        );
    }

    #[test]
    fn test_build_command_autonomy_normal() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::Normal,
            model: None,
            reasoning_effort: None,
            cmd: CmdOverrides::default(),
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(cmd, "droid exec --output-format stream-json");
    }

    #[test]
    fn test_build_command_autonomy_low() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::Low,
            model: None,
            reasoning_effort: None,
            cmd: CmdOverrides::default(),
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(cmd, "droid exec --output-format stream-json --auto low");
    }

    #[test]
    fn test_build_command_autonomy_medium() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::Medium,
            model: None,
            reasoning_effort: None,
            cmd: CmdOverrides::default(),
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(cmd, "droid exec --output-format stream-json --auto medium");
    }

    #[test]
    fn test_build_command_autonomy_high() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::High,
            model: None,
            reasoning_effort: None,
            cmd: CmdOverrides::default(),
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(cmd, "droid exec --output-format stream-json --auto high");
    }

    #[test]
    fn test_build_command_with_model() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::SkipPermissionsUnsafe,
            model: Some("gpt-5-codex".to_string()),
            reasoning_effort: None,
            cmd: CmdOverrides::default(),
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(
            cmd,
            "droid exec --output-format stream-json --skip-permissions-unsafe --model gpt-5-codex"
        );
    }

    #[test]
    fn test_build_command_with_reasoning_effort() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::SkipPermissionsUnsafe,
            model: None,
            reasoning_effort: Some(ReasoningEffortLevel::High),
            cmd: CmdOverrides::default(),
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(
            cmd,
            "droid exec --output-format stream-json --skip-permissions-unsafe --reasoning-effort high"
        );
    }

    #[test]
    fn test_build_command_combined_options() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::Medium,
            model: Some("claude-sonnet-4-5-20250929".to_string()),
            reasoning_effort: Some(ReasoningEffortLevel::Dynamic),
            cmd: CmdOverrides::default(),
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(
            cmd,
            "droid exec --output-format stream-json --auto medium --model claude-sonnet-4-5-20250929 --reasoning-effort dynamic"
        );
    }

    #[test]
    fn test_build_command_with_base_override() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::SkipPermissionsUnsafe,
            model: None,
            reasoning_effort: None,
            cmd: CmdOverrides {
                base_command_override: Some("custom-droid".to_string()),
                additional_params: None,
            },
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(
            cmd,
            "custom-droid --output-format stream-json --skip-permissions-unsafe"
        );
    }

    #[test]
    fn test_build_command_with_additional_params() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::High,
            model: None,
            reasoning_effort: None,
            cmd: CmdOverrides {
                base_command_override: None,
                additional_params: Some(vec!["--debug".to_string(), "--verbose".to_string()]),
            },
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(
            cmd,
            "droid exec --output-format stream-json --auto high --debug --verbose"
        );
    }

    #[test]
    fn test_build_command_with_all_overrides() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::Low,
            model: Some("glm-4.6".to_string()),
            reasoning_effort: Some(ReasoningEffortLevel::Off),
            cmd: CmdOverrides {
                base_command_override: Some("/usr/local/bin/droid".to_string()),
                additional_params: Some(vec!["--timeout".to_string(), "300".to_string()]),
            },
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(
            cmd,
            "/usr/local/bin/droid --output-format stream-json --auto low --model glm-4.6 --reasoning-effort off --timeout 300"
        );
    }

    #[test]
    fn test_build_command_none_optionals() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::Normal,
            model: None,
            reasoning_effort: None,
            cmd: CmdOverrides::default(),
        };

        let builder = droid.build_command_builder();
        let cmd = builder.build_initial();

        assert_eq!(cmd, "droid exec --output-format stream-json");
        assert!(!cmd.contains("--model"));
        assert!(!cmd.contains("--reasoning-effort"));
    }
}
