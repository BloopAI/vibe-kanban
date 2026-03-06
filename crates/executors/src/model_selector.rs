use convert_case::{Case, Casing};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Provider information
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ModelProvider {
    /// Provider identifier
    pub id: String,
    /// Display name
    pub name: String,
}

/// Basic model information
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ModelInfo {
    /// Model identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Provider this model belongs to
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    /// Configurable reasoning options if supported
    #[serde(default)]
    pub reasoning_options: Vec<ReasoningOption>,
}

/// Reasoning option (simple selectable choice).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ReasoningOption {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub is_default: bool,
}

/// Available agent option provided by an executor.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct AgentInfo {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub is_default: bool,
}

/// Permission policy for tool operations
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum PermissionPolicy {
    #[default]
    /// Skip all permission checks
    Auto,
    /// Require approval for risky operations
    Supervised,
    /// Plan mode before execution (executor-defined meaning)
    Plan,
}

/// Full model selector configuration
#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
pub struct ModelSelectorConfig {
    /// Available providers
    pub providers: Vec<ModelProvider>,

    /// Available models
    pub models: Vec<ModelInfo>,

    /// Global default model (format: provider_id/model_id)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,

    /// Available agents
    pub agents: Vec<AgentInfo>,

    /// Supported permission policies
    pub permissions: Vec<PermissionPolicy>,
}

impl ReasoningOption {
    pub fn from_names(names: impl IntoIterator<Item = impl Into<String>>) -> Vec<ReasoningOption> {
        Self::from_names_with_labels(names.into_iter().map(|n| (n.into(), None)))
    }

    pub fn from_names_with_labels(
        pairs: impl IntoIterator<Item = (String, Option<String>)>,
    ) -> Vec<ReasoningOption> {
        let rank_key = |id: &str| match id.to_lowercase().as_str() {
            "none" => Some(0),
            "low" => Some(1),
            "medium" => Some(2),
            "high" => Some(3),
            "xhigh" => Some(4),
            "max" => Some(5),
            _ => None,
        };

        let mut options: Vec<ReasoningOption> = pairs
            .into_iter()
            .map(|(id, label)| {
                let label = label.unwrap_or_else(|| reasoning_label(&id));
                let is_default = id.eq_ignore_ascii_case("high");
                ReasoningOption {
                    id,
                    label,
                    is_default,
                }
            })
            .collect();

        options.sort_by(|a, b| match (rank_key(&a.id), rank_key(&b.id)) {
            (Some(a_rank), Some(b_rank)) => a_rank.cmp(&b_rank),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.label.cmp(&b.label),
        });

        options
    }
}

fn reasoning_label(id: &str) -> String {
    match id {
        "xhigh" => "Extra High".to_string(),
        _ => id.to_case(Case::Title),
    }
}
