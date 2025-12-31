# Vibe Kanban - AI-Powered Task Management Platform

A kanban-style task management platform that orchestrates AI coding agents (Claude Code, Gemini CLI, Codex, and others) to help developers plan, review, and execute coding tasks efficiently.

## Project Structure

```
crates/
  ├── server/          # API server, routes, middleware, MCP implementation
  ├── db/              # SQLx database models and migrations
  ├── executors/       # Task execution and code running capabilities
  ├── services/        # Business logic services
  ├── utils/           # Shared Rust utilities
  ├── deployment/      # Deployment strategies
  ├── local-deployment/# Local dev deployment setup
  ├── remote/          # Remote server integration
  └── review/          # Code review functionality

frontend/              # React + TypeScript app (Vite, Tailwind)
  └── src/
      ├── components/dialogs/  # Dialog components
      ├── components/ui/       # Shadcn UI components (kebab-case)
      ├── lib/                 # Utilities and helpers (camelCase)
      └── utils/               # Additional utilities (camelCase)

remote-frontend/       # Remote deployment frontend
shared/                # Generated TypeScript types (DO NOT EDIT)
assets/                # Packaged static assets
dev_assets/            # Local dev assets
npx-cli/               # Published npm CLI package
scripts/               # Dev helpers (ports, DB preparation)
docs/                  # Documentation
```

## Organization Rules

**Keep code organized and modularized:**
- Rust crates → One responsibility per crate, clear separation of concerns
- API routes → `crates/server/src/routes/`, organized by resource
- Frontend components → `frontend/src/components/`, one component per file
- UI components → `frontend/src/components/ui/` (kebab-case filenames)
- Dialog components → `frontend/src/components/dialogs/` (PascalCase)
- Utilities → `frontend/src/utils/` and `frontend/src/lib/` (camelCase)
- Tests → Next to code (`#[cfg(test)]` for Rust) or in `__tests__/` directories

**Modularity principles:**
- Single responsibility per file/module
- Clear, descriptive file names following conventions
- Group related functionality together
- Avoid monolithic files

**File naming conventions:**
- React components: `PascalCase.tsx` (e.g., `TaskCard.tsx`)
- Hooks: `camelCase.ts` starting with `use` (e.g., `useTasks.ts`)
- Utils/lib: `camelCase.ts` (e.g., `formatDate.ts`)
- UI components: `kebab-case.tsx` (e.g., `button.tsx`)

## Code Quality - Zero Tolerance

**After editing ANY file, run:**

```bash
npm run check          # TypeScript type checking (frontend)
npm run lint           # ESLint + Clippy (frontend + backend)
cargo fmt -- --check   # Rust formatting check
```

**Fix ALL errors/warnings before continuing.**

**Quality standards:**
- TypeScript: No `any` types without justification
- ESLint: Zero warnings (includes unused imports, i18n violations)
- Clippy: Treat warnings as errors (`-D warnings`)
- Prettier: Auto-format on save (2 spaces, single quotes, 80 cols)

## Managing Shared Types Between Rust and TypeScript

ts-rs generates TypeScript types from Rust structs/enums. When adding types:
1. Add `#[derive(TS)]` to Rust structs in `crates/server/`
2. Run `pnpm run generate-types` to regenerate `shared/types.ts`
3. **DO NOT** edit `shared/types.ts` directly - edit `crates/server/src/bin/generate_types.rs`

## Build, Test, and Development Commands

**Development:**
- `pnpm i` - Install dependencies
- `pnpm run dev` - Run frontend + backend (auto-assigns ports)
- `pnpm run backend:dev:watch` - Backend with hot reload
- `pnpm run frontend:dev` - Frontend dev server

**Quality checks:**
- `pnpm run check` - Type check both frontend and backend
- `pnpm run lint` - Lint both frontend and backend
- `pnpm run format` - Format all code

**Testing:**
- `cargo test --workspace` - Run all Rust tests
- Rust tests: Place alongside code using `#[cfg(test)]`
- Frontend: Ensure `check` and `lint` pass; add Vitest tests for runtime logic

**Type generation & Database:**
- `pnpm run generate-types` - Generate TS types from Rust
- `pnpm run prepare-db` - Prepare SQLx (offline, SQLite)
- `pnpm run remote:prepare-db` - Prepare SQLx (PostgreSQL)

**Building:**
- `pnpm run build:npx` - Build local NPX package
- `cd npx-cli && pnpm pack` - Pack NPX package

## Coding Style & Naming Conventions

**Rust:**
- `rustfmt.toml` enforced (group imports: StdExternalCrate)
- `snake_case` for modules and functions
- `PascalCase` for types and structs
- Add `Debug`, `Serialize`, `Deserialize` derives where useful

**TypeScript/React:**
- ESLint + Prettier (2 spaces, single quotes, 80 cols)
- `PascalCase` for components and types
- `camelCase` for variables and functions
- `kebab-case` for UI component filenames
- Enforced via `eslint-plugin-check-file`

**Keep functions small and focused.**

## Security & Config Tips

- Use `.env` for local overrides; never commit secrets
- Key env vars: `FRONTEND_PORT`, `BACKEND_PORT`, `HOST`
- Dev ports managed by `scripts/setup-dev-environment.js`
- OAuth credentials for GitHub/Google auth
- Sentry integration for error tracking

## Vibe-Kanban Integration

### Overview

The Vibe-Kanban integration provides a comprehensive workflow automation system for orchestrating AI coding agents through multi-stage development processes. It combines skills, hooks, commands, and MCP (Model Context Protocol) servers to create a seamless development experience.

### Core Components

#### 1. Skills System

Skills are reusable agent capabilities located in `.claude/skills/` that define specialized behaviors for different development phases:

**Available Skills:**
- `/research` - Research code patterns using Exa and Grep MCP before implementation
- `/implement` - Implement features based on research findings
- `/cicd` - Handle CI/CD pipelines, deployments, and infrastructure
- `/workflow-orchestrator` - Orchestrate complete Research → Implement → CI/CD workflow

**Skill Structure:**
```yaml
---
name: skill-name
description: What this skill does
---

# Detailed instructions for the agent
```

**Using Skills:**
```bash
# Invoke a specific skill
/research

# Orchestrate full workflow
/workflow-orchestrator
```

#### 2. Hooks System

Hooks are automated scripts that run at specific points in the task lifecycle:

**Pre-Task Hook** (`/.claude/hooks/pre-task.md`)
- Runs before task execution
- Validates environment (git status, dependencies, toolchain)
- Performs informational type checks
- Detects potential issues (large files, debug code, secrets)
- **NON-BLOCKING** - provides visibility without gating execution

**Post-Task Hook** (`/.claude/hooks/post-task.md`)
- Runs after task completion
- Shows git diff summary and impact analysis
- Runs quality checks (type, lint, format)
- Verifies no debug code left
- Provides commit readiness summary
- **NON-BLOCKING** - reports findings without preventing completion

**Pre-Commit Hook** (`/.claude/hooks/pre-commit.md`)
- Runs before git commit
- Validates all quality checks pass
- Ensures code is production-ready

#### 3. Commands System

Commands are executable workflows in `.claude/commands/`:

**Available Commands:**
- `/fix` - Run typechecking and linting, spawn parallel agents to fix all issues
- `/commit` - Run checks, commit with AI message, and push
- `/update-app` - Update dependencies, fix deprecations and warnings

**Example: Using `/fix`**
```bash
/fix
```
This command:
1. Runs all quality checks (TypeScript, ESLint, Clippy, formatting)
2. Groups errors by domain
3. Spawns parallel agents to fix issues in each domain
4. Re-checks until all clean

#### 4. Workflow System

Workflows coordinate multi-stage development processes with automatic stage transitions:

**Workflow Stages:**
- `RESEARCH` - Gather information using Grep MCP and WebSearch
- `IMPLEMENT` - Write code following Vibe Kanban patterns
- `CI_CD` - Validate builds, run tests, prepare deployment
- `REVIEW` - Code review and approval

**Workflow Configuration:**
```typescript
interface WorkflowConfig {
  name: string;
  description: string;
  version: string;
  stages: Array<WorkflowStageConfig>;
  automation: {
    auto_start_next_stage: boolean;
    auto_fix_on_failure: boolean;
    max_retries: number;
  };
}
```

**Workflow Progress Tracking:**
```typescript
interface WorkflowProgress {
  workflow_id: string;
  task_id: string;
  current_stage: WorkflowStage | null;
  status: WorkflowStatus;
  stages: Array<WorkflowStageProgress>;
  error_message: string | null;
  retry_count: number;
}
```

**Frontend Hooks:**
- `useWorkflowProgress(taskId)` - Track workflow execution
- `useAgentStatus(taskId)` - Monitor agent activity
- `useWorkflowHistory(projectId)` - View completed workflows
- `useWorkflowConfig(workflowName)` - Get workflow configuration

#### 5. MCP Server Integration

**Vibe Kanban MCP Server** (`crates/executors/default_mcp.json`)

Provides tools for external MCP clients (Claude Desktop, Raycast, coding agents):

**Project Operations:**
- `list_projects` - Fetch all projects

**Task Management:**
- `list_tasks` - List tasks in a project
- `create_task` - Create a new task
- `get_task` - Get task details
- `update_task` - Update task details
- `delete_task` - Delete a task

**Task Execution:**
- `start_task_attempt` - Start working on a task with a coding agent

**Configuration:**
```json
{
  "mcpServers": {
    "vibe_kanban": {
      "command": "npx",
      "args": ["-y", "vibe-kanban@latest", "--mcp"]
    }
  }
}
```

**Supported Executors:**
- `claude-code`, `amp`, `gemini`, `codex`, `opencode`, `cursor-agent`, `qwen-code`, `copilot`, `droid`

#### 6. Agent Profiles System

Agent profiles define configuration variants for coding agents:

**Location:** Settings → Agents → Agent Profiles

**Configuration Structure:**
```json
{
  "executors": {
    "CLAUDE_CODE": {
      "DEFAULT": { "CLAUDE_CODE": { "dangerously_skip_permissions": true } },
      "PLAN":    { "CLAUDE_CODE": { "plan": true } },
      "ROUTER":  { "CLAUDE_CODE": { "claude_code_router": true } }
    },
    "GEMINI": {
      "DEFAULT": { "GEMINI": { "model": "default", "yolo": true } },
      "FLASH":   { "GEMINI": { "model": "flash" } }
    }
  }
}
```

**Frontend Hook:**
- `useProfiles()` - Load and save agent profiles

**Key Options:**
- `plan` (Claude Code) - Enable planning mode
- `model` (Gemini/Codex) - Choose model variant
- `yolo` (Gemini/Qwen) - Run without confirmations
- `sandbox` (Codex) - Execution environment level
- `autonomy` (Droid) - Permission level

### Quick Start Examples

#### Example 1: Research and Implement a Feature

```bash
# Step 1: Research
/research
# Agent searches codebase and web for patterns

# Step 2: Implement
/implement
# Agent implements following Vibe Kanban patterns

# Step 3: Fix issues
/fix
# Auto-fix all type/lint/format errors

# Step 4: Commit
/commit
# Run checks, commit, and push
```

#### Example 2: Full Workflow Automation

```bash
/workflow-orchestrator
```
This single command:
1. Runs `/research` - Gathers information
2. Runs `/implement` - Writes code with tests
3. Auto-invokes `/fix` - Fixes all quality issues
4. Runs `/cicd` - Validates builds and deployment
5. Runs `/commit` - Commits and pushes changes

#### Example 3: Using MCP Server for Task Management

From an external MCP client (Claude Desktop, Raycast):

```
List all projects in Vibe Kanban.
Create a task "Add user authentication" in project XYZ.
Start working on the task using Claude Code on main branch.
```

The MCP client will use:
- `list_projects` tool
- `create_task` tool
- `start_task_attempt` tool

#### Example 4: Custom Agent Profile

Create a "planning" variant for Claude Code:

```json
{
  "CLAUDE_CODE": {
    "PLAN": {
      "CLAUDE_CODE": {
        "plan": true,
        "append_prompt": "Focus on architecture and design patterns."
      }
    }
  }
}
```

Use when creating attempts for planning tasks.

### Workflow Automation Guide

#### Creating Custom Workflows

1. **Define workflow configuration:**
```typescript
const customWorkflow: WorkflowConfig = {
  name: "feature-development",
  description: "Complete feature development workflow",
  version: "1.0.0",
  stages: [
    {
      id: WorkflowStage.RESEARCH,
      name: "Research",
      description: "Research patterns and best practices",
      agent: { executor: "CLAUDE_CODE", variant: "PLAN" },
      required: true
    },
    {
      id: WorkflowStage.IMPLEMENT,
      name: "Implement",
      description: "Implement the feature",
      agent: { executor: "CLAUDE_CODE", variant: "DEFAULT" },
      required: true
    },
    {
      id: WorkflowStage.CI_CD,
      name: "CI/CD",
      description: "Build, test, and prepare deployment",
      agent: { executor: "CLAUDE_CODE", variant: "DEFAULT" },
      required: true
    }
  ],
  automation: {
    auto_start_next_stage: true,
    auto_fix_on_failure: true,
    max_retries: 3
  }
};
```

2. **Start workflow from frontend:**
```typescript
const { startWorkflow } = useWorkflowProgress(taskId);
await startWorkflow(JSON.stringify(customWorkflow));
```

3. **Monitor progress:**
```typescript
const { state } = useWorkflowProgress(taskId);
// state contains: workflow_id, current_stage, status, stages
```

#### Hook Integration

Hooks integrate seamlessly with skills and commands:

**Pre-Task → Research → Implement → Post-Task → Fix → Commit**

```
1. Pre-task hook runs (non-blocking visibility)
2. Research skill gathers information
3. Implement skill writes code
4. Post-task hook shows impact
5. Fix command resolves quality issues
6. Commit command finalizes changes
```

### Best Practices

**For Development:**
- Always use `/workflow-orchestrator` for complex features
- Run `/fix` immediately after implementation
- Let hooks provide visibility without blocking
- Use agent profiles for consistent configuration

**For Quality:**
- Never commit without running `/fix` first
- All quality checks must pass (zero tolerance)
- Use type generation after Rust changes: `pnpm run generate-types`
- Prepare database: `pnpm run prepare-db`

**For MCP Integration:**
- Configure Vibe Kanban MCP server in agent profiles
- Use MCP tools for task management from external clients
- Leverage context7, playwright, exa, grep MCP servers

**For Workflows:**
- Define clear stage requirements
- Set appropriate retry limits
- Use auto-fix for non-critical issues
- Monitor workflow progress via hooks

### Troubleshooting

**Workflow stuck in a stage:**
- Check agent status: `useAgentStatus(taskId)`
- Review error message in `WorkflowProgress`
- Retry stage or manual intervention

**Type errors after Rust changes:**
```bash
pnpm run generate-types
git add shared/types.ts
```

**Database errors:**
```bash
pnpm run prepare-db          # Local SQLite
pnpm run remote:prepare-db   # Remote PostgreSQL
```

**MCP server not responding:**
- Check `crates/executors/default_mcp.json` configuration
- Verify NPX package: `npx vibe-kanban@latest --mcp`
- Check firewall/local access restrictions

**Quality checks failing:**
```bash
/fix   # Auto-fix all issues
```

### Related Documentation

- `/docs/vibe-kanban-integration.md` - Comprehensive integration guide
- `/docs/integrations/vibe-kanban-mcp-server.mdx` - MCP server configuration
- `/docs/configuration-customisation/agent-configurations.mdx` - Agent profiles
- `/docs/integrations/mcp-server-configuration.mdx` - MCP server setup
