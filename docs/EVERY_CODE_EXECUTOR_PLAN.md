# Every Code Executor Integration Plan

## Overview

This plan outlines the integration of [Every Code](https://github.com/just-every/code) as a new executor in Vibe Kanban. Every Code is a community-driven fork of OpenAI's Codex CLI with multi-agent orchestration, browser integration, and reasoning controls.

## Key Features to Support

### Core Commands
- **`/auto`** - Multi-step task automation with self-healing (Auto Drive)
- **`/plan`** - Multi-agent consensus planning (Claude, Gemini, GPT-5)
- **`/solve`** - Competitive racing between models (fastest preferred)
- **`/code`** - Consensus-based code generation with worktrees

### Configuration Options
- **Reasoning effort**: `low`, `medium`, `high`
- **Approval policy**: `untrusted`, `on-failure`, `on-request`, `never`
- **Sandbox mode**: `workspace-write`, `read-only`, etc.
- **Model selection**: GPT-5.1, Claude, Gemini, etc.
- **Browser integration**: CDP support, headless mode

## Implementation Steps

### Step 1: Create Executor Module

**File**: `crates/executors/src/executors/everycode.rs`

```rust
use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum_macros::AsRefStr;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor,
        acp::AcpAgentHarness,
    },
};

/// Reasoning effort level for Every Code
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ReasoningEffort {
    Low,
    Medium,
    High,
}

/// Approval policy for Every Code
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ApprovalPolicy {
    Untrusted,
    OnFailure,
    OnRequest,
    Never,
}

/// Orchestration mode for multi-agent commands
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum OrchestrationMode {
    /// Normal single-agent mode
    Normal,
    /// /auto - Multi-step automation with self-healing
    Auto,
    /// /plan - Multi-agent consensus planning
    Plan,
    /// /solve - Competitive racing (fastest wins)
    Solve,
    /// /code - Consensus code generation
    Code,
}

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct EveryCode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,

    /// Model to use (e.g., "gpt-5.1", "claude-sonnet-4", "gemini-3-pro")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Orchestration mode for multi-agent commands
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orchestration_mode: Option<OrchestrationMode>,

    /// Reasoning effort level
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,

    /// Approval policy
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<ApprovalPolicy>,

    /// Skip approval prompts entirely (dangerous)
    #[serde(default)]
    pub no_approval: bool,

    /// Read-only mode (no file modifications)
    #[serde(default)]
    pub read_only: bool,

    /// Enable debug logging
    #[serde(default)]
    pub debug: bool,

    #[serde(flatten)]
    pub cmd: CmdOverrides,

    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl EveryCode {
    pub fn base_command() -> &'static str {
        "npx -y @just-every/code"
    }

    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new(Self::base_command());

        // Add model flag if specified
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        // Add reasoning effort
        if let Some(effort) = &self.reasoning_effort {
            builder = builder.extend_params(["--config", &format!("model_reasoning_effort={}", effort.as_ref())]);
        }

        // Add approval policy
        if let Some(policy) = &self.approval_policy {
            builder = builder.extend_params(["--config", &format!("approval_policy={}", policy.as_ref())]);
        }

        // No approval mode
        if self.no_approval {
            builder = builder.extend_params(["--no-approval"]);
        }

        // Read-only mode
        if self.read_only {
            builder = builder.extend_params(["--read-only"]);
        }

        // Debug mode
        if self.debug {
            builder = builder.extend_params(["--debug"]);
        }

        apply_overrides(builder, &self.cmd)
    }

    fn harness() -> AcpAgentHarness {
        AcpAgentHarness::with_session_namespace("everycode_sessions")
    }

    /// Build the prompt with orchestration mode prefix if needed
    fn build_prompt(&self, prompt: &str) -> String {
        let base_prompt = self.append_prompt.combine_prompt(prompt);

        match &self.orchestration_mode {
            Some(OrchestrationMode::Auto) => format!("/auto {}", base_prompt),
            Some(OrchestrationMode::Plan) => format!("/plan {}", base_prompt),
            Some(OrchestrationMode::Solve) => format!("/solve {}", base_prompt),
            Some(OrchestrationMode::Code) => format!("/code {}", base_prompt),
            Some(OrchestrationMode::Normal) | None => base_prompt,
        }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for EveryCode {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let combined_prompt = self.build_prompt(prompt);

        let mut harness = Self::harness();
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
        }

        let command = self.build_command_builder().build_initial()?;
        let approvals = if self.no_approval {
            None
        } else {
            self.approvals.clone()
        };

        harness
            .spawn_with_command(
                current_dir,
                combined_prompt,
                command,
                env,
                &self.cmd,
                approvals,
            )
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let combined_prompt = self.build_prompt(prompt);

        let mut harness = Self::harness();
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
        }

        let command = self.build_command_builder().build_follow_up(&[])?;
        let approvals = if self.no_approval {
            None
        } else {
            self.approvals.clone()
        };

        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                command,
                env,
                &self.cmd,
                approvals,
            )
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        crate::executors::acp::normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        // Every Code reads from ~/.code/config.toml
        dirs::home_dir().map(|home| home.join(".code").join("config.toml"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Check for auth.json (ChatGPT login) or config.toml
        if let Some(timestamp) = dirs::home_dir()
            .and_then(|home| std::fs::metadata(home.join(".code").join("auth.json")).ok())
            .and_then(|m| m.modified().ok())
            .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
        {
            return AvailabilityInfo::LoginDetected {
                last_auth_timestamp: timestamp,
            };
        }

        // Check for config file or installation marker
        let config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_found = dirs::home_dir()
            .map(|home| home.join(".code").exists())
            .unwrap_or(false);

        if config_found || installation_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}
```

### Step 2: Register in mod.rs

**File**: `crates/executors/src/executors/mod.rs`

Add to imports:
```rust
use crate::executors::{
    // ... existing imports ...
    everycode::EveryCode,
};
```

Add module declaration:
```rust
pub mod everycode;
```

Add to CodingAgent enum:
```rust
#[enum_dispatch]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, Display, EnumDiscriminants, VariantNames)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
// ... existing attributes ...
pub enum CodingAgent {
    ClaudeCode,
    Amp,
    Gemini,
    Codex,
    Opencode,
    CursorAgent,
    QwenCode,
    Copilot,
    Droid,
    EveryCode,  // <-- Add this
}
```

Add MCP config in `get_mcp_config()`:
```rust
Self::EveryCode(_) => McpConfig::new(
    vec!["mcp_servers".to_string()],
    serde_json::json!({
        "mcp_servers": {}
    }),
    self.preconfigured_mcp(),
    true,
),
```

Add capabilities in `capabilities()`:
```rust
Self::EveryCode(_) => vec![BaseAgentCapability::SessionFork],
```

### Step 3: Add Default Profiles

**File**: `crates/executors/default_profiles.json`

```json
"EVERY_CODE": {
  "DEFAULT": {
    "EVERY_CODE": {
      "no_approval": true
    }
  },
  "AUTO": {
    "EVERY_CODE": {
      "orchestration_mode": "auto",
      "no_approval": true
    }
  },
  "PLAN": {
    "EVERY_CODE": {
      "orchestration_mode": "plan",
      "no_approval": true
    }
  },
  "SOLVE": {
    "EVERY_CODE": {
      "orchestration_mode": "solve",
      "no_approval": true
    }
  },
  "CODE": {
    "EVERY_CODE": {
      "orchestration_mode": "code",
      "no_approval": true
    }
  },
  "APPROVALS": {
    "EVERY_CODE": {
      "no_approval": false,
      "approval_policy": "on-request"
    }
  },
  "HIGH_REASONING": {
    "EVERY_CODE": {
      "reasoning_effort": "high",
      "no_approval": true
    }
  }
}
```

### Step 4: Update Type Generation

**File**: `crates/server/src/bin/generate_types.rs`

Add to decls vector:
```rust
executors::executors::everycode::EveryCode::decl(),
executors::executors::everycode::ReasoningEffort::decl(),
executors::executors::everycode::ApprovalPolicy::decl(),
executors::executors::everycode::OrchestrationMode::decl(),
```

Add to schemas generation:
```rust
(
    "every_code",
    generate_json_schema::<executors::executors::everycode::EveryCode>()?,
),
```

### Step 5: Generate Types

Run:
```bash
pnpm run generate-types
```

This will:
- Generate TypeScript types in `shared/types.ts`
- Generate JSON schema in `shared/schemas/every_code.json`

### Step 6: Test the Integration

1. Build the project: `pnpm run backend:check`
2. Run tests: `cargo test --workspace`
3. Start dev server: `pnpm run dev`
4. Verify Every Code appears in the executor dropdown

## Profile Variants Summary

| Variant | Description | Key Config |
|---------|-------------|------------|
| `DEFAULT` | Standard mode, auto-approve | `no_approval: true` |
| `AUTO` | Auto Drive orchestration | `orchestration_mode: auto` |
| `PLAN` | Multi-agent planning | `orchestration_mode: plan` |
| `SOLVE` | Competitive racing | `orchestration_mode: solve` |
| `CODE` | Consensus code generation | `orchestration_mode: code` |
| `APPROVALS` | Manual approval required | `approval_policy: on-request` |
| `HIGH_REASONING` | Extended thinking | `reasoning_effort: high` |

## MCP Configuration

Every Code uses TOML config at `~/.code/config.toml`:

```toml
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
```

The integration supports reading and updating MCP servers via the Vibe Kanban UI.

## Compatibility Notes

- Every Code reads from both `~/.code/` (primary) and legacy `~/.codex/` directories
- It only writes to `~/.code/`, so users can switch back to Codex if needed
- Supports ChatGPT auth (Plus/Pro/Team) or API key mode

## Future Enhancements

1. **Browser Integration**: Add `/chrome` and `/browser` command support for CDP
2. **Auto Review**: Integrate background review system notifications
3. **Code Bridge**: Stream errors and screenshots from running apps
4. **Theme Support**: Expose `/themes` command configuration

## Sources

- [Every Code GitHub](https://github.com/just-every/code)
- [Every Code Releases](https://github.com/just-every/code/releases)
- [NPM Package](https://www.npmjs.com/package/@just-every/code)
