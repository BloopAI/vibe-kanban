use std::collections::HashMap;

use agent_client_protocol as proto;

use crate::{
    executors::SlashCommandDescription,
    model_selector::{
        AgentInfo, ModelInfo, ModelSelectorConfig, PermissionPolicy, ReasoningOption,
    },
};

/// Per-model reasoning options discovered by probing.
pub type PerModelReasoning = HashMap<String, Vec<ReasoningOption>>;

/// Convert ACP session metadata into VK ModelSelectorConfig.
/// ACP-native types stay inside the `acp/` module; only VK types leave.
pub fn translate_to_model_selector(
    modes: Option<&proto::SessionModeState>,
    models: Option<&proto::SessionModelState>,
    config_options: Option<&[proto::SessionConfigOption]>,
) -> ModelSelectorConfig {
    translate_to_model_selector_with_reasoning(modes, models, config_options, None)
}

/// Convert ACP session metadata into VK ModelSelectorConfig,
/// with optional per-model reasoning from a probe.
pub fn translate_to_model_selector_with_reasoning(
    modes: Option<&proto::SessionModeState>,
    models: Option<&proto::SessionModelState>,
    config_options: Option<&[proto::SessionConfigOption]>,
    per_model_reasoning: Option<&PerModelReasoning>,
) -> ModelSelectorConfig {
    let agents = modes
        .map(|m| {
            m.available_modes
                .iter()
                .map(|mode| AgentInfo {
                    id: mode.id.0.to_string(),
                    label: mode.name.clone(),
                    description: mode.description.clone(),
                    is_default: mode.id == m.current_mode_id,
                })
                .collect()
        })
        .unwrap_or_default();

    let global_reasoning = extract_reasoning_options(config_options);

    let vk_models: Vec<ModelInfo> = models
        .map(|m| {
            m.available_models
                .iter()
                .map(|model| {
                    let model_id = model.model_id.0.to_string();
                    let reasoning_options = per_model_reasoning
                        .and_then(|map| map.get(&model_id).cloned())
                        .unwrap_or_else(|| global_reasoning.clone());
                    ModelInfo {
                        id: model_id,
                        name: model.name.clone(),
                        provider_id: None,
                        reasoning_options,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let default_model = models.map(|m| m.current_model_id.0.to_string());

    ModelSelectorConfig {
        agents,
        models: vk_models,
        default_model,
        // Only Auto/Supervised for ACP — plan modes surface as agents instead
        permissions: vec![PermissionPolicy::Auto, PermissionPolicy::Supervised],
        ..Default::default()
    }
}

/// Convert ACP AvailableCommands to VK SlashCommandDescriptions.
pub fn translate_available_commands(
    commands: &[proto::AvailableCommand],
) -> Vec<SlashCommandDescription> {
    commands
        .iter()
        .map(|cmd| SlashCommandDescription {
            name: cmd.name.clone(),
            description: Some(cmd.description.clone()),
        })
        .collect()
}

/// Extract reasoning options from ACP SessionConfigOptions.
/// Looks for select-type config options that represent reasoning effort.
pub fn extract_reasoning_options(
    config_options: Option<&[proto::SessionConfigOption]>,
) -> Vec<ReasoningOption> {
    let Some(options) = config_options else {
        return Vec::new();
    };

    options
        .iter()
        .filter_map(|opt| {
            if let proto::SessionConfigKind::Select(select) = &opt.kind {
                let is_reasoning = matches!(
                    opt.category,
                    Some(proto::SessionConfigOptionCategory::ThoughtLevel)
                ) || opt.id.0.to_lowercase().contains("reason")
                    || opt.name.to_lowercase().contains("reason");
                if is_reasoning {
                    let flat_options = match &select.options {
                        proto::SessionConfigSelectOptions::Ungrouped(opts) => opts.clone(),
                        proto::SessionConfigSelectOptions::Grouped(groups) => groups
                            .iter()
                            .flat_map(|g| g.options.iter().cloned())
                            .collect(),
                        _ => return None,
                    };
                    let options: Vec<ReasoningOption> = flat_options
                        .iter()
                        .map(|choice| ReasoningOption {
                            id: choice.value.0.to_string(),
                            label: choice.name.clone(),
                            is_default: choice.value == select.current_value,
                        })
                        .collect();
                    return Some(options);
                }
            }
            None
        })
        .next()
        .unwrap_or_default()
}
