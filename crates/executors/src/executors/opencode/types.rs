use serde::{Deserialize, Serialize};
use serde_json::Value;
use workspace_utils::approvals::ApprovalStatus;

/// JSON log events emitted by the OpenCode SDK executor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OpencodeExecutorEvent {
    StartupLog {
        message: String,
    },
    SessionStart {
        session_id: String,
    },
    SlashCommandResult {
        message: String,
    },
    SdkEvent {
        event: serde_json::Value,
    },
    TokenUsage {
        total_tokens: u32,
        model_context_window: u32,
    },
    ApprovalResponse {
        tool_call_id: String,
        status: ApprovalStatus,
    },
    Error {
        message: String,
    },
    Done,
}

#[derive(Debug, Deserialize)]
pub(super) struct SdkEventEnvelope {
    #[serde(rename = "type")]
    pub(super) type_: String,
    #[serde(default)]
    pub(super) properties: Value,
}

#[derive(Debug)]
pub(super) enum SdkEvent {
    MessageUpdated(MessageUpdatedEvent),
    MessagePartUpdated(MessagePartUpdatedEvent),
    MessageRemoved,
    MessagePartRemoved,
    PermissionAsked(PermissionAskedEvent),
    PermissionReplied,
    SessionIdle,
    SessionStatus(SessionStatusEvent),
    SessionDiff,
    SessionCompacted,
    SessionError(SessionErrorEvent),
    TodoUpdated(TodoUpdatedEvent),
    CommandExecuted,
    TuiSessionSelect,
    Unknown { type_: String, properties: Value },
}

impl SdkEvent {
    pub(super) fn parse(value: &Value) -> Option<Self> {
        let envelope = serde_json::from_value::<SdkEventEnvelope>(value.clone()).ok()?;

        let event = match envelope.type_.as_str() {
            "message.updated" => {
                SdkEvent::MessageUpdated(serde_json::from_value(envelope.properties).ok()?)
            }
            "message.part.updated" => {
                SdkEvent::MessagePartUpdated(serde_json::from_value(envelope.properties).ok()?)
            }
            "message.removed" => SdkEvent::MessageRemoved,
            "message.part.removed" => SdkEvent::MessagePartRemoved,
            "permission.asked" => {
                SdkEvent::PermissionAsked(serde_json::from_value(envelope.properties).ok()?)
            }
            "permission.replied" => SdkEvent::PermissionReplied,
            "session.idle" => SdkEvent::SessionIdle,
            "session.status" => {
                SdkEvent::SessionStatus(serde_json::from_value(envelope.properties).ok()?)
            }
            "session.diff" => SdkEvent::SessionDiff,
            "session.compacted" => SdkEvent::SessionCompacted,
            "session.error" => {
                SdkEvent::SessionError(serde_json::from_value(envelope.properties).ok()?)
            }
            "todo.updated" => {
                SdkEvent::TodoUpdated(serde_json::from_value(envelope.properties).ok()?)
            }
            "command.executed" => SdkEvent::CommandExecuted,
            "tui.session.select" => SdkEvent::TuiSessionSelect,
            _ => SdkEvent::Unknown {
                type_: envelope.type_,
                properties: envelope.properties,
            },
        };

        Some(event)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum MessageRole {
    User,
    Assistant,
}

#[derive(Debug, Deserialize)]
pub(super) struct MessageUpdatedEvent {
    pub(super) info: MessageInfo,
}

#[derive(Debug, Deserialize)]
pub(super) struct MessageInfo {
    pub(super) id: String,
    pub(super) role: MessageRole,
    #[serde(default)]
    pub(super) model: Option<MessageModelInfo>,
    #[serde(rename = "providerID", default)]
    pub(super) provider_id: Option<String>,
    #[serde(rename = "modelID", default)]
    pub(super) model_id: Option<String>,
    #[serde(default)]
    pub(super) tokens: Option<MessageTokens>,
}

#[derive(Debug, Deserialize)]
pub(super) struct MessageTokens {
    #[serde(default, deserialize_with = "deserialize_f64_as_u32")]
    pub(super) input: u32,
    #[serde(default, deserialize_with = "deserialize_f64_as_u32")]
    pub(super) output: u32,
    pub(super) cache: Option<MessageTokensCache>,
}

#[derive(Debug, Deserialize)]
pub(super) struct MessageTokensCache {
    #[serde(default, deserialize_with = "deserialize_f64_as_u32")]
    pub(super) read: u32,
}

fn deserialize_f64_as_u32<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v = Option::<f64>::deserialize(deserializer)?;
    Ok(v.filter(|f| f.is_finite() && *f >= 0.0)
        .map(|f| f.round() as u32)
        .unwrap_or(0))
}

impl MessageInfo {
    pub(super) fn provider_id(&self) -> Option<&str> {
        self.model
            .as_ref()
            .map(|m| m.provider_id.as_str())
            .or(self.provider_id.as_deref())
    }

    pub(super) fn model_id(&self) -> Option<&str> {
        self.model
            .as_ref()
            .map(|m| m.model_id.as_str())
            .or(self.model_id.as_deref())
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct MessageModelInfo {
    #[serde(rename = "providerID", alias = "providerId")]
    pub(super) provider_id: String,
    #[serde(rename = "modelID", alias = "modelId")]
    pub(super) model_id: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct MessagePartUpdatedEvent {
    pub(super) part: Part,
    #[serde(default)]
    pub(super) delta: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct PermissionAskedEvent {
    #[allow(dead_code)]
    pub(super) id: String,
    pub(super) permission: String,
    #[serde(default)]
    pub(super) patterns: Vec<String>,
    #[serde(default)]
    pub(super) metadata: Value,
    #[serde(default)]
    pub(super) tool: Option<PermissionToolInfo>,
}

#[derive(Debug, Deserialize)]
pub(super) struct PermissionToolInfo {
    #[serde(rename = "callID")]
    pub(super) call_id: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct SessionStatusEvent {
    pub(super) status: SessionStatus,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub(super) enum SessionStatus {
    Idle,
    Busy,
    Retry {
        attempt: u64,
        message: String,
        next: u64,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
pub(super) struct TodoUpdatedEvent {
    pub(super) todos: Vec<SdkTodo>,
}

#[derive(Debug, Deserialize)]
pub(super) struct SdkTodo {
    pub(super) id: String,
    pub(super) content: String,
    pub(super) status: String,
    pub(super) priority: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub(super) enum Part {
    #[serde(rename = "text")]
    Text(TextPart),
    #[serde(rename = "reasoning")]
    Reasoning(ReasoningPart),
    #[serde(rename = "tool")]
    Tool(Box<ToolPart>),
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
pub(super) struct TextPart {
    #[serde(rename = "messageID")]
    pub(super) message_id: String,
    pub(super) text: String,
}

/// Same structure as TextPart, used for reasoning content
pub(super) type ReasoningPart = TextPart;

#[derive(Debug, Deserialize)]
pub(super) struct ToolPart {
    #[serde(rename = "messageID")]
    pub(super) message_id: String,
    #[serde(rename = "callID")]
    pub(super) call_id: String,
    #[serde(default)]
    pub(super) tool: String,
    pub(super) state: ToolStateUpdate,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub(super) enum ToolStateUpdate {
    Pending {
        #[serde(default)]
        input: Option<Value>,
    },
    Running {
        #[serde(default)]
        input: Option<Value>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        metadata: Option<Value>,
    },
    Completed {
        #[serde(default)]
        input: Option<Value>,
        #[serde(default)]
        output: Option<String>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        metadata: Option<Value>,
    },
    Error {
        #[serde(default)]
        input: Option<Value>,
        #[serde(default)]
        error: Option<String>,
        #[serde(default)]
        metadata: Option<Value>,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
pub(super) struct SessionErrorEvent {
    #[serde(default)]
    pub(super) error: Option<SdkError>,
}

#[derive(Debug)]
pub(super) struct SdkError {
    pub(super) raw: Value,
}

impl SdkError {
    pub(super) fn kind(&self) -> &str {
        self.raw
            .get("name")
            .or_else(|| self.raw.get("type"))
            .and_then(Value::as_str)
            .unwrap_or("unknown")
    }

    pub(super) fn message(&self) -> Option<String> {
        self.raw
            .pointer("/data/message")
            .or_else(|| self.raw.get("message"))
            .and_then(Value::as_str)
            .map(|s| s.to_string())
    }
}

impl<'de> Deserialize<'de> for SdkError {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = Value::deserialize(deserializer)?;
        Ok(Self { raw })
    }
}

// Provider API types (for /provider endpoint - model context windows)

#[derive(Debug, Deserialize)]
pub(super) struct ProviderListResponse {
    pub(super) all: Vec<ProviderInfo>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ProviderInfo {
    pub(super) id: String,
    #[serde(default)]
    pub(super) models: std::collections::HashMap<String, ProviderModelInfo>,
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct ProviderModelInfo {
    #[serde(default)]
    pub(super) limit: ProviderModelLimit,
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct ProviderModelLimit {
    #[serde(default, deserialize_with = "deserialize_f64_as_u32")]
    pub(super) context: u32,
}
