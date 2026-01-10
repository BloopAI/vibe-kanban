# Pi Agent Configuration Enhancements Plan

## Overview

Enhance the Pi executor integration in Vibe Kanban to expose the full range of Pi CLI flags and RPC commands to users via the agent configuration UI. This will enable users to create and save different Pi modes (e.g., read-only, plan mode, minimal, etc.).

## Background

### Current State

Pi is already integrated with basic configuration in `default_profiles.json`:

```json
"PI": {
  "DEFAULT": {
    "PI": {
      "mode": "json"
    }
  },
  "HIGH_THINKING": {
    "PI": {
      "mode": "json",
      "thinking": "high"
    }
  },
  "NO_THINKING": {
    "PI": {
      "mode": "json",
      "thinking": "off"
    }
  }
}
```

The current Pi struct in `crates/executors/src/executors/pi/mod.rs` has these fields:
- `append_prompt`: Text appended to prompts
- `provider`: LLM provider (anthropic, openai, etc.)
- `model`: Model ID
- `thinking`: Thinking mode (off, low, medium, high)
- `use_npx`: Use npx vs local binary
- `cmd`: Base command override, additional params, env vars

**Hardcoded in `build_rpc_command_builder()`:**
```rust
builder = builder.extend_params(["--no-extensions", "--no-skills"]);
```

Extensions and skills are always disabled, which limits Pi's capabilities.

### Pi RPC Mode

Pi's RPC mode (`--mode rpc`) enables headless operation via JSON protocol over stdin/stdout:

- **Spawn-time flags**: Set at process start (--provider, --model, --no-extensions, etc.)
- **Runtime commands**: Change during session (set_model, set_thinking_level, etc.)

All CLI flags remain functional in RPC mode. Vibe Kanban spawns a new Pi process per attempt, so spawn-time options work naturally.

## Available Pi Flags

### Currently Supported
| Flag | Status |
|------|--------|
| `--provider` | ✅ Supported via `provider` field |
| `--model` | ✅ Supported via `model` field |
| `--thinking` | ✅ Supported via `thinking` field |
| `--mode rpc` | ✅ Hardcoded (required for Vibe Kanban) |
| `--session-dir` | ✅ Hardcoded to vibe-kanban session dir |
| `--use-npx` | ✅ Supported via `use_npx` field |

### Not Yet Supported
| Flag | Use Case |
|------|----------|
| `--no-extensions` | Disable extension discovery |
| `--no-skills` | Disable skills discovery |
| `--extension <path>` | Load specific extensions (e.g., plan-mode) |
| `--skills <patterns>` | Filter skills (e.g., "git-*,docker") |
| `--tools` | Specify tools (e.g., "read,grep,find,ls" for read-only) |
| `--no-tools` | Disable all built-in tools |
| `--system-prompt` | Custom system prompt (text or file) |
| `--append-system-prompt` | Append to system prompt |
| `--models` | Constrain model cycling patterns |
| `--no-session` | Ephemeral mode (don't save) |

## Implementation

### 1. Extend Pi Struct

File: `crates/executors/src/executors/pi/mod.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, Default)]
pub struct Pi {
    #[serde(default)]
    pub append_prompt: AppendPrompt,

    // Existing fields
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Provider",
        description = "LLM provider to use (e.g., anthropic, openai)"
    )]
    pub provider: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Model",
        description = "Model to use (e.g., claude-sonnet-4-20250514)"
    )]
    pub model: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Thinking Mode",
        description = "Thinking/reasoning mode: off, low, high, xhigh"
    )]
    pub thinking: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Use NPX",
        description = "Toggle between local binary and npx execution"
    )]
    pub use_npx: Option<bool>,

    // NEW: Extension control
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Disable Extensions",
        description = "Disable extension discovery"
    )]
    pub no_extensions: Option<bool>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Disable Skills",
        description = "Disable skills discovery and loading"
    )]
    pub no_skills: Option<bool>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(
        title = "Extensions",
        description = "Extension file paths to load"
    )]
    pub extensions: Vec<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Skills Filter",
        description = "Comma-separated glob patterns to filter skills (e.g., 'git-*,docker')"
    )]
    pub skills: Option<String>,

    // NEW: Tool control
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Tools",
        description = "Comma-separated tools to enable (read,bash,edit,write,grep,find,ls)"
    )]
    pub tools: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Disable All Tools",
        description = "Disable all built-in tools"
    )]
    pub no_tools: Option<bool>,

    // NEW: System prompt
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "System Prompt",
        description = "Custom system prompt (text or file path)"
    )]
    pub system_prompt: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Append System Prompt",
        description = "Append text or file contents to the system prompt"
    )]
    pub append_system_prompt: Option<String>,

    // NEW: Model constraints
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Model Patterns",
        description = "Model patterns for Ctrl+P cycling (e.g., 'sonnet:high,haiku:low')"
    )]
    pub models: Option<String>,

    // NEW: Session behavior
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Ephemeral Session",
        description = "Don't save session (ephemeral mode)"
    )]
    pub no_session: Option<bool>,

    #[serde(flatten)]
    pub cmd: CmdOverrides,
}
```

### 2. Update build_rpc_command_builder()

File: `crates/executors/src/executors/pi/mod.rs`

```rust
fn build_rpc_command_builder(&self) -> CommandBuilder {
    let base = if self.use_npx.unwrap_or(false) {
        "npx -y @mariozechner/pi-coding-agent"
    } else {
        "pi"
    };

    let mut builder = CommandBuilder::new(base);
    builder = builder.extend_params(["--mode", "rpc"]);

    let session_dir = Self::get_session_dir();
    builder = builder.extend_params(["--session-dir", &session_dir.to_string_lossy()]);

    // Extension and skills control (no longer hardcoded)
    if self.no_extensions.unwrap_or(false) {
        builder = builder.extend_params(["--no-extensions"]);
    }
    if self.no_skills.unwrap_or(false) {
        builder = builder.extend_params(["--no-skills"]);
    }

    // Load specific extensions
    for ext in &self.extensions {
        builder = builder.extend_params(["--extension", ext]);
    }

    // Skills filter
    if let Some(skills) = &self.skills {
        builder = builder.extend_params(["--skills", skills]);
    }

    // Tool control
    if self.no_tools.unwrap_or(false) {
        builder = builder.extend_params(["--no-tools"]);
    } else if let Some(tools) = &self.tools {
        builder = builder.extend_params(["--tools", tools]);
    }

    // System prompt
    if let Some(sp) = &self.system_prompt {
        builder = builder.extend_params(["--system-prompt", sp]);
    }
    if let Some(asp) = &self.append_system_prompt {
        builder = builder.extend_params(["--append-system-prompt", asp]);
    }

    // Model constraints
    if let Some(models) = &self.models {
        builder = builder.extend_params(["--models", models]);
    }

    // Session behavior
    if self.no_session.unwrap_or(false) {
        builder = builder.extend_params(["--no-session"]);
    }

    // Provider and model
    if let Some(provider) = &self.provider {
        builder = builder.extend_params(["--provider", provider.as_str()]);
    }
    if let Some(model) = &self.model {
        builder = builder.extend_params(["--model", model.as_str()]);
    }

    // Thinking mode
    if let Some(thinking) = &self.thinking {
        builder = builder.extend_params(["--thinking", thinking.as_str()]);
    }

    apply_overrides(builder, &self.cmd)
}
```

### 3. Update default_profiles.json

File: `crates/executors/default_profiles.json`

```json
"PI": {
  "DEFAULT": {
    "PI": {}
  },
  "HIGH_THINKING": {
    "PI": {
      "thinking": "high"
    }
  },
  "READ_ONLY": {
    "PI": {
      "tools": "read,grep,find,ls",
      "thinking": "medium"
    }
  },
  "PLAN_MODE": {
    "PI": {
      "extensions": ["~/.pi/agent/extensions/plan-mode/index.ts"],
      "no_skills": true
    }
  },
  "WITH_SKILLS": {
    "PI": {
      "no_extensions": true,
      "no_skills": false
    }
  },
  "MINIMAL": {
    "PI": {
      "no_extensions": true,
      "no_skills": true,
      "thinking": "off"
    }
  },
  "SONNET_HIGH": {
    "PI": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "thinking": "high"
    }
  },
  "EPHEMERAL": {
    "PI": {
      "no_session": true
    }
  }
}
```

## Implementation Order

1. **Extend Pi struct** with new optional fields
2. **Update `build_rpc_command_builder()`** to conditionally add flags
3. **Add schemars annotations** for proper form labels/descriptions
4. **Update `default_profiles.json`** with useful preset variants
5. **Run `pnpm run generate-types`** to regenerate TypeScript types
6. **Run `pnpm run check`** (frontend) and `cargo check` (backend)
7. **Test** in Vibe Kanban Settings → Agents → PI
8. **Document** available configuration options

## Notes

- No frontend changes needed: `ExecutorConfigForm.tsx` renders schemas automatically via `@rjsf/core`
- Schemas are generated from Rust structs via `ts-rs` and `schemars`
- Users can create custom variants via the UI (Settings → Agents → PI → Create Configuration)
- Spawn-time options (extensions, skills, tools) work naturally since Vibe Kanban spawns per-attempt
- Runtime commands (`set_model`, `set_thinking_level`) available via RPC if live switching is needed in future

## References

- Pi RPC Documentation: `~/.local/share/mise/installs/node/24.11.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/rpc.md`
- Vibe Kanban Agent Config Docs: https://www.vibekanban.com/docs/configuration-customisation/agent-configurations
- Current Pi Executor: `crates/executors/src/executors/pi/mod.rs`
- Profile Management: `crates/executors/src/profile.rs`
- UI: `frontend/src/pages/settings/AgentSettings.tsx`
