use schemars::{JsonSchema, Schema, generate::SchemaSettings};
use serde_json::Value;

use crate::{
    executors::BaseCodingAgent,
    installed_servers::{InstalledServers, ServerSource},
};

/// Generate a JSON Schema for the given executor's config form.
///
/// - Built-in non-ACP executors (CLAUDE_CODE, AMP, CODEX, OPENCODE): returns
///   the `schemars::schema_for!()` output for the concrete struct.
/// - ACP registry servers: schema with `append_prompt`, `additional_params`,
///   `env` -- NO `base_command_override`.
/// - ACP custom servers: same fields plus `base_command_override` (required).
/// - Unknown ACP server: generic ACP schema (same as registry).
pub fn generate_executor_schema(executor: &BaseCodingAgent) -> Value {
    match executor.as_str() {
        "CLAUDE_CODE" => generate_json_schema::<crate::executors::claude::ClaudeCode>(),
        "AMP" => generate_json_schema::<crate::executors::amp::Amp>(),
        "CODEX" => generate_json_schema::<crate::executors::codex::Codex>(),
        "OPENCODE" => generate_json_schema::<crate::executors::opencode::Opencode>(),
        "CURSOR_AGENT" => generate_json_schema::<crate::executors::cursor::CursorAgent>(),
        name => generate_acp_schema(name),
    }
}

/// Generate a schema for a built-in executor type using schemars.
fn generate_json_schema<T: JsonSchema>() -> Value {
    let mut settings = SchemaSettings::draft07();
    settings.inline_subschemas = true;

    let generator = settings.into_generator();
    let schema: Schema = generator.into_root_schema_for::<T>();

    let mut schema_value: Value = serde_json::to_value(&schema).unwrap_or_default();
    // Remove the title from root schema to prevent RJSF from creating an outer field container
    if let Some(obj) = schema_value.as_object_mut() {
        obj.remove("title");
    }
    schema_value
}

/// Generate a schema for an ACP server.
/// Registry servers get no `base_command_override`.
/// Custom servers get `base_command_override` as required.
fn generate_acp_schema(name: &str) -> Value {
    let is_custom = InstalledServers::load()
        .ok()
        .and_then(|servers| {
            servers
                .get(name)
                .map(|s| matches!(s.source, ServerSource::Custom))
        })
        .unwrap_or(false);

    if is_custom {
        generate_acp_custom_schema()
    } else {
        generate_acp_registry_schema()
    }
}

/// Schema for ACP registry servers: append_prompt, additional_params, env.
fn generate_acp_registry_schema() -> Value {
    serde_json::json!({
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "append_prompt": {
                "title": "Append Prompt",
                "description": "Extra text appended to the prompt",
                "type": ["string", "null"],
                "format": "textarea"
            },
            "model_id": {
                "title": "Model Override",
                "description": "Override the model name (use for unadvertised models or to set a persistent default)",
                "type": ["string", "null"]
            },
            "additional_params": {
                "title": "Additional Parameters",
                "description": "Additional parameters to append to the base command",
                "type": ["array", "null"],
                "items": { "type": "string" }
            },
            "env": {
                "title": "Environment Variables",
                "description": "Environment variables to set when running the executor",
                "type": ["object", "null"],
                "additionalProperties": { "type": "string" }
            }
        },
        "additionalProperties": true
    })
}

/// Schema for ACP custom servers: append_prompt, base_command_override (required),
/// additional_params, env.
fn generate_acp_custom_schema() -> Value {
    serde_json::json!({
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "required": ["base_command_override"],
        "properties": {
            "append_prompt": {
                "title": "Append Prompt",
                "description": "Extra text appended to the prompt",
                "type": ["string", "null"],
                "format": "textarea"
            },
            "base_command_override": {
                "title": "Base Command",
                "description": "The ACP command to run this server (required for custom servers)",
                "type": "string"
            },
            "model_id": {
                "title": "Model Override",
                "description": "Override the model name (use for unadvertised models or to set a persistent default)",
                "type": ["string", "null"]
            },
            "additional_params": {
                "title": "Additional Parameters",
                "description": "Additional parameters to append to the base command",
                "type": ["array", "null"],
                "items": { "type": "string" }
            },
            "env": {
                "title": "Environment Variables",
                "description": "Environment variables to set when running the executor",
                "type": ["object", "null"],
                "additionalProperties": { "type": "string" }
            }
        },
        "additionalProperties": true
    })
}
