use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use strum_macros::AsRefStr;
use ts_rs::TS;

use crate::{command::CmdOverrides, executors::AppendPrompt};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
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
        builder = match &self.autonomy {
            Autonomy::Normal => builder,
            Autonomy::Low => builder.extend_params(["--auto", "low"]),
            Autonomy::Medium => builder.extend_params(["--auto", "medium"]),
            Autonomy::High => builder.extend_params(["--auto", "high"]),
            Autonomy::SkipPermissionsUnsafe => builder.extend_params(["--skip-permissions-unsafe"]),
        };
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }
        if let Some(effort) = &self.reasoning_effort {
            builder = builder.extend_params(["--reasoning-effort", effort.as_ref()]);
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
    fn test_build_command_default() {
        let droid = Droid {
            append_prompt: AppendPrompt::default(),
            autonomy: Autonomy::SkipPermissionsUnsafe,
            model: None,
            reasoning_effort: None,
            cmd: CmdOverrides::default(),
        };
        let cmd = droid.build_command_builder().build_initial();

        assert_eq!(
            cmd,
            "droid exec --output-format stream-json --skip-permissions-unsafe"
        );
    }

    #[test]
    fn test_build_command_autonomy_levels() {
        let test_cases = [
            (Autonomy::Normal, ""),
            (Autonomy::Low, "--auto low"),
            (Autonomy::Medium, "--auto medium"),
            (Autonomy::High, "--auto high"),
            (Autonomy::SkipPermissionsUnsafe, "--skip-permissions-unsafe"),
        ];
        for (autonomy, expected) in test_cases {
            let cmd = Droid {
                append_prompt: AppendPrompt::default(),
                autonomy,
                model: None,
                reasoning_effort: None,
                cmd: CmdOverrides::default(),
            }
            .build_command_builder()
            .build_initial();
            let expected = format!("droid exec --output-format stream-json {}", expected);
            let expected = expected.trim();
            assert_eq!(cmd, expected, "Failed for autonomy level: {:?}", autonomy);
        }
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
        let cmd = droid.build_command_builder().build_initial();
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

        let cmd = droid.build_command_builder().build_initial();

        assert_eq!(
            cmd,
            "droid exec --output-format stream-json --skip-permissions-unsafe --reasoning-effort high"
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

        let cmd = droid.build_command_builder().build_initial();

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

        let cmd = droid.build_command_builder().build_initial();

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

        let cmd = droid.build_command_builder().build_initial();

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

        let cmd = droid.build_command_builder().build_initial();

        assert_eq!(cmd, "droid exec --output-format stream-json");
    }
}
