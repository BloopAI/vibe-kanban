//! Applying the selected model, reasoning effort, mode and permissions to an ACP session.
//!
//! Agents describe what can be configured in the `session/new` and `session/load` responses:
//! `configOptions` (current spec), or the older `models` / `modes` objects. Everything here works
//! on the raw JSON so it stays agent-agnostic: options are matched by category first, then by id,
//! and anything the agent doesn't advertise is skipped with a warning instead of failing the run.

use async_trait::async_trait;
use serde_json::Value;

use crate::model_selector::{PermissionPolicy, ReasoningOption};

/// One selectable value of a config option, model or mode.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Choice {
    pub value: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ConfigKind {
    Select {
        current: Option<String>,
        choices: Vec<Choice>,
    },
    Boolean {
        current: bool,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConfigOption {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub kind: ConfigKind,
}

/// The older `models` / `modes` objects (`currentModelId` + `availableModels`, ...).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct LegacyState {
    pub current: Option<String>,
    pub available: Vec<Choice>,
}

/// What an agent advertises for a session.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SessionOptions {
    pub config: Vec<ConfigOption>,
    pub models: Option<LegacyState>,
    pub modes: Option<LegacyState>,
}

/// How a value is set on the agent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Setter {
    ConfigOption(String),
    SetModel,
    SetMode,
}

/// A configurable setting (model, reasoning or mode) resolved from the session options.
#[derive(Debug, Clone, PartialEq)]
pub struct Slot {
    pub setter: Setter,
    pub current: Option<String>,
    pub choices: Vec<Choice>,
}

impl Slot {
    /// Exact value first, then case-insensitive value, then case-insensitive display name.
    pub fn find(&self, wanted: &str) -> Option<&Choice> {
        self.choices
            .iter()
            .find(|c| c.value == wanted)
            .or_else(|| {
                self.choices
                    .iter()
                    .find(|c| c.value.eq_ignore_ascii_case(wanted))
            })
            .or_else(|| {
                self.choices
                    .iter()
                    .find(|c| c.name.eq_ignore_ascii_case(wanted))
            })
    }

    pub fn current_choice(&self) -> Option<&Choice> {
        let current = self.current.as_deref()?;
        self.choices.iter().find(|c| c.value == current)
    }

    pub fn current_name(&self) -> Option<String> {
        self.current_choice()
            .map(|c| c.name.clone())
            .or_else(|| self.current.clone())
    }

    pub fn plan_choice(&self) -> Option<&Choice> {
        self.choices.iter().find(|c| is_plan_mode(c))
    }

    fn current_is_plan(&self) -> bool {
        self.current_choice().is_some_and(is_plan_mode)
    }

    /// The mode to return to after Plan: the current mode if it isn't Plan, otherwise the first
    /// mode that isn't Plan.
    pub fn default_mode(&self) -> Option<&Choice> {
        self.current_choice()
            .filter(|c| !is_plan_mode(c))
            .or_else(|| self.choices.iter().find(|c| !is_plan_mode(c)))
    }
}

/// Generic plan-mode detection: id or name "plan", or an id ending in "#plan"
/// (Copilot uses `https://agentclientprotocol.com/protocol/session-modes#plan`).
pub fn is_plan_mode(choice: &Choice) -> bool {
    let value = choice.value.to_ascii_lowercase();
    value == "plan" || value.ends_with("#plan") || choice.name.eq_ignore_ascii_case("plan")
}

const MODEL_IDS: &[&str] = &["model"];
const REASONING_IDS: &[&str] = &["reasoning_effort", "thought_level", "effort"];
const MODE_IDS: &[&str] = &["mode"];

impl SessionOptions {
    /// Parses a `session/new` or `session/load` result. Malformed parts are ignored.
    pub fn from_response(result: &Value) -> Self {
        Self {
            config: result
                .get("configOptions")
                .map(parse_config_options)
                .unwrap_or_default(),
            models: result
                .get("models")
                .and_then(|m| parse_legacy(m, "currentModelId", "availableModels", "modelId")),
            modes: result
                .get("modes")
                .and_then(|m| parse_legacy(m, "currentModeId", "availableModes", "id")),
        }
    }

    /// Replaces the config options with those of a `set_config_option` response or a
    /// `config_option_update` notification, if it carries any.
    pub fn update_config(&mut self, value: &Value) {
        if let Some(options) = value.get("configOptions") {
            self.config = parse_config_options(options);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.config.is_empty() && self.models.is_none() && self.modes.is_none()
    }

    pub fn option_by_id(&self, id: &str) -> Option<&ConfigOption> {
        self.config.iter().find(|o| o.id == id)
    }

    fn select_slot(&self, category: &str, ids: &[&str]) -> Option<Slot> {
        let option = self
            .config
            .iter()
            .find(|o| o.category.as_deref() == Some(category))
            .or_else(|| self.config.iter().find(|o| ids.contains(&o.id.as_str())))?;
        match &option.kind {
            ConfigKind::Select { current, choices } => Some(Slot {
                setter: Setter::ConfigOption(option.id.clone()),
                current: current.clone(),
                choices: choices.clone(),
            }),
            ConfigKind::Boolean { .. } => None,
        }
    }

    pub fn model_slot(&self) -> Option<Slot> {
        self.select_slot("model", MODEL_IDS).or_else(|| {
            self.models.as_ref().map(|m| Slot {
                setter: Setter::SetModel,
                current: m.current.clone(),
                choices: m.available.clone(),
            })
        })
    }

    pub fn reasoning_slot(&self) -> Option<Slot> {
        self.select_slot("thought_level", REASONING_IDS)
    }

    pub fn mode_slot(&self) -> Option<Slot> {
        self.select_slot("mode", MODE_IDS).or_else(|| {
            self.modes.as_ref().map(|m| Slot {
                setter: Setter::SetMode,
                current: m.current.clone(),
                choices: m.available.clone(),
            })
        })
    }

    pub fn has_plan_mode(&self) -> bool {
        self.mode_slot().is_some_and(|s| s.plan_choice().is_some())
    }

    /// Reasoning options for the current model, with the agent's current value as the default.
    pub fn reasoning_options(&self) -> Vec<ReasoningOption> {
        let Some(slot) = self.reasoning_slot() else {
            return vec![];
        };
        slot.choices
            .iter()
            .map(|c| ReasoningOption {
                id: c.value.clone(),
                label: reasoning_label(c),
                is_default: slot.current.as_deref() == Some(c.value.as_str()),
            })
            .collect()
    }

    /// Records a value set through a legacy method or reported by a notification.
    fn set_current(&mut self, setter: &Setter, value: &str) {
        match setter {
            Setter::ConfigOption(id) => {
                if let Some(ConfigOption {
                    kind: ConfigKind::Select { current, .. },
                    ..
                }) = self.config.iter_mut().find(|o| &o.id == id)
                {
                    *current = Some(value.to_string());
                }
            }
            Setter::SetModel => {
                if let Some(models) = &mut self.models {
                    models.current = Some(value.to_string());
                }
            }
            Setter::SetMode => {
                if let Some(modes) = &mut self.modes {
                    modes.current = Some(value.to_string());
                }
            }
        }
    }

    /// Records a `current_mode_update` notification.
    pub fn set_current_mode(&mut self, mode_id: &str) {
        if let Some(slot) = self.mode_slot() {
            self.set_current(&slot.setter, mode_id);
        }
        if let Some(modes) = &mut self.modes {
            modes.current = Some(mode_id.to_string());
        }
    }
}

fn reasoning_label(choice: &Choice) -> String {
    // Agents often use the raw id as the name ("high"); prettify those, keep real names.
    if choice.name == choice.value {
        match choice.value.as_str() {
            "xhigh" => "Extra High".to_string(),
            v => {
                let mut chars = v.chars();
                chars
                    .next()
                    .map(|f| f.to_uppercase().collect::<String>() + chars.as_str())
                    .unwrap_or_default()
            }
        }
    } else {
        choice.name.clone()
    }
}

fn parse_config_options(value: &Value) -> Vec<ConfigOption> {
    value
        .as_array()
        .map(|options| options.iter().filter_map(parse_config_option).collect())
        .unwrap_or_default()
}

fn parse_config_option(value: &Value) -> Option<ConfigOption> {
    let id = value.get("id")?.as_str()?.to_string();
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(&id)
        .to_string();
    let category = value
        .get("category")
        .and_then(Value::as_str)
        .map(str::to_string);
    let kind = match value.get("type").and_then(Value::as_str) {
        Some("boolean") => ConfigKind::Boolean {
            current: value.get("currentValue")?.as_bool()?,
        },
        Some("select") => ConfigKind::Select {
            current: value
                .get("currentValue")
                .and_then(Value::as_str)
                .map(str::to_string),
            choices: parse_select_choices(value.get("options")?),
        },
        _ => return None,
    };
    Some(ConfigOption {
        id,
        name,
        category,
        kind,
    })
}

/// Select options are either a flat list or a list of groups, each with its own options.
fn parse_select_choices(value: &Value) -> Vec<Choice> {
    let Some(items) = value.as_array() else {
        return vec![];
    };
    items
        .iter()
        .flat_map(|item| match item.get("options").and_then(Value::as_array) {
            Some(grouped) => grouped
                .iter()
                .filter_map(|o| parse_choice(o, "value"))
                .collect(),
            None => parse_choice(item, "value").into_iter().collect::<Vec<_>>(),
        })
        .collect()
}

fn parse_choice(value: &Value, id_key: &str) -> Option<Choice> {
    let id = value.get(id_key)?.as_str()?.to_string();
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(&id)
        .to_string();
    Some(Choice { value: id, name })
}

fn parse_legacy(
    value: &Value,
    current_key: &str,
    list_key: &str,
    id_key: &str,
) -> Option<LegacyState> {
    let available: Vec<Choice> = value
        .get(list_key)?
        .as_array()?
        .iter()
        .filter_map(|c| parse_choice(c, id_key))
        .collect();
    Some(LegacyState {
        current: value
            .get(current_key)
            .and_then(Value::as_str)
            .map(str::to_string),
        available,
    })
}

/// What the user selected for a run.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DesiredConfig {
    pub model: Option<String>,
    pub reasoning: Option<String>,
    /// From `agent_id`. Plan permission wins over it.
    pub mode: Option<String>,
    /// None keeps the old behaviour: requests go to the user.
    pub permission: Option<PermissionPolicy>,
    /// Agent-specific options set by id after everything else (Copilot's `allow_all`).
    /// Internal only, never exposed in the API or UI.
    pub extra: Vec<(String, String)>,
}

impl DesiredConfig {
    /// Auto approves permission requests on our side; Ask and Plan send them to the user.
    pub fn auto_approve(&self) -> bool {
        matches!(self.permission, Some(PermissionPolicy::Auto))
    }

    pub fn is_empty(&self) -> bool {
        self.model.is_none()
            && self.reasoning.is_none()
            && self.mode.is_none()
            && self.permission.is_none()
            && self.extra.is_empty()
    }
}

/// The value sent with `session/set_config_option`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigValue {
    Select(String),
    Boolean(bool),
}

impl ConfigValue {
    pub fn to_params(&self) -> Value {
        match self {
            ConfigValue::Select(v) => serde_json::json!({ "value": v }),
            ConfigValue::Boolean(b) => serde_json::json!({ "type": "boolean", "value": b }),
        }
    }
}

/// Sends config changes to the agent. Implemented over the ACP connection by the harness, and by
/// a fake agent in tests.
#[async_trait]
pub trait ConfigSink: Send {
    /// Returns the response, which may carry the updated `configOptions`.
    async fn set_config_option(&mut self, id: &str, value: &ConfigValue) -> Result<Value, String>;
    async fn set_mode(&mut self, mode_id: &str) -> Result<(), String>;
    async fn set_model(&mut self, model_id: &str) -> Result<(), String>;
}

/// Sets one value and records the result in `options`.
pub async fn set_value(
    options: &mut SessionOptions,
    setter: &Setter,
    value: &str,
    sink: &mut dyn ConfigSink,
) -> Result<(), String> {
    match setter {
        Setter::ConfigOption(id) => {
            let response = sink
                .set_config_option(id, &ConfigValue::Select(value.to_string()))
                .await?;
            if response.get("configOptions").is_some() {
                options.update_config(&response);
            } else {
                options.set_current(setter, value);
            }
        }
        Setter::SetModel => {
            sink.set_model(value).await?;
            options.set_current(setter, value);
        }
        Setter::SetMode => {
            sink.set_mode(value).await?;
            options.set_current(setter, value);
        }
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ApplyOutcome {
    pub warnings: Vec<String>,
    /// The permission actually in effect: Plan becomes Ask when the agent has no plan mode.
    pub permission: Option<PermissionPolicy>,
}

/// What to do about the mode.
#[derive(Debug, Clone, PartialEq)]
pub struct ModeDecision {
    pub target: Option<String>,
    pub warning: Option<String>,
    pub permission: Option<PermissionPolicy>,
}

/// Plan permission > `agent_id` > leave Plan for the default mode > leave the mode alone.
/// A saved Plan for an agent without a plan mode runs as Ask, never Auto.
pub fn resolve_mode(slot: Option<&Slot>, desired: &DesiredConfig) -> ModeDecision {
    let mut permission = desired.permission.clone();
    let mut warning = None;

    if permission == Some(PermissionPolicy::Plan) {
        match slot.and_then(|s| s.plan_choice()) {
            Some(plan) => {
                return ModeDecision {
                    target: Some(plan.value.clone()),
                    warning: None,
                    permission,
                };
            }
            None => {
                warning = Some(
                    "Plan mode isn't available for this agent, so it's running as Ask.".to_string(),
                );
                permission = Some(PermissionPolicy::Supervised);
            }
        }
    }

    if let Some(wanted) = &desired.mode {
        let decision = match slot {
            None => ModeDecision {
                target: None,
                warning: Some(format!(
                    "This agent doesn't support modes, so mode {wanted} was skipped."
                )),
                permission: permission.clone(),
            },
            Some(slot) => match slot.find(wanted) {
                Some(choice) => ModeDecision {
                    target: Some(choice.value.clone()),
                    warning: None,
                    permission: permission.clone(),
                },
                None => ModeDecision {
                    target: None,
                    warning: Some(format!(
                        "Mode {wanted} isn't available for this agent, so it was skipped."
                    )),
                    permission: permission.clone(),
                },
            },
        };
        return ModeDecision {
            warning: join_warnings(warning, decision.warning),
            ..decision
        };
    }

    let target = slot
        .filter(|s| s.current_is_plan())
        .and_then(|s| s.default_mode())
        .map(|c| c.value.clone());
    ModeDecision {
        target,
        warning,
        permission,
    }
}

fn join_warnings(a: Option<String>, b: Option<String>) -> Option<String> {
    match (a, b) {
        (Some(a), Some(b)) => Some(format!("{a} {b}")),
        (a, b) => a.or(b),
    }
}

/// Applies the desired config in order: model, reasoning (from the options the model change
/// returned), mode, then extras. Failures become warnings; the run goes on.
pub async fn apply_config(
    options: &mut SessionOptions,
    desired: &DesiredConfig,
    sink: &mut dyn ConfigSink,
) -> ApplyOutcome {
    let mut warnings = Vec::new();

    if let Some(model) = &desired.model {
        match options.model_slot() {
            None => warnings.push(format!(
                "This agent doesn't support choosing a model, so {model} was skipped."
            )),
            Some(slot) => match slot.find(model) {
                None => warnings.push(format!(
                    "Model {model} isn't available, so the agent's default is used. \
                     Pick another model in the selector or in Settings → Agents."
                )),
                Some(choice) if slot.current.as_deref() == Some(choice.value.as_str()) => {}
                Some(choice) => {
                    let value = choice.value.clone();
                    if let Err(e) = set_value(options, &slot.setter, &value, sink).await {
                        warnings.push(format!("Couldn't switch the model to {model}: {e}"));
                    }
                }
            },
        }
    }

    // No reasoning option for this model: skipped silently, since the selector hides the
    // control and a saved value couldn't be cleared there.
    if let (Some(reasoning), Some(slot)) = (&desired.reasoning, options.reasoning_slot()) {
        let model_name = options
            .model_slot()
            .and_then(|s| s.current_name())
            .unwrap_or_else(|| "this model".to_string());
        match slot.find(reasoning) {
            None => warnings.push(format!(
                "Reasoning effort {reasoning} isn't available for {model_name}, so its \
                     default is used."
            )),
            Some(choice) if slot.current.as_deref() == Some(choice.value.as_str()) => {}
            Some(choice) => {
                let value = choice.value.clone();
                if let Err(e) = set_value(options, &slot.setter, &value, sink).await {
                    warnings.push(format!("Couldn't set reasoning effort to {reasoning}: {e}"));
                }
            }
        }
    }

    let mode_slot = options.mode_slot();
    let decision = resolve_mode(mode_slot.as_ref(), desired);
    warnings.extend(decision.warning.clone());
    if let (Some(target), Some(slot)) = (&decision.target, &mode_slot)
        && slot.current.as_deref() != Some(target.as_str())
        && let Err(e) = set_value(options, &slot.setter, target, sink).await
    {
        let name = slot
            .choices
            .iter()
            .find(|c| &c.value == target)
            .map(|c| c.name.clone())
            .unwrap_or_else(|| target.clone());
        warnings.push(format!("Couldn't switch to {name} mode: {e}"));
    }

    for (id, value) in &desired.extra {
        let Some(option) = options.option_by_id(id).cloned() else {
            warnings.push(format!(
                "This agent doesn't advertise the {id} option, so it was skipped."
            ));
            continue;
        };
        let (config_value, already_set) = match &option.kind {
            ConfigKind::Boolean { current } => {
                let wanted = matches!(value.as_str(), "on" | "true");
                (ConfigValue::Boolean(wanted), *current == wanted)
            }
            ConfigKind::Select { current, choices } => {
                if !choices.iter().any(|c| &c.value == value) {
                    warnings.push(format!(
                        "{} {value} isn't available for this agent, so it was skipped.",
                        option.name
                    ));
                    continue;
                }
                (
                    ConfigValue::Select(value.clone()),
                    current.as_deref() == Some(value.as_str()),
                )
            }
        };
        if already_set {
            continue;
        }
        match sink.set_config_option(id, &config_value).await {
            Ok(response) if response.get("configOptions").is_some() => {
                options.update_config(&response)
            }
            Ok(_) => {}
            Err(e) => warnings.push(format!("Couldn't set {} to {value}: {e}", option.name)),
        }
    }

    ApplyOutcome {
        warnings,
        permission: decision.permission,
    }
}

pub fn permission_label(permission: &PermissionPolicy) -> &'static str {
    match permission {
        PermissionPolicy::Auto => "Auto",
        PermissionPolicy::Supervised => "Ask",
        PermissionPolicy::Plan => "Plan",
    }
}

/// "Model: Claude Haiku 5.5 · Reasoning: High · Mode: Agent · Permissions: Auto"
pub fn summary(options: &SessionOptions, permission: Option<&PermissionPolicy>) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(model) = options.model_slot().and_then(|s| s.current_name()) {
        parts.push(format!("Model: {model}"));
    }
    if let Some(slot) = options.reasoning_slot()
        && let Some(choice) = slot.current_choice()
    {
        parts.push(format!("Reasoning: {}", reasoning_label(choice)));
    }
    if let Some(mode) = options.mode_slot().and_then(|s| s.current_name()) {
        parts.push(format!("Mode: {mode}"));
    }
    if let Some(permission) = permission {
        parts.push(format!("Permissions: {}", permission_label(permission)));
    }
    (!parts.is_empty()).then(|| parts.join(" · "))
}

/// Lines for changes the agent made itself ("Mode: Agent", "Model: X").
pub fn describe_changes(before: &SessionOptions, after: &SessionOptions) -> Vec<String> {
    let mut lines = Vec::new();
    let changed = |a: Option<Slot>, b: &Option<Slot>| {
        a.and_then(|s| s.current) != b.as_ref().and_then(|s| s.current.clone())
    };
    let after_model = after.model_slot();
    if changed(before.model_slot(), &after_model)
        && let Some(name) = after_model.and_then(|s| s.current_name())
    {
        lines.push(format!("Model: {name}"));
    }
    let after_mode = after.mode_slot();
    if changed(before.mode_slot(), &after_mode)
        && let Some(name) = after_mode.and_then(|s| s.current_name())
    {
        lines.push(format!("Mode: {name}"));
    }
    lines
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::json;

    use super::*;

    const AGENT: &str = "https://agentclientprotocol.com/protocol/session-modes#agent";
    const PLAN: &str = "https://agentclientprotocol.com/protocol/session-modes#plan";

    fn copilot_fixture() -> Value {
        serde_json::from_str(include_str!("copilot_session_fixture.json")).unwrap()
    }

    /// A fake agent that behaves like Copilot: per-model reasoning options, `-32602`-style
    /// errors for unknown values.
    struct FakeAgent {
        options: Value,
        /// model id -> reasoning values (None = the model has no reasoning option)
        reasoning: HashMap<String, Option<Vec<&'static str>>>,
        calls: Vec<String>,
    }

    impl FakeAgent {
        fn copilot() -> Self {
            let mut reasoning = HashMap::new();
            reasoning.insert(
                "claude-sonnet-5.5".to_string(),
                Some(vec!["low", "medium", "high", "xhigh", "max"]),
            );
            reasoning.insert("claude-haiku-4.5".to_string(), None);
            reasoning.insert("auto".to_string(), None);
            reasoning.insert("kimi-k3".to_string(), Some(vec!["low", "high", "max"]));
            Self {
                options: copilot_fixture()["configOptions"].clone(),
                reasoning,
                calls: vec![],
            }
        }

        fn option_mut(&mut self, id: &str) -> Option<&mut Value> {
            self.options
                .as_array_mut()
                .unwrap()
                .iter_mut()
                .find(|o| o["id"] == id)
        }
    }

    #[async_trait]
    impl ConfigSink for FakeAgent {
        async fn set_config_option(
            &mut self,
            id: &str,
            value: &ConfigValue,
        ) -> Result<Value, String> {
            self.calls.push(format!("{id}={value:?}"));
            let ConfigValue::Select(v) = value else {
                return Err("boolean not supported".into());
            };
            let Some(option) = self.option_mut(id) else {
                return Err(format!("Unknown config option '{id}'."));
            };
            let valid = option["options"]
                .as_array()
                .unwrap()
                .iter()
                .any(|o| o["value"] == v.as_str());
            if !valid {
                return Err(format!("Invalid value '{v}'"));
            }
            option["currentValue"] = json!(v);
            if id == "model" {
                let effort = self.reasoning.get(v).cloned().flatten();
                let arr = self.options.as_array_mut().unwrap();
                arr.retain(|o| o["id"] != "reasoning_effort");
                if let Some(values) = effort {
                    arr.push(json!({
                        "type": "select", "id": "reasoning_effort", "name": "Reasoning Effort",
                        "category": "thought_level", "currentValue": "medium",
                        "options": values.iter().map(|v| json!({"value": v, "name": v})).collect::<Vec<_>>()
                    }));
                }
            }
            Ok(json!({ "configOptions": self.options }))
        }

        async fn set_mode(&mut self, mode_id: &str) -> Result<(), String> {
            self.calls.push(format!("set_mode={mode_id}"));
            Ok(())
        }

        async fn set_model(&mut self, model_id: &str) -> Result<(), String> {
            self.calls.push(format!("set_model={model_id}"));
            Ok(())
        }
    }

    fn opts() -> SessionOptions {
        SessionOptions::from_response(&copilot_fixture())
    }

    fn current(options: &SessionOptions, id: &str) -> Option<String> {
        match &options.option_by_id(id)?.kind {
            ConfigKind::Select { current, .. } => current.clone(),
            ConfigKind::Boolean { current } => Some(current.to_string()),
        }
    }

    #[test]
    fn parses_copilot_session() {
        let o = opts();
        let model = o.model_slot().unwrap();
        assert_eq!(model.setter, Setter::ConfigOption("model".into()));
        assert_eq!(model.current.as_deref(), Some("claude-sonnet-5.5"));
        assert_eq!(model.choices[0].value, "auto");
        assert_eq!(
            o.reasoning_slot().unwrap().setter,
            Setter::ConfigOption("reasoning_effort".into())
        );
        assert_eq!(
            o.mode_slot().unwrap().setter,
            Setter::ConfigOption("mode".into())
        );
        assert!(o.has_plan_mode());
        let reasoning = o.reasoning_options();
        assert_eq!(reasoning.len(), 5);
        assert!(reasoning.iter().any(|r| r.id == "medium" && r.is_default));
        assert_eq!(reasoning[3].label, "Extra High");
    }

    #[tokio::test]
    async fn sets_model_then_reasoning_from_updated_options() {
        let mut o = opts();
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            model: Some("kimi-k3".into()),
            reasoning: Some("high".into()),
            ..Default::default()
        };
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert!(outcome.warnings.is_empty(), "{:?}", outcome.warnings);
        assert_eq!(current(&o, "model").as_deref(), Some("kimi-k3"));
        assert_eq!(current(&o, "reasoning_effort").as_deref(), Some("high"));
    }

    #[tokio::test]
    async fn reasoning_skipped_when_model_has_none() {
        let mut o = opts();
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            model: Some("claude-haiku-4.5".into()),
            reasoning: Some("high".into()),
            ..Default::default()
        };
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert!(outcome.warnings.is_empty(), "{:?}", outcome.warnings);
        assert!(o.reasoning_slot().is_none());
        assert!(
            !agent
                .calls
                .iter()
                .any(|c| c.starts_with("reasoning_effort"))
        );
    }

    #[tokio::test]
    async fn reasoning_value_not_offered_by_model_is_skipped() {
        let mut o = opts();
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            model: Some("kimi-k3".into()),
            reasoning: Some("medium".into()),
            ..Default::default()
        };
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert_eq!(outcome.warnings.len(), 1);
        assert!(outcome.warnings[0].contains("medium"));
    }

    #[tokio::test]
    async fn stale_model_is_skipped_without_calling_the_agent() {
        let mut o = opts();
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            model: Some("gpt-5.4".into()),
            ..Default::default()
        };
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert_eq!(outcome.warnings.len(), 1);
        assert!(outcome.warnings[0].contains("gpt-5.4"));
        assert!(outcome.warnings[0].contains("Settings → Agents"));
        assert!(agent.calls.is_empty());
        assert_eq!(current(&o, "model").as_deref(), Some("claude-sonnet-5.5"));
    }

    #[tokio::test]
    async fn already_selected_values_are_not_resent() {
        let mut o = opts();
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            model: Some("claude-sonnet-5.5".into()),
            reasoning: Some("medium".into()),
            permission: Some(PermissionPolicy::Supervised),
            extra: vec![("allow_all".into(), "off".into())],
            ..Default::default()
        };
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert!(outcome.warnings.is_empty());
        assert!(agent.calls.is_empty(), "{:?}", agent.calls);
    }

    #[tokio::test]
    async fn auto_sets_allow_all() {
        let mut o = opts();
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            permission: Some(PermissionPolicy::Auto),
            extra: vec![("allow_all".into(), "on".into())],
            ..Default::default()
        };
        assert!(desired.auto_approve());
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert!(outcome.warnings.is_empty());
        assert_eq!(current(&o, "allow_all").as_deref(), Some("on"));
        assert_eq!(outcome.permission, Some(PermissionPolicy::Auto));
    }

    #[tokio::test]
    async fn unknown_extra_is_skipped_with_warning() {
        let mut o = opts();
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            extra: vec![("nonexistent".into(), "x".into())],
            ..Default::default()
        };
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert_eq!(outcome.warnings.len(), 1);
        assert!(agent.calls.is_empty());
    }

    #[tokio::test]
    async fn plan_permission_switches_to_plan_mode() {
        let mut o = opts();
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            permission: Some(PermissionPolicy::Plan),
            mode: Some("autopilot".into()),
            ..Default::default()
        };
        assert!(!desired.auto_approve());
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert!(outcome.warnings.is_empty());
        assert_eq!(current(&o, "mode").as_deref(), Some(PLAN));
        assert_eq!(outcome.permission, Some(PermissionPolicy::Plan));
    }

    fn slot(choices: &[(&str, &str)], current: &str) -> Slot {
        Slot {
            setter: Setter::ConfigOption("mode".into()),
            current: Some(current.into()),
            choices: choices
                .iter()
                .map(|(v, n)| Choice {
                    value: v.to_string(),
                    name: n.to_string(),
                })
                .collect(),
        }
    }

    #[test]
    fn plan_without_plan_mode_runs_as_ask_never_auto() {
        let s = slot(&[("code", "Code"), ("architect", "Architect")], "code");
        let desired = DesiredConfig {
            permission: Some(PermissionPolicy::Plan),
            ..Default::default()
        };
        let d = resolve_mode(Some(&s), &desired);
        assert_eq!(d.permission, Some(PermissionPolicy::Supervised));
        assert!(d.warning.unwrap().contains("running as Ask"));
        assert_eq!(d.target, None);

        let d = resolve_mode(None, &desired);
        assert_eq!(d.permission, Some(PermissionPolicy::Supervised));
        assert!(
            !DesiredConfig {
                permission: d.permission,
                ..Default::default()
            }
            .auto_approve()
        );
    }

    #[test]
    fn plan_without_plan_mode_still_applies_agent_id() {
        let s = slot(&[("code", "Code"), ("architect", "Architect")], "code");
        let desired = DesiredConfig {
            permission: Some(PermissionPolicy::Plan),
            mode: Some("architect".into()),
            ..Default::default()
        };
        let d = resolve_mode(Some(&s), &desired);
        assert_eq!(d.target.as_deref(), Some("architect"));
        assert_eq!(d.permission, Some(PermissionPolicy::Supervised));
        assert!(d.warning.is_some());
    }

    #[test]
    fn agent_id_wins_over_default_mode() {
        let s = slot(
            &[
                (AGENT, "Agent"),
                (PLAN, "Plan"),
                ("x#autopilot", "Autopilot"),
            ],
            PLAN,
        );
        let desired = DesiredConfig {
            permission: Some(PermissionPolicy::Supervised),
            mode: Some("Autopilot".into()),
            ..Default::default()
        };
        let d = resolve_mode(Some(&s), &desired);
        assert_eq!(d.target.as_deref(), Some("x#autopilot"));
    }

    #[test]
    fn leaving_plan_returns_to_default_mode() {
        let s = slot(&[(AGENT, "Agent"), (PLAN, "Plan")], PLAN);
        let desired = DesiredConfig {
            permission: Some(PermissionPolicy::Supervised),
            ..Default::default()
        };
        assert_eq!(
            resolve_mode(Some(&s), &desired).target.as_deref(),
            Some(AGENT)
        );
    }

    #[test]
    fn other_modes_are_left_alone() {
        let s = slot(
            &[(AGENT, "Agent"), (PLAN, "Plan"), ("debug", "Debug")],
            "debug",
        );
        let desired = DesiredConfig {
            permission: Some(PermissionPolicy::Auto),
            ..Default::default()
        };
        assert_eq!(resolve_mode(Some(&s), &desired).target, None);
    }

    #[test]
    fn unknown_agent_mode_warns() {
        let s = slot(&[(AGENT, "Agent")], AGENT);
        let desired = DesiredConfig {
            mode: Some("nope".into()),
            ..Default::default()
        };
        let d = resolve_mode(Some(&s), &desired);
        assert_eq!(d.target, None);
        assert!(d.warning.unwrap().contains("nope"));
    }

    #[tokio::test]
    async fn legacy_models_and_modes_are_used_without_config_options() {
        let mut o = SessionOptions::from_response(&json!({
            "sessionId": "s",
            "models": {"currentModelId": "a", "availableModels": [
                {"modelId": "a", "name": "A"}, {"modelId": "b", "name": "B"}]},
            "modes": {"currentModeId": "plan", "availableModes": [
                {"id": "code", "name": "Code"}, {"id": "plan", "name": "Plan"}]}
        }));
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            model: Some("b".into()),
            permission: Some(PermissionPolicy::Supervised),
            ..Default::default()
        };
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert!(outcome.warnings.is_empty());
        assert_eq!(agent.calls, vec!["set_model=b", "set_mode=code"]);
        assert_eq!(
            summary(&o, outcome.permission.as_ref()).unwrap(),
            "Model: B · Mode: Code · Permissions: Ask"
        );
    }

    #[tokio::test]
    async fn nothing_advertised_warns_and_never_fails() {
        let mut o = SessionOptions::from_response(&json!({"sessionId": "s"}));
        assert!(o.is_empty());
        let mut agent = FakeAgent::copilot();
        let desired = DesiredConfig {
            model: Some("x".into()),
            reasoning: Some("high".into()),
            mode: Some("m".into()),
            permission: Some(PermissionPolicy::Plan),
            ..Default::default()
        };
        let outcome = apply_config(&mut o, &desired, &mut agent).await;
        assert_eq!(outcome.permission, Some(PermissionPolicy::Supervised));
        // Model and Plan; reasoning without a reasoning option is skipped silently
        assert!(outcome.warnings.len() >= 2, "{:?}", outcome.warnings);
        assert!(!outcome.warnings.iter().any(|w| w.contains("Reasoning")));
        assert!(agent.calls.is_empty());
        assert_eq!(
            summary(&o, outcome.permission.as_ref()).as_deref(),
            Some("Permissions: Ask")
        );
    }

    #[test]
    fn grouped_select_options_are_flattened() {
        let o = SessionOptions::from_response(&json!({"configOptions": [{
            "type": "select", "id": "model", "name": "Model", "currentValue": "b",
            "options": [
                {"group": "g1", "name": "G1", "options": [{"value": "a", "name": "A"}]},
                {"group": "g2", "name": "G2", "options": [{"value": "b", "name": "B"}]}
            ]
        }]}));
        let slot = o.model_slot().unwrap();
        assert_eq!(slot.choices.len(), 2);
        assert_eq!(slot.current_name().as_deref(), Some("B"));
    }

    #[test]
    fn summary_uses_display_names() {
        assert_eq!(
            summary(&opts(), Some(&PermissionPolicy::Auto)).unwrap(),
            "Model: Claude Sonnet 5.5 · Reasoning: Medium · Mode: Agent · Permissions: Auto"
        );
    }

    #[test]
    fn describes_agent_initiated_changes() {
        let before = opts();
        let mut after = before.clone();
        after.set_current_mode(AGENT);
        assert!(describe_changes(&before, &after).is_empty());
        after.set_current_mode(PLAN);
        assert_eq!(describe_changes(&before, &after), vec!["Mode: Plan"]);
        let mut model_changed = before.clone();
        model_changed.update_config(&json!({"configOptions": [{
            "type": "select", "id": "model", "name": "Model", "category": "model",
            "currentValue": "kimi-k3", "options": [{"value": "kimi-k3", "name": "Kimi K3"}]
        }]}));
        assert_eq!(
            describe_changes(&before, &model_changed),
            vec!["Model: Kimi K3"]
        );
    }
}
