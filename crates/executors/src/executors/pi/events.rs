use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Tool call information embedded in assistant message events
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ToolCallInfo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub arguments: Option<Value>,
}

/// Assistant message event types (nested in message_update)
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AssistantMessageEvent {
    Start,
    TextStart {
        #[serde(rename = "contentIndex")]
        content_index: usize,
    },
    TextDelta {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        delta: String,
    },
    TextEnd {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        content: String,
    },
    ThinkingStart {
        #[serde(rename = "contentIndex")]
        content_index: usize,
    },
    ThinkingDelta {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        delta: String,
    },
    ThinkingEnd {
        #[serde(rename = "contentIndex")]
        content_index: usize,
    },
    ToolcallStart {
        #[serde(rename = "contentIndex")]
        content_index: usize,
    },
    ToolcallDelta {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        delta: String,
    },
    ToolcallEnd {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        #[serde(rename = "toolCall")]
        tool_call: ToolCallInfo,
    },
    Done {
        reason: String,
    },
    Error {
        reason: String,
    },
    #[serde(other)]
    Unknown,
}

/// Tool result content from Pi
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolResultContent {
    Text { text: String },
    Image { source: Value },
}

/// Tool result from execution
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PiToolResult {
    pub content: Vec<ToolResultContent>,
    #[serde(default)]
    pub details: Option<Value>,
}

impl PiToolResult {
    /// Get the text content from the result
    pub fn get_text(&self) -> Option<String> {
        self.content
            .iter()
            .filter_map(|c| match c {
                ToolResultContent::Text { text } => Some(text.clone()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n")
            .into()
    }
}

/// Top-level event types from Pi RPC mode
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PiRpcEvent {
    /// Response to RPC commands (prompt, get_state, abort, etc.)
    Response {
        #[serde(default)]
        id: Option<String>,
        command: String,
        success: bool,
        #[serde(default)]
        data: Option<Value>,
        #[serde(default)]
        error: Option<String>,
    },

    /// Agent lifecycle - start
    AgentStart,

    /// Agent lifecycle - end
    AgentEnd {
        messages: Vec<Value>,
    },

    /// Turn lifecycle - start
    TurnStart,

    /// Turn lifecycle - end
    TurnEnd {
        message: Value,
        #[serde(rename = "toolResults", default)]
        tool_results: Vec<Value>,
    },

    /// Message streaming - start
    MessageStart {
        message: Value,
    },

    /// Message streaming - update with assistant events
    MessageUpdate {
        message: Value,
        #[serde(rename = "assistantMessageEvent")]
        assistant_message_event: Option<AssistantMessageEvent>,
    },

    /// Message streaming - end
    MessageEnd {
        message: Value,
    },

    /// Tool execution - start
    ToolExecutionStart {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        args: Value,
    },

    /// Tool execution - progress update
    ToolExecutionUpdate {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "partialResult", default)]
        partial_result: Option<PiToolResult>,
    },

    /// Tool execution - end
    ToolExecutionEnd {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        result: PiToolResult,
        #[serde(rename = "isError")]
        is_error: bool,
    },

    /// Auto-compaction - start
    AutoCompactionStart {
        reason: String,
    },

    /// Auto-compaction - end
    AutoCompactionEnd {
        result: Option<Value>,
        aborted: bool,
    },

    /// Auto-retry - start
    AutoRetryStart {
        attempt: u32,
        #[serde(rename = "maxAttempts")]
        max_attempts: u32,
        #[serde(rename = "delayMs")]
        delay_ms: u64,
    },

    /// Auto-retry - end
    AutoRetryEnd {
        success: bool,
        attempt: u32,
    },

    /// Hook error
    HookError {
        #[serde(rename = "hookPath")]
        hook_path: String,
        event: String,
        error: String,
    },

    /// Extension UI request (can be ignored for log normalization)
    ExtensionUiRequest {
        id: String,
        method: String,
        #[serde(flatten)]
        _extra: Value,
    },

    /// Catch-all for unknown event types
    #[serde(other)]
    Unknown,
}

/// State data from get_state response
#[derive(Deserialize, Debug, Clone)]
pub struct PiStateData {
    #[serde(rename = "sessionFile")]
    pub session_file: Option<String>,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(rename = "messageCount")]
    pub message_count: Option<u32>,
    #[serde(default)]
    pub model: Option<Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_response_event() {
        let json = r#"{"type":"response","command":"prompt","success":true}"#;
        let event: PiRpcEvent = serde_json::from_str(json).unwrap();
        match event {
            PiRpcEvent::Response {
                command, success, ..
            } => {
                assert_eq!(command, "prompt");
                assert!(success);
            }
            _ => panic!("Expected Response event"),
        }
    }

    #[test]
    fn test_parse_get_state_response() {
        let json = r#"{"type":"response","command":"get_state","success":true,"data":{"sessionFile":"/home/user/.pi/agent/sessions/test.jsonl","sessionId":"abc123","messageCount":5}}"#;
        let event: PiRpcEvent = serde_json::from_str(json).unwrap();
        match event {
            PiRpcEvent::Response { data, .. } => {
                let state: PiStateData = serde_json::from_value(data.unwrap()).unwrap();
                assert_eq!(state.session_id, Some("abc123".to_string()));
            }
            _ => panic!("Expected Response event"),
        }
    }

    #[test]
    fn test_parse_agent_start() {
        let json = r#"{"type":"agent_start"}"#;
        let event: PiRpcEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(event, PiRpcEvent::AgentStart));
    }

    #[test]
    fn test_parse_message_update_with_text_delta() {
        let json = r#"{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello"},"message":{}}"#;
        let event: PiRpcEvent = serde_json::from_str(json).unwrap();
        match event {
            PiRpcEvent::MessageUpdate {
                assistant_message_event: Some(AssistantMessageEvent::TextDelta { delta, .. }),
                ..
            } => {
                assert_eq!(delta, "Hello");
            }
            _ => panic!("Expected MessageUpdate with TextDelta"),
        }
    }

    #[test]
    fn test_parse_tool_execution_start() {
        let json = r#"{"type":"tool_execution_start","toolCallId":"tool123","toolName":"read","args":{"path":"/tmp/test.txt"}}"#;
        let event: PiRpcEvent = serde_json::from_str(json).unwrap();
        match event {
            PiRpcEvent::ToolExecutionStart {
                tool_call_id,
                tool_name,
                args,
            } => {
                assert_eq!(tool_call_id, "tool123");
                assert_eq!(tool_name, "read");
                assert_eq!(args.get("path").unwrap().as_str().unwrap(), "/tmp/test.txt");
            }
            _ => panic!("Expected ToolExecutionStart"),
        }
    }

    #[test]
    fn test_parse_tool_execution_end() {
        let json = r#"{"type":"tool_execution_end","toolCallId":"tool123","toolName":"read","result":{"content":[{"type":"text","text":"file contents"}],"details":{}},"isError":false}"#;
        let event: PiRpcEvent = serde_json::from_str(json).unwrap();
        match event {
            PiRpcEvent::ToolExecutionEnd {
                tool_call_id,
                tool_name,
                result,
                is_error,
            } => {
                assert_eq!(tool_call_id, "tool123");
                assert_eq!(tool_name, "read");
                assert!(!is_error);
                assert_eq!(result.get_text(), Some("file contents".to_string()));
            }
            _ => panic!("Expected ToolExecutionEnd"),
        }
    }

    #[test]
    fn test_parse_toolcall_end() {
        let json = r#"{"type":"message_update","assistantMessageEvent":{"type":"toolcall_end","contentIndex":1,"toolCall":{"type":"toolCall","id":"toolu123","name":"read","arguments":{"path":"/tmp/README.md"}}},"message":{}}"#;
        let event: PiRpcEvent = serde_json::from_str(json).unwrap();
        match event {
            PiRpcEvent::MessageUpdate {
                assistant_message_event:
                    Some(AssistantMessageEvent::ToolcallEnd { tool_call, .. }),
                ..
            } => {
                assert_eq!(tool_call.id, "toolu123");
                assert_eq!(tool_call.name, "read");
            }
            _ => panic!("Expected MessageUpdate with ToolcallEnd"),
        }
    }

    #[test]
    fn test_parse_extension_ui_request() {
        let json = r#"{"type":"extension_ui_request","id":"abc123","method":"setStatus","statusKey":"lsp","statusText":"Loading..."}"#;
        let event: PiRpcEvent = serde_json::from_str(json).unwrap();
        match event {
            PiRpcEvent::ExtensionUiRequest { id, method, .. } => {
                assert_eq!(id, "abc123");
                assert_eq!(method, "setStatus");
            }
            _ => panic!("Expected ExtensionUiRequest"),
        }
    }

    #[test]
    fn test_parse_unknown_event() {
        let json = r#"{"type":"some_future_event","data":"test"}"#;
        let event: PiRpcEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(event, PiRpcEvent::Unknown));
    }
}
