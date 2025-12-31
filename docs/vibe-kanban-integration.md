---
title: "Vibe-Kanban Integration Guide"
description: "Comprehensive guide to integrating Vibe Kanban with Claude Code and other AI coding agents"
---

# Vibe-Kanban Integration Guide

This comprehensive guide covers the complete Vibe-Kanban integration system, including skills, hooks, commands, workflows, MCP servers, and agent profiles.

<Info>
The Vibe-Kanban integration orchestrates AI coding agents through multi-stage development processes, combining automated research, implementation, quality assurance, and deployment into seamless workflows.
</Info>

## Table of Contents

1. [Quick Start](#quick-start)
2. [Skills System](#skills-system)
3. [Hooks System](#hooks-system)
4. [Commands System](#commands-system)
5. [Workflow Automation](#workflow-automation)
6. [MCP Server Integration](#mcp-server-integration)
7. [Agent Profiles](#agent-profiles)
8. [Advanced Configuration](#advanced-configuration)
9. [Troubleshooting](#troubleshooting)
10. [FAQ](#faq)

---

## Quick Start

### Prerequisites

- Vibe Kanban installed and running
- Claude Code or compatible AI coding agent
- Node.js 18+ and pnpm 8+
- Rust toolchain (for backend development)

### Basic Setup

<Steps>
<Step title="Verify Installation">
  Ensure Vibe Kanban is running:

  ```bash
  pnpm run dev
  ```

  <Check>
  Vibe Kanban should start on an auto-assigned port (see console output)
  </Check>
</Step>

<Step title="Configure Agent Profile">
  Navigate to **Settings → Agents → Agent Profiles** and configure your default agent:

  ```json
  {
    "executors": {
      "CLAUDE_CODE": {
        "DEFAULT": {
          "CLAUDE_CODE": {
            "dangerously_skip_permissions": true
          }
        }
      }
    }
  }
  ```

  <Check>
  Your profile should appear in the agent selector when creating attempts
  </Check>
</Step>

<Step title="Run Your First Workflow">
  Create a task and invoke the workflow orchestrator:

  ```bash
  /workflow-orchestrator
  ```

  <Check>
  The agent will automatically research, implement, fix issues, and commit
  </Check>
</Step>
</Steps>

### What Happens Next

When you run `/workflow-orchestrator`:

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW ORCHESTRATOR                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. PRE-TASK HOOK                                            │
│     ├─ Git status check                                      │
│     ├─ Environment validation                                │
│     └─ Informational type checks                             │
│                                                               │
│  2. RESEARCH PHASE                                           │
│     ├─ Search codebase (Grep MCP)                            │
│     ├─ Research patterns (WebSearch/Exa)                     │
│     └─ Generate research brief                               │
│                                                               │
│  3. IMPLEMENTATION PHASE                                     │
│     ├─ Create/modify files                                   │
│     ├─ Write tests                                           │
│     ├─ Generate types (if Rust changed)                      │
│     └─ Auto-invoke /fix                                      │
│                                                               │
│  4. POST-TASK HOOK                                           │
│     ├─ Show git diff summary                                 │
│     ├─ Run quality checks                                    │
│     └─ Provide commit readiness                              │
│                                                               │
│  5. FIX PHASE                                                │
│     ├─ Run type checking                                     │
│     ├─ Run linting                                           │
│     ├─ Spawn parallel fix agents                             │
│     └─ Verify all issues resolved                           │
│                                                               │
│  6. CI/CD PHASE                                              │
│     ├─ Run all tests                                         │
│     ├─ Validate NPX build                                    │
│     ├─ Check security                                        │
│     └─ Prepare deployment                                    │
│                                                               │
│  7. COMMIT PHASE                                             │
│     ├─ Generate smart commit message                         │
│     ├─ Commit all changes                                    │
│     └─ Push to repository                                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Skills System

Skills are reusable agent capabilities that define specialized behaviors for different development phases. Each skill is a self-contained instruction set that guides the AI agent through specific tasks.

### Available Skills

#### Research Skill

**Location:** `.claude/skills/research/SKILL.md`

**Purpose:** Gather comprehensive information BEFORE any code implementation begins.

**Capabilities:**
- Search local codebase using Grep MCP
- Research external patterns using WebSearch/Exa MCP
- Find best practices for technology stack
- Identify Vibe Kanban specific patterns
- Generate implementation plan

**Usage:**
```bash
/research
```

**What It Does:**

1. **Local Codebase Search (Grep MCP)**
   - Finds similar implementations
   - Locates test patterns
   - Identifies configuration files
   - Searches for error handling patterns

2. **External Research (WebSearch/Exa MCP)**
   - Best practices for Rust/TypeScript/React
   - Common patterns and libraries
   - Documentation examples
   - Community solutions

3. **Research Brief Generation**
   ```markdown
   # Research Brief: [Feature Name]

   ## Local Patterns Found
   - Similar implementation: `file/path:line`
   - Test pattern: `test/file:path`

   ## External Best Practices
   - Best practice 1
   - Library recommendation: X

   ## Implementation Plan
   1. Create: `new_file.ts`
   2. Modify: `existing_file.rs`

   ## Dependencies
   - Add: `package-name` (version)
   ```

**Key Areas Searched in Vibe Kanban:**
- `crates/server/src/routes/` - API route patterns
- `crates/server/src/` - Service and model patterns
- `frontend/src/components/` - React component patterns
- `frontend/src/lib/` and `frontend/src/utils/` - Utility patterns
- `__tests__/` directories - Test patterns

#### Implement Skill

**Location:** `.claude/skills/implement/SKILL.md`

**Purpose:** Write clean, tested code following existing patterns in the Vibe Kanban project.

**Prerequisites:**
- `/research` must have been completed
- Research brief should be available

**Usage:**
```bash
/implement
```

**What It Does:**

1. **Plan Implementation**
   - Identifies files to modify/create
   - Defines implementation order
   - Plans test strategy
   - Checks for potential conflicts

2. **Execute Implementation**
   - Follows existing patterns from codebase
   - Uses npm scripts when available
   - Maintains consistency with repo conventions
   - Writes tests first (TDD approach)

3. **File Naming Conventions:**
   - React components: `PascalCase.tsx`
   - Hooks: `camelCase.ts` starting with `use`
   - Utils/lib: `camelCase.ts`
   - UI components: `kebab-case.tsx`
   - Rust: `snake_case.rs`

4. **Auto-Invoke /Fix**
   After implementation, automatically runs `/fix`:
   - Runs type checking (`npm run check`)
   - Runs linting (`npm run lint`)
   - Runs formatting check (`cargo fmt -- --check`)
   - Auto-fixes all issues
   - Re-checks until clean

**Quality Standards:**

*TypeScript:*
- Zero type errors (no `any` without justification)
- Zero ESLint warnings
- Prettier formatted (2 spaces, single quotes, 80 cols)
- Type hints on all functions
- JSDoc on public functions

*Rust:*
- Zero Clippy warnings (`-D warnings`)
- rustfmt compliant
- All derivables added (`Debug`, `Serialize`, `Deserialize`)
- Proper error handling (`Result`, `Option`)
- Doc comments on public items

#### CI/CD Skill

**Location:** `.claude/skills/cicd/SKILL.md`

**Purpose:** Ensure all code is deployment-ready for the Vibe Kanban project.

**Prerequisites:**
- Implementation complete
- All tests passing
- Code reviewed and approved (via `/fix` and quality checks)

**Usage:**
```bash
/cicd
```

**What It Does:**

1. **Pipeline Configuration**
   - Validates CI configuration
   - Checks deployment strategies
   - Verifies Docker setups

2. **Infrastructure Validation**
   - Validates environment variables
   - Checks dependencies
   - Verifies type generation
   - Checks database preparation

3. **Comprehensive Testing**
   ```bash
   cargo test --workspace        # Rust tests
   npm run check                  # Type checking
   npm run lint                   # Linting
   cargo fmt -- --check           # Formatting
   ```

4. **Build Validation**
   ```bash
   pnpm run build:npx            # Build NPX package
   ls -la npx-cli/dist/          # Verify build
   npm run test:npm              # Test locally
   ```

5. **Deployment Preparation**
   - Version management
   - Documentation updates
   - Pre-deployment checks

6. **Invoke /Commit**
   After all validations pass, invokes `/commit` to finalize.

**Deployment Readiness Criteria:**

- [ ] All tests passing (Rust + TypeScript)
- [ ] Type generation up to date
- [ ] Database prepared (SQLx)
- [ ] NPX package builds successfully
- [ ] No security vulnerabilities
- [ ] Documentation updated
- [ ] Environment variables documented
- [ ] Code formatted (rustfmt + Prettier)

#### Workflow Orchestrator Skill

**Location:** `.claude/skills/workflow-orchestrator/SKILL.md`

**Purpose:** Coordinate all phases of development automatically for the Vibe Kanban project.

**Usage:**
```bash
/workflow-orchestrator
```

**What It Does:**

This is the master skill that orchestrates the entire development lifecycle:

```
Phase 1: Research
  └─> Invoke /research
  └─> Monitor progress
  └─> Auto-proceed to Phase 2 (no approval needed)

Phase 2: Implementation
  └─> Invoke /implement
  └─> Monitor progress
  └─> Auto-invoke /fix
  └─> Verify tests pass

Phase 3: CI/CD
  └─> Invoke /cicd
  └─> Validate builds
  └─> Check security
  └─> Prepare deployment

Phase 4: Finalization
  └─> Invoke /commit
  └─> Generate commit message
  └─> Commit and push
```

**Automation Mode:**

- No user approval required at any phase
- Auto-proceeds from research to implementation
- Auto-fixes issues without asking
- Auto-commits and pushes changes
- Only pauses on critical failures

**Critical Failures (Pause):**
- Implementation conflicts with existing code
- Fundamental design issues
- Security vulnerabilities that can't be auto-fixed
- Test failures after 3 retries
- MCP servers completely unavailable
- NPX build failures

**Non-Critical (Continue):**
- Partial research results
- Auto-fixable lint/type errors
- Test failures that can be fixed
- Dependency updates needed

### Creating Custom Skills

To create a custom skill:

<Steps>
<Step title="Create Skill Directory">
  ```bash
  mkdir -p .claude/skills/your-skill
  ```
</Step>

<Step title="Create SKILL.md">
  Create `.claude/skills/your-skill/SKILL.md`:

  ```yaml
  ---
  name: your-skill
  description: What your skill does
  ---

  # Your Skill Name

  You are a specialist. Your goal is to...

  ## Step 1: First Step

  Instructions for the first step...

  ## Step 2: Second Step

  Instructions for the second step...

  ## Automation Mode

  - Behavior in automated mode
  - When to pause vs. continue
  ```
</Step>

<Step title="Invoke Your Skill">
  ```bash
  /your-skill
  ```
</Step>
</Steps>

### Skill Best Practices

**DO:**
- Keep skills focused on a single responsibility
- Use clear step-by-step instructions
- Define automation behavior explicitly
- Include progress tracking
- Handle errors gracefully

**DON'T:**
- Create overly complex skills
- Mix concerns (research vs. implementation)
- Skip error handling
- Assume user approval is available
- Ignore Vibe Kanban conventions

---

## Hooks System

Hooks are automated scripts that run at specific points in the task lifecycle. They provide visibility and validation without blocking execution.

### Pre-Task Hook

**Location:** `.claude/hooks/pre-task.md`

**Purpose:** Validate environment and provide visibility before task execution.

**Behavior:** NON-BLOCKING - logs information and continues regardless of results.

**What It Checks:**

1. **Git Status**
   ```bash
   git status --short
   ```
   - Modified files (staged/unstaged)
   - Untracked files
   - Deleted files

2. **Current Branch and Recent Activity**
   ```bash
   git branch --show-current
   git log --oneline -3
   ```

3. **Environment Validation**
   - Frontend dependencies check
   - Backend Rust toolchain check

4. **Quick Type Check (Informational)**
   ```bash
   cd frontend && npm run check
   cargo check --quiet
   ```

5. **Common Issues Detection**
   - Large files warning (>5MB)
   - Debug code detection (`console.log`, `debugger`, `TODO`)
   - Secrets detection (basic pattern matching)

6. **Test Status Summary**
   - Reminds to run tests

**Output Example:**
```
=== Pre-Task Hook ===

📊 Git Status:
M  frontend/src/components/TaskCard.tsx
?? frontend/src/utils/newUtil.ts

🌿 Current Branch: feature/add-task-card
Recent Commits:
  abc1234 Implement task card component
  def5678 Add utility functions

✓ Frontend dependencies installed
✓ Cargo is available

=== Type Checks (informational) ===
Frontend (TypeScript): No errors
Backend (Rust): No errors

=== Large Files Check ===
No large files found

=== Debug Code Check ===
Frontend debug statements: 3 instances
Backend debug statements: 0 instances

=== Secrets Detection ===
✓ Secrets check complete

=== Test Status ===
Backend tests: Run 'cargo test --workspace' to verify
Frontend tests: Ensure test setup is configured
```

### Post-Task Hook

**Location:** `.claude/hooks/post-task.md`

**Purpose:** Provide visibility into task impact and validate quality after completion.

**Behavior:** NON-BLOCKING - reports findings but doesn't prevent completion.

**What It Reports:**

1. **Git Diff Summary**
   ```bash
   git diff --stat
   git diff --name-status
   ```

2. **Quality Check Results**
   - Frontend type check (TypeScript)
   - Backend type check (Rust)
   - Full linting check

3. **Code Formatting Check**
   ```bash
   cargo fmt -- --check
   cd frontend && npm run format:check
   ```

4. **Impact Analysis**
   - Changes by file type
   - Frontend changes count
   - Backend changes count
   - Shared types changes

5. **Debug Code Audit**
   - Checks for `console.log` in changes
   - Checks for `dbg!`/`println!` in Rust changes

6. **Testing Recommendations**
   - Suggests tests to run based on changes
   - Checks if shared types changed

7. **Commit Readiness Summary**
   - Staged/unstaged file counts
   - Next steps recommendations

**Output Example:**
```
=== Post-Task Hook ===

📊 Files Changed:
 frontend/src/components/TaskCard.tsx | 45 ++++++++++++++++++++++--
 frontend/src/utils/newUtil.ts         | 20 +++++++++++
 frontend/src/lib/api.ts              |  5 +--
 3 files changed, 62 insertions(+), 8 deletions(-)

=== Type Check Results ===
Frontend (TypeScript): ✓ Passed
Backend (Rust): ✓ Passed

=== Linting Results ===
✓ Linting passed

=== Code Formatting Check ===
✓ Rust code is formatted
⚠️  Frontend code needs formatting - run 'npm run format'

=== Impact Analysis ===
Changes by type:
  3 ts
Frontend changes: 3 files
Backend changes: 0 files
Shared types changes: 0 files

=== New Files ===
+ frontend/src/utils/newUtil.ts

=== Debug Code Audit ===
⚠️  console.log found in frontend/src/components/TaskCard.tsx

=== Testing Recommendations ===
📝 Frontend was modified:
  - Review component changes manually
  - Test affected UI flows
  - Check for i18n issues with: npm run lint:i18n

=== Commit Readiness Summary ===
Staged files: 0
Unstaged files: 3

⚠️  No staged changes - stage files with: git add <files>
ℹ️  You have unstaged changes - review with: git diff

╔═══════════════════════════════════════════════════════════════╗
║                    TASK IMPACT SUMMARY                        ║
╚═══════════════════════════════════════════════════════════════╝
📊 Files modified: 3
   - Frontend: 3
   - Backend: 0

🔍 Quality Checks:
   - Type checks: Run above (review for errors)
   - Linting: Run above (review for warnings)
   - Formatting: Run above (review for issues)

💡 Recommendations:
   ✓ Review all changes with: git diff
   ✓ Run tests if business logic changed
   ✓ Stage files and commit when ready
```

### Pre-Commit Hook

**Location:** `.claude/hooks/pre-commit.md`

**Purpose:** Ensure all quality checks pass before committing.

**Behavior:** BLOCKING - prevents commit if checks fail.

**What It Validates:**

1. All type checks pass (TypeScript + Rust)
2. All linting passes (ESLint + Clippy)
3. All formatting is correct
4. All tests pass
5. No debug code remains
6. Documentation is updated

### Creating Custom Hooks

To create a custom hook:

<Steps>
<Step title="Create Hook File">
  ```bash
  # Pre-task hook
  touch .claude/hooks/my-pre-task.md

  # Post-task hook
  touch .claude/hooks/my-post-task.md
  ```
</Step>

<Step title="Write Hook Logic">
  ```markdown
  # Custom Hook Name

  **Purpose**: What this hook does

  ---

  ## Step 1: Description

  Command or validation to run...

  ## Step 2: Description

  Another command or validation...

  ## Summary

  What the hook accomplished...
  ```
</Step>

<Step title="Reference in Task Context">
  Hooks are automatically discovered and run by Claude Code
</Step>
</Steps>

### Hook Best Practices

**Pre-Task Hooks:**
- Keep informational (non-blocking)
- Provide visibility into state
- Warn but don't block
- Run quick checks

**Post-Task Hooks:**
- Show impact clearly
- Suggest fixes
- Provide actionable next steps
- Report but don't block

**Pre-Commit Hooks:**
- Be strict (blocking)
- Validate quality gates
- Ensure production-ready
- Catch critical issues

---

## Commands System

Commands are executable workflows that combine multiple operations into automated sequences.

### Available Commands

#### Fix Command

**Location:** `.claude/commands/fix.md`

**Purpose:** Run typechecking and linting, then spawn parallel agents to fix all issues.

**Usage:**
```bash
/fix
```

**What It Does:**

1. **Run All Quality Checks**
   ```bash
   # Frontend type checking
   cd frontend && npm run check

   # Frontend linting
   cd frontend && npm run lint

   # Frontend formatting
   cd frontend && npm run format:check

   # Backend linting
   cargo clippy --workspace --all-targets --all-features -- -D warnings

   # Backend formatting
   cargo fmt -- --check
   ```

2. **Collect and Parse Errors**
   Groups errors by domain:
   - Frontend Type Errors (TypeScript)
   - Frontend Lint Errors (ESLint)
   - Frontend Format Errors (Prettier)
   - Backend Lint Errors (Clippy)
   - Backend Format Errors (rustfmt)

3. **Spawn Parallel Agents**
   For each domain with issues, spawns an agent:
   - Frontend Type Fixer Agent
   - Frontend Lint Fixer Agent
   - Frontend Format Fixer Agent
   - Backend Lint Fixer Agent
   - Backend Format Fixer Agent

4. **Verify All Fixes**
   Re-runs full check suite to ensure all issues resolved

**Error Categories:**

*TypeScript Type Errors:*
- Type mismatches
- Missing types
- Incorrect type usage
- Implicit any types

*ESLint Errors:*
- Unused imports
- Type safety issues
- Code quality issues
- i18n violations
- File naming violations

*Prettier Formatting:*
- Spacing issues
- Quote style
- Line length
- Indentation

*Clippy Warnings:*
- Unused variables
- Suspicious code patterns
- Performance issues
- Code quality

*Rust Formatting:*
- Indentation
- Line breaks
- Spacing
- Ordering

**Progress Output:**
```
🔧 Running /fix...

=== Quality Checks ===
Frontend type check: Found 5 errors
Frontend linting: Found 12 warnings
Frontend formatting: Found 3 issues
Backend linting: Found 8 warnings
Backend formatting: Found 2 issues

=== Spawning Parallel Fix Agents ===
🤖 Frontend Type Fixer: Working...
🤖 Frontend Lint Fixer: Working...
🤖 Frontend Format Fixer: Working...
🤖 Backend Lint Fixer: Working...
🤖 Backend Format Fixer: Working...

=== Verification ===
Frontend type check: ✓ Clean
Frontend linting: ✓ Clean
Frontend formatting: ✓ Clean
Backend linting: ✓ Clean
Backend formatting: ✓ Clean

✅ All issues resolved!
```

#### Commit Command

**Location:** `.claude/commands/commit.md`

**Purpose:** Run checks, commit with AI message, and push.

**Usage:**
```bash
/commit
```

**What It Does:**

1. **Run Final Quality Checks**
   ```bash
   npm run check
   npm run lint
   cargo fmt -- --check
   ```

2. **Review Changes**
   ```bash
   git status
   git diff
   git log --oneline -5  # Recent commits for style reference
   ```

3. **Generate Commit Message**
   - Analyzes changes using git diff
   - Follows conventional commit format
   - Verb-led, specific, concise
   - References related issues

   Example:
   ```
   feat: add task card component with drag-and-drop

   - Implement TaskCard.tsx with shadcn/ui
   - Add useTaskDrag hook for drag-and-drop
   - Update task list layout
   - Add task card tests

   Closes #123
   ```

4. **Commit All Changes**
   ```bash
   git add -A
   git commit -m "generated commit message"
   ```

5. **Push to Repository**
   ```bash
   git push
   ```

**Progress Output:**
```
✨ Running /commit...

=== Final Quality Checks ===
Type checking: ✓ Clean
Linting: ✓ Clean
Formatting: ✓ Clean

=== Analyzing Changes ===
Files changed: 5
Lines added: 342
Lines removed: 87

=== Generating Commit Message ===
feat: add task card component with drag-and-drop

=== Committing Changes ===
[main abc1234] feat: add task card component with drag-and-drop
 5 files changed, 342 insertions(+), 87 deletions(-)

=== Pushing to Repository ===
To github.com:org/repo.git
   def5678..abc1234  main -> main

✅ Commit and push complete!
```

#### Update-App Command

**Location:** `.claude/commands/update-app.md`

**Purpose:** Update dependencies, fix deprecations and warnings.

**Usage:**
```bash
/update-app
```

**What It Does:**

1. **Check for Updates**
   ```bash
   # Frontend dependencies
   cd frontend && npm outdated

   # Rust dependencies
   cargo outdated
   ```

2. **Update Dependencies**
   ```bash
   # Frontend
   cd frontend && npm update

   # Rust
   cargo update
   ```

3. **Fix Deprecations**
   - Analyzes deprecation warnings
   - Updates deprecated APIs
   - Refactors code as needed

4. **Fix Warnings**
   - Fixes lint warnings
   - Updates type hints
   - Resolves security issues

5. **Run Quality Checks**
   ```bash
   /fix
   ```

6. **Run Tests**
   ```bash
   cargo test --workspace
   ```

### Creating Custom Commands

To create a custom command:

<Steps>
<Step title="Create Command File">
  ```bash
  touch .claude/commands/your-command.md
  ```
</Step>

<Step title="Define Command Workflow">
  ```markdown
  ---
  name: your-command
  description: What your command does
  ---

  # Command Name

  Brief description of what this command does.

  ## Step 1: Description

  Instructions for step 1...

  ```bash
  # Commands to run
  command arg1 arg2
  ```

  ## Step 2: Description

  Instructions for step 2...

  ## Progress Tracking

  Log command execution...
  ```
</Step>

<Step title="Invoke Your Command">
  ```bash
  /your-command
  ```
</Step>
</Steps>

### Command Best Practices

**DO:**
- Combine related operations
- Provide clear progress feedback
- Handle errors gracefully
- Run quality checks before committing
- Generate smart commit messages

**DON'T:**
- Skip validation steps
- Commit without tests
- Ignore security warnings
- Break existing functionality
- Create overly complex commands

---

## Workflow Automation

Workflows coordinate multi-stage development processes with automatic stage transitions and progress tracking.

### Workflow Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        WORKFLOW SYSTEM                         │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│  │ RESEARCH │───>│IMPLEMENT │───>│  CI/CD   │───>│ COMMIT │ │
│  └──────────┘    └──────────┘    └──────────┘    └────────┘ │
│        │               │               │              │       │
│        ▼               ▼               ▼              ▼       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│  │   Grep   │    │  Write   │    │  Test    │    │  Push  │ │
│  │  WebSearch│   │  Code    │    │  Build   │    │        │ │
│  │   Plan   │    │  /fix    │    │ Security │    │        │ │
│  └──────────┘    └──────────┘    └──────────┘    └────────┘ │
│                                                                │
│  Workflow Progress Tracking:                                   │
│  - useWorkflowProgress(taskId)                                │
│  - useAgentStatus(taskId)                                     │
│  - useWorkflowHistory(projectId)                              │
│  - useWorkflowConfig(workflowName)                            │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

### Workflow Stages

#### Research Stage

**Purpose:** Gather comprehensive information before implementation.

**Agent:** Claude Code (PLAN variant)

**Operations:**
1. Search local codebase (Grep MCP)
2. Research external patterns (WebSearch/Exa MCP)
3. Generate implementation plan
4. Identify dependencies and risks

**Success Criteria:**
- Research brief generated
- Implementation plan defined
- Dependencies identified
- Risks documented

**Output:**
```typescript
{
  stage: WorkflowStage.RESEARCH,
  status: "completed",
  agent_status: "completed",
  duration_seconds: 45,
  started_at: "2025-01-15T10:00:00Z",
  completed_at: "2025-01-15T10:00:45Z"
}
```

#### Implement Stage

**Purpose:** Write clean, tested code following Vibe Kanban patterns.

**Agent:** Claude Code (DEFAULT variant)

**Operations:**
1. Create/modify files
2. Write tests
3. Generate types (if Rust changed)
4. Auto-invoke `/fix`

**Success Criteria:**
- All files created/modified
- Tests written and passing
- Type errors: 0
- Lint warnings: 0

**Output:**
```typescript
{
  stage: WorkflowStage.IMPLEMENT,
  status: "completed",
  agent_status: "completed",
  duration_seconds: 180,
  started_at: "2025-01-15T10:01:00Z",
  completed_at: "2025-01-15T10:04:00Z"
}
```

#### CI/CD Stage

**Purpose:** Validate builds, run tests, prepare deployment.

**Agent:** Claude Code (DEFAULT variant)

**Operations:**
1. Run all tests
2. Validate NPX build
3. Check security vulnerabilities
4. Prepare deployment artifacts

**Success Criteria:**
- All tests passing
- NPX build successful
- No security issues
- Deployment artifacts ready

**Output:**
```typescript
{
  stage: WorkflowStage.CI_CD,
  status: "completed",
  agent_status: "completed",
  duration_seconds: 90,
  started_at: "2025-01-15T10:04:30Z",
  completed_at: "2025-01-15T10:06:00Z"
}
```

#### Review Stage

**Purpose:** Code review and approval (optional).

**Agent:** Human or automated reviewer

**Operations:**
1. Review code changes
2. Verify tests
3. Approve or request changes
4. Merge to target branch

**Success Criteria:**
- Code reviewed
- All feedback addressed
- Approval received

### Frontend Hooks for Workflows

#### useWorkflowProgress

Track workflow execution for a specific task.

```typescript
import { useWorkflowProgress } from '@/hooks/useWorkflows';

function TaskWorkflow({ taskId }: { taskId: string }) {
  const { state, refetch, startWorkflow, startStage } = useWorkflowProgress(taskId);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.error}</div>;

  const workflow = state.data;

  return (
    <div>
      <h2>Workflow Progress</h2>
      <p>Status: {workflow.status}</p>
      <p>Current Stage: {workflow.current_stage}</p>

      {workflow.stages.map(stage => (
        <div key={stage.stage}>
          <h3>{stage.stage}</h3>
          <p>Status: {stage.status}</p>
          <p>Duration: {stage.duration_seconds}s</p>
        </div>
      ))}

      <button onClick={() => startStage(WorkflowStage.RESEARCH)}>
        Start Research
      </button>
    </div>
  );
}
```

**State Types:**
```typescript
type WorkflowProgressState =
  | { status: 'loading' }
  | { status: 'success'; data: WorkflowProgress }
  | { status: 'error'; error: string };
```

#### useAgentStatus

Monitor agent activity across workflow stages.

```typescript
import { useAgentStatus } from '@/hooks/useWorkflows';

function AgentMonitor({ taskId }: { taskId: string }) {
  const { state } = useAgentStatus(taskId);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.error}</div>;

  const agentStatuses = state.data;

  return (
    <div>
      <h2>Agent Status</h2>
      {Object.entries(agentStatuses).map(([stage, status]) => (
        <div key={stage}>
          {stage}: {status}
        </div>
      ))}
    </div>
  );
}
```

#### useWorkflowHistory

View completed workflow history.

```typescript
import { useWorkflowHistory } from '@/hooks/useWorkflows';

function WorkflowHistory({ projectId }: { projectId: string }) {
  const { state, refetch } = useWorkflowHistory(projectId, 50);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.error}</div>;

  return (
    <div>
      <h2>Workflow History</h2>
      {state.data.map(workflow => (
        <div key={workflow.workflow_id}>
          <h3>{workflow.task_name}</h3>
          <p>Status: {workflow.status}</p>
          <p>Duration: {workflow.total_duration_seconds}s</p>
        </div>
      ))}
    </div>
  );
}
```

#### useWorkflowConfig

Get workflow configuration by name.

```typescript
import { useWorkflowConfig } from '@/hooks/useWorkflows';

function WorkflowConfigDisplay() {
  const { config, loading, error } = useWorkflowConfig('default');

  if (loading) return <div>Loading config...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>{config?.name}</h2>
      <p>{config?.description}</p>
      <ul>
        {config?.stages.map(stage => (
          <li key={stage.id}>
            {stage.name}: {stage.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Creating Custom Workflows

#### Step 1: Define Workflow Configuration

```typescript
import { WorkflowConfig, WorkflowStage } from 'shared/types';

const customWorkflow: WorkflowConfig = {
  name: "feature-development",
  description: "Complete feature development workflow",
  version: "1.0.0",

  stages: [
    {
      id: WorkflowStage.RESEARCH,
      name: "Research",
      description: "Research patterns and best practices",
      agent: {
        executor: "CLAUDE_CODE",
        variant: "PLAN",
        config: {
          CLAUDE_CODE: {
            plan: true,
            append_prompt: "Focus on architecture and design patterns."
          }
        }
      },
      required: true,
      timeout_seconds: 300
    },
    {
      id: WorkflowStage.IMPLEMENT,
      name: "Implement",
      description: "Implement the feature",
      agent: {
        executor: "CLAUDE_CODE",
        variant: "DEFAULT",
        config: {
          CLAUDE_CODE: {
            dangerously_skip_permissions: true
          }
        }
      },
      required: true,
      timeout_seconds: 600
    },
    {
      id: WorkflowStage.CI_CD,
      name: "CI/CD",
      description: "Build, test, and prepare deployment",
      agent: {
        executor: "CLAUDE_CODE",
        variant: "DEFAULT",
        config: {}
      },
      required: true,
      timeout_seconds: 300
    }
  ],

  automation: {
    auto_start_next_stage: true,
    auto_fix_on_failure: true,
    max_retries: 3,
    retry_delay_seconds: 5
  }
};
```

#### Step 2: Save Workflow Configuration

Save to `crates/server/src/workflows/custom.json`:

```json
{
  "name": "feature-development",
  "description": "Complete feature development workflow",
  "version": "1.0.0",
  "stages": [
    {
      "id": "research",
      "name": "Research",
      "description": "Research patterns and best practices",
      "agent": {
        "executor": "CLAUDE_CODE",
        "variant": "PLAN"
      },
      "required": true,
      "timeout_seconds": 300
    }
  ],
  "automation": {
    "auto_start_next_stage": true,
    "auto_fix_on_failure": true,
    "max_retries": 3
  }
}
```

#### Step 3: Start Workflow from Frontend

```typescript
const { startWorkflow } = useWorkflowProgress(taskId);

const handleStartWorkflow = async () => {
  try {
    await startWorkflow(JSON.stringify(customWorkflow));
    // Workflow started successfully
  } catch (error) {
    console.error('Failed to start workflow:', error);
  }
};
```

#### Step 4: Monitor Progress

```typescript
const { state } = useWorkflowProgress(taskId);

useEffect(() => {
  if (state.status === 'success' && state.data.status === 'in_progress') {
    // Workflow is running, poll for updates
    const interval = setInterval(() => {
      refetch();
    }, 2000);

    return () => clearInterval(interval);
  }
}, [state.status, state.data?.status]);
```

### Workflow Automation Levels

#### Level 1: Manual Stage Transitions

```typescript
const config: WorkflowConfig = {
  automation: {
    auto_start_next_stage: false,
    auto_fix_on_failure: false,
    max_retries: 0
  }
};
```

- User must start each stage manually
- No automatic error recovery
- Maximum control, minimum automation

#### Level 2: Automatic Transitions, Manual Fix

```typescript
const config: WorkflowConfig = {
  automation: {
    auto_start_next_stage: true,
    auto_fix_on_failure: false,
    max_retries: 1
  }
};
```

- Stages auto-start on completion
- User must fix errors manually
- Balance of automation and control

#### Level 3: Fully Automated (Recommended)

```typescript
const config: WorkflowConfig = {
  automation: {
    auto_start_next_stage: true,
    auto_fix_on_failure: true,
    max_retries: 3
  }
};
```

- Complete hands-off operation
- Auto-fixes errors
- Retries failed stages
- Maximum automation

### Workflow Best Practices

**DO:**
- Start with Level 2 automation for new workflows
- Set appropriate timeouts for each stage
- Define clear success criteria
- Monitor workflow progress
- Handle errors gracefully

**DON'T:**
- Skip the research stage
- Set retry limits too high (max 3)
- Mix multiple concerns in one stage
- Ignore failed stages
- Create overly long workflows

---

## MCP Server Integration

The Vibe Kanban MCP (Model Context Protocol) server provides tools for external MCP clients to manage projects and tasks.

### MCP Server Overview

**Purpose:** Enable external MCP clients (Claude Desktop, Raycast, coding agents) to interact with Vibe Kanban.

**Location:** `crates/executors/default_mcp.json`

**Architecture:**
```
┌──────────────────────┐         ┌──────────────────────┐
│  External MCP Client │         │   Vibe Kanban        │
│  - Claude Desktop    │◄───────►│   - MCP Server       │
│  - Raycast           │  JSON   │   - API Routes       │
│  - Coding Agents     │  RPC    │   - Database         │
└──────────────────────┘         └──────────────────────┘
```

### Available MCP Tools

#### Project Operations

##### list_projects

Fetch all projects.

**Parameters:** None

**Returns:**
```typescript
[
  {
    project_id: string;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
  }
]
```

**Usage:**
```
List all projects in Vibe Kanban.
```

#### Task Management

##### list_tasks

List tasks in a project.

**Parameters:**
```typescript
{
  project_id: string;    // Required
  status?: string;       // Optional: "todo", "in_progress", "done"
  limit?: number;        // Optional: default 50
}
```

**Returns:**
```typescript
[
  {
    task_id: string;
    title: string;
    description: string;
    status: string;
    project_id: string;
    created_at: string;
    updated_at: string;
  }
]
```

**Usage:**
```
List all todo tasks in project XYZ.
Show me the first 10 in-progress tasks.
```

##### create_task

Create a new task.

**Parameters:**
```typescript
{
  project_id: string;    // Required
  title: string;         // Required
  description?: string;  // Optional
}
```

**Returns:**
```typescript
{
  task_id: string;
  message: "Task created successfully";
}
```

**Usage:**
```
Create a task "Add user authentication" in project XYZ.
Create a task titled "Fix login bug" with description "Users can't log in on Safari".
```

##### get_task

Get task details.

**Parameters:**
```typescript
{
  task_id: string;       // Required
}
```

**Returns:**
```typescript
{
  task_id: string;
  title: string;
  description: string;
  status: string;
  project_id: string;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
  attempts: Array<...>;
}
```

**Usage:**
```
Get details for task ABC123.
Show me information about task XYZ.
```

##### update_task

Update task details.

**Parameters:**
```typescript
{
  task_id: string;           // Required
  title?: string;            // Optional
  description?: string;      // Optional
  status?: string;           // Optional: "todo", "in_progress", "done"
}
```

**Returns:**
```typescript
{
  task_id: string;
  message: "Task updated successfully";
}
```

**Usage:**
```
Update task ABC123 status to in_progress.
Change the title of task XYZ to "New title".
```

##### delete_task

Delete a task.

**Parameters:**
```typescript
{
  task_id: string;       // Required
}
```

**Returns:**
```typescript
{
  message: "Task deleted successfully";
}
```

**Usage:**
```
Delete task ABC123.
Remove task XYZ from the board.
```

#### Task Execution

##### start_task_attempt

Start working on a task with a coding agent.

**Parameters:**
```typescript
{
  task_id: string;           // Required
  executor: string;          // Required
  base_branch: string;       // Required
  variant?: string;          // Optional
}
```

**Returns:**
```typescript
{
  attempt_id: string;
  message: "Task attempt started";
  branch_name: string;
}
```

**Usage:**
```
Start working on task ABC123 using Claude Code on main branch.
Create a task attempt for task XYZ with Gemini on the develop branch.
```

**Supported Executors:**
- `claude-code` / `CLAUDE_CODE`
- `amp` / `AMP`
- `gemini` / `GEMINI`
- `codex` / `CODEX`
- `opencode` / `OPENCODE`
- `cursor_agent` / `CURSOR_AGENT`
- `qwen-code` / `QWEN_CODE`
- `copilot` / `COPILOT`
- `droid` / `DROID`

### MCP Server Configuration

#### Option 1: Web Interface (Vibe Kanban)

1. Navigate to **Settings → MCP Servers**
2. Click on **Vibe Kanban** in "Popular servers"
3. Click **Save Settings**

#### Option 2: Manual Configuration

Add to your agent's MCP configuration:

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

#### Claude Desktop Example

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

**Location:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

#### Raycast Example

1. Open Raycast Preferences
2. Navigate to **Extensions → MCP**
3. Click **+** to add new server
4. Configure:
   - Name: `vibe_kanban`
   - Command: `npx`
   - Args: `-y vibe-kanban@latest --mcp`

### MCP Server Configuration File

**Location:** `crates/executors/default_mcp.json`

```json
{
  "vibe_kanban": {
    "command": "npx",
    "args": ["-y", "vibe-kanban@latest", "--mcp"]
  },
  "meta": {
    "vibe_kanban": {
      "name": "Vibe Kanban",
      "description": "Create, update and delete Vibe Kanban tasks",
      "url": "https://www.vibekanban.com/docs/integrations/vibe-kanban-mcp-server",
      "icon": "favicon-vk-light.svg"
    }
  }
}
```

### MCP Use Cases

#### Use Case 1: Task Planning from Claude Desktop

```
I need to build a user authentication system with:
- User registration with email validation
- Login/logout functionality
- Password reset capability
- Session management
- Protected routes

Turn this plan into Vibe Kanban tasks.
```

Claude Desktop will:
1. Use `list_projects` to find your project
2. Use `create_task` for each feature
3. Create structured tasks in Vibe Kanban

#### Use Case 2: Start Task Execution

```
Start working on the user registration task using Claude Code on the main branch.
```

Claude Desktop will:
1. Use `get_task` to find the task
2. Use `start_task_attempt` with executor="claude-code"
3. Create feature branch and start agent

#### Use Case 3: Task Management Workflow

```
1. List all projects to find the project ID
2. List todo tasks in the project
3. Create a new task for "Add user profile page"
4. Start a task attempt for the new task using Amp on the develop branch
```

Each step uses the appropriate MCP tool.

#### Use Case 4: Internal Coding Agent Integration

A powerful workflow involves using coding agents within Vibe Kanban that are also connected to the Vibe Kanban MCP server:

1. **Create a Planning Task** with a custom agent profile configured with a planning prompt
2. **Explore and Plan** - The coding agent explores the codebase and develops a comprehensive plan
3. **Generate Tasks** - Ask the coding agent to "create a series of individual tasks for this plan"
4. **Automatic Population** - The agent uses the MCP server to populate individual tasks directly in Vibe Kanban

This creates a seamless workflow where high-level planning automatically generates actionable tasks.

### MCP Server Troubleshooting

**Problem: MCP server not starting**

```bash
# Verify NPX package
npx vibe-kanban@latest --mcp

# Check configuration
cat crates/executors/default_mcp.json
```

**Problem: MCP tools not available**

- Verify MCP server is running
- Check client configuration
- Restart MCP client

**Problem: Authentication errors**

- Verify Vibe Kanban is running
- Check API endpoint configuration
- Ensure proper credentials

**Problem: Tools timing out**

- Increase timeout in client configuration
- Check Vibe Kanban server performance
- Verify network connectivity

---

## Agent Profiles

Agent profiles define configuration variants for coding agents, enabling consistent behavior across different task types.

### Profile System Overview

**Purpose:** Define multiple named variants for each supported coding agent with different settings for planning, models, and sandbox permissions.

**Location:** Settings → Agents → Agent Profiles

**Configuration File:** `profiles.json` (displayed in settings)

### Profile Structure

```json
{
  "executors": {
    "CLAUDE_CODE": {
      "DEFAULT": {
        "CLAUDE_CODE": {
          "dangerously_skip_permissions": true
        }
      },
      "PLAN": {
        "CLAUDE_CODE": {
          "plan": true,
          "append_prompt": "Focus on architecture and design patterns."
        }
      },
      "ROUTER": {
        "CLAUDE_CODE": {
          "claude_code_router": true,
          "dangerously_skip_permissions": true
        }
      }
    },
    "GEMINI": {
      "DEFAULT": {
        "GEMINI": {
          "model": "default",
          "yolo": true
        }
      },
      "FLASH": {
        "GEMINI": {
          "model": "flash",
          "yolo": true
        }
      }
    }
  }
}
```

### Structure Rules

- **Variant names**: Case-insensitive, normalized to SCREAMING_SNAKE_CASE
- **DEFAULT variant**: Reserved and always present for each agent
- **Custom variants**: Add as needed (e.g., `PLAN`, `FLASH`, `HIGH`)
- **Built-in protection**: Cannot remove built-in executors, but can override values

### Configuration Access

<Tabs>
<Tab title="Form Editor">
Use the guided interface with form fields for each agent setting.

Navigate to **Settings → Agents → Agent Profiles** and use the form editor to configure variants.
</Tab>

<Tab title="JSON Editor">
Edit the underlying `profiles.json` file directly for advanced configurations.

The JSON editor shows the exact file path where settings are stored. Vibe Kanban saves only your overrides whilst preserving built-in defaults.
</Tab>
</Tabs>

### Agent Configuration Options

#### CLAUDE_CODE

| Parameter | Type | Description |
|-----------|------|-------------|
| `plan` | boolean | Enable planning mode for complex tasks |
| `claude_code_router` | boolean | Route requests across multiple Claude Code instances |
| `dangerously_skip_permissions` | boolean | Skip permission prompts (use with caution) |
| `append_prompt` | string \| null | Text appended to system prompt |
| `base_command_override` | string \| null | Override underlying CLI command |
| `additional_params` | string[] \| null | Additional CLI arguments |

**Documentation:** [Claude Code CLI Reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference#cli-flags)

**Example Profiles:**
```json
{
  "CLAUDE_CODE": {
    "DEFAULT": {
      "CLAUDE_CODE": {
        "dangerously_skip_permissions": true
      }
    },
    "PLAN": {
      "CLAUDE_CODE": {
        "plan": true,
        "append_prompt": "Focus on architecture and design patterns.\nConsider scalability and maintainability."
      }
    },
    "SAFE": {
      "CLAUDE_CODE": {
        "dangerously_skip_permissions": false
      }
    }
  }
}
```

#### GEMINI

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | Choose model: `"default"` or `"flash"` |
| `yolo` | boolean | Run without confirmations |
| `append_prompt` | string \| null | Text appended to system prompt |
| `base_command_override` | string \| null | Override underlying CLI command |
| `additional_params` | string[] \| null | Additional CLI arguments |

**Documentation:** [Gemini CLI Reference](https://google-gemini.github.io/gemini-cli/)

**Example Profiles:**
```json
{
  "GEMINI": {
    "DEFAULT": {
      "GEMINI": {
        "model": "default",
        "yolo": true
      }
    },
    "FLASH": {
      "GEMINI": {
        "model": "flash",
        "yolo": true
      }
    },
    "INTERACTIVE": {
      "GEMINI": {
        "model": "default",
        "yolo": false
      }
    }
  }
}
```

#### AMP

| Parameter | Type | Description |
|-----------|------|-------------|
| `dangerously_allow_all` | boolean | Allow all actions without restrictions (unsafe) |
| `append_prompt` | string \| null | Text appended to system prompt |
| `base_command_override` | string \| null | Override underlying CLI command |
| `additional_params` | string[] \| null | Additional CLI arguments |

**Documentation:** [AMP Documentation](https://ampcode.com/manual#cli)

**Example Profiles:**
```json
{
  "AMP": {
    "DEFAULT": {
      "AMP": {
        "dangerously_allow_all": true
      }
    },
    "SAFE": {
      "AMP": {
        "dangerously_allow_all": false
      }
    }
  }
}
```

#### CODEX

| Parameter | Type | Description |
|-----------|------|-------------|
| `sandbox` | string | Execution: `"read-only"`, `"workspace-write"`, `"danger-full-access"` |
| `approval` | string | Approval: `"untrusted"`, `"on-failure"`, `"on-request"`, `"never"` |
| `model_reasoning_effort` | string | Reasoning: `"low"`, `"medium"`, `"high"` |
| `model_reasoning_summary` | string | Summary: `"auto"`, `"concise"`, `"detailed"`, `"none"` |
| `append_prompt` | string \| null | Text appended to system prompt |
| `base_command_override` | string \| null | Override underlying CLI command |
| `additional_params` | string[] \| null | Additional CLI arguments |

**Documentation:** [Codex Documentation](https://github.com/openai/codex)

**Example Profiles:**
```json
{
  "CODEX": {
    "DEFAULT": {
      "CODEX": {
        "sandbox": "danger-full-access",
        "approval": "on-request"
      }
    },
    "HIGH_REASONING": {
      "CODEX": {
        "sandbox": "danger-full-access",
        "model_reasoning_effort": "high",
        "model_reasoning_summary": "detailed"
      }
    },
    "FAST": {
      "CODEX": {
        "sandbox": "danger-full-access",
        "model_reasoning_effort": "low",
        "model_reasoning_summary": "concise",
        "approval": "on-failure"
      }
    }
  }
}
```

#### CURSOR

| Parameter | Type | Description |
|-----------|------|-------------|
| `force` | boolean | Force execution without confirmation |
| `model` | string | Specify model to use |
| `append_prompt` | string \| null | Text appended to system prompt |
| `base_command_override` | string \| null | Override underlying CLI command |
| `additional_params` | string[] \| null | Additional CLI arguments |

**Documentation:** [Cursor CLI Reference](https://docs.cursor.com/en/cli/reference/parameters)

**Example Profiles:**
```json
{
  "CURSOR": {
    "DEFAULT": {
      "CURSOR": {
        "force": false
      }
    },
    "AUTO": {
      "CURSOR": {
        "force": true
      }
    }
  }
}
```

#### OPENCODE

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | Specify model to use |
| `agent` | string | Choose agent type |
| `append_prompt` | string \| null | Text appended to system prompt |
| `base_command_override` | string \| null | Override underlying CLI command |
| `additional_params` | string[] \| null | Additional CLI arguments |

**Documentation:** [OpenCode Documentation](https://opencode.ai/docs/cli/#flags-1)

**Example Profiles:**
```json
{
  "OPENCODE": {
    "DEFAULT": {
      "OPENCODE": {
        "model": "gpt-4",
        "agent": "default"
      }
    }
  }
}
```

#### QWEN_CODE

| Parameter | Type | Description |
|-----------|------|-------------|
| `yolo` | boolean | Run without confirmations |
| `append_prompt` | string \| null | Text appended to system prompt |
| `base_command_override` | string \| null | Override underlying CLI command |
| `additional_params` | string[] \| null | Additional CLI arguments |

**Documentation:** [Qwen Code Documentation](https://qwenlm.github.io/qwen-code-docs/en/cli/index)

**Example Profiles:**
```json
{
  "QWEN_CODE": {
    "DEFAULT": {
      "QWEN_CODE": {
        "yolo": false
      }
    },
    "AUTO": {
      "QWEN_CODE": {
        "yolo": true
      }
    }
  }
}
```

#### DROID

| Parameter | Type | Description |
|-----------|------|-------------|
| `autonomy` | string | Level: `"normal"`, `"low"`, `"medium"`, `"high"`, `"skip-permissions-unsafe"` |
| `model` | string | Specify which model to use |
| `reasoning_effort` | string | Level: `"off"`, `"low"`, `"medium"`, `"high"` |
| `append_prompt` | string \| null | Text appended to system prompt |
| `base_command_override` | string \| null | Override underlying CLI command |
| `additional_params` | string[] \| null | Additional CLI arguments |

**Documentation:** [Droid Documentation](https://docs.factory.ai/factory-cli/getting-started/overview)

**Example Profiles:**
```json
{
  "DROID": {
    "DEFAULT": {
      "DROID": {
        "autonomy": "normal",
        "reasoning_effort": "medium"
      }
    },
    "HIGH_AUTONOMY": {
      "DROID": {
        "autonomy": "high",
        "reasoning_effort": "high"
      }
    },
    "FULL_AUTO": {
      "DROID": {
        "autonomy": "skip-permissions-unsafe",
        "reasoning_effort": "high"
      }
    }
  }
}
```

### Universal Options

These options work across multiple agent types:

| Option | Type | Description |
|--------|------|-------------|
| `append_prompt` | string \| null | Text appended to the system prompt |
| `base_command_override` | string \| null | Override the underlying CLI command |
| `additional_params` | string[] \| null | Additional CLI arguments to pass |

<Warning>
Options prefixed with "dangerously_" bypass safety confirmations and can perform destructive actions. Use with extreme caution.
</Warning>

### Using Agent Profiles

#### Default Configuration

Set your default agent and variant in **Settings → General → Default Agent Configuration** for consistent behavior across all attempts.

#### Per-Attempt Selection

Override defaults when creating attempts by selecting different agent/variant combinations in the attempt dialog.

### Frontend Integration

#### useProfiles Hook

Load and save agent profiles from the frontend:

```typescript
import { useProfiles } from '@/hooks/useProfiles';

function AgentProfileManager() {
  const {
    profilesContent,      // Raw JSON content
    parsedProfiles,       // Parsed JavaScript object
    profilesPath,         // File path
    isLoading,
    isError,
    isSaving,
    refetch,
    save,                // Save raw JSON
    saveParsed           // Save object as JSON
  } = useProfiles();

  const handleSave = async () => {
    try {
      await saveParsed({
        executors: {
          CLAUDE_CODE: {
            DEFAULT: {
              CLAUDE_CODE: {
                dangerously_skip_permissions: true
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Failed to save profiles:', error);
    }
  };

  return (
    <div>
      <h2>Agent Profiles</h2>
      <p>Path: {profilesPath}</p>

      {isLoading && <p>Loading...</p>}
      {isError && <p>Error loading profiles</p>}

      {parsedProfiles && (
        <pre>{JSON.stringify(parsedProfiles, null, 2)}</pre>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? 'Saving...' : 'Save Profiles'}
      </button>
    </div>
  );
}
```

### Profile Best Practices

**DO:**
- Create variants for specific use cases (planning, implementation, review)
- Use descriptive variant names (PLAN, SAFE, HIGH_AUTONOMY)
- Document why each variant exists
- Test new variants before using in production
- Keep DEFAULT variant simple and safe

**DON'T:**
- Create too many variants (3-5 per agent is good)
- Use dangerously_ options unless absolutely necessary
- Override base commands unless required
- Create variants with unclear purposes
- Forget to document variant intentions

---

## Advanced Configuration

### Custom MCP Servers

Vibe Kanban supports connecting to additional MCP servers beyond the built-in Vibe Kanban server.

#### Popular MCP Servers

**Context7** - Fetch up-to-date documentation and code examples

```json
{
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp",
    "headers": {
      "CONTEXT7_API_KEY": "YOUR_API_KEY"
    }
  }
}
```

**Playwright** - Browser automation with Playwright

```json
{
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@latest"]
  }
}
```

**Exa** - AI-powered web search and retrieval

```json
{
  "exa": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-exa"],
    "env": {
      "EXA_API_KEY": "YOUR_EXA_API_KEY"
    }
  }
}
```

**Grep** - Search code and files using ripgrep

```json
{
  "grep": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-grep"]
  }
}
```

#### Configuring MCP Servers

<Steps>
<Step title="Navigate to MCP Servers Settings">
  Go to **Settings → MCP Servers**
</Step>

<Step title="Add Custom Server">
  Click **Add Server** and enter configuration
</Step>

<Step title="Or Edit Directly">
  Click **Edit JSON** to modify `crates/executors/default_mcp.json`
</Step>

<Step title="Save and Restart">
  Save settings and restart Vibe Kanban
</Step>
</Steps>

### Custom Hooks

Create custom hooks for specific project needs.

#### Example: Pre-Task Security Scan

Create `.claude/hooks/security-scan.md`:

```markdown
# Security Scan Hook

**Purpose**: Scan for security vulnerabilities before task execution

---

## Step 1: Dependency Vulnerability Scan

```bash
echo "=== Frontend Dependencies ==="
cd frontend && npm audit --production

echo ""
echo "=== Rust Dependencies ==="
cargo audit
```

## Step 2: Secrets Detection

```bash
echo "=== Scanning for Secrets ==="
git diff --staged --name-only | while read file; do
  if grep -qiE "(password|secret|api_key|token).*=.*['\"]" "$file" 2>/dev/null; then
    echo "⚠️  Potential secret in: $file"
  fi
done
```

## Step 3: Permission Check

```bash
echo "=== File Permissions ==="
find . -type f -perm -o+w -not -path "*/node_modules/*" -not -path "*/.git/*"
```

## Summary

Report any security concerns found.
```

#### Register Custom Hook

Custom hooks are automatically discovered by Claude Code when placed in `.claude/hooks/`.

### Custom Commands

#### Example: Deploy Command

Create `.claude/commands/deploy.md`:

```markdown
---
name: deploy
description: Build, test, and deploy to production
---

# Deploy Command

Deploy the application to production.

## Step 1: Pre-Deployment Checks

```bash
# Run all tests
cargo test --workspace

# Type checking
npm run check

# Linting
npm run lint
```

## Step 2: Build Application

```bash
# Build NPX package
pnpm run build:npx

# Verify build
ls -la npx-cli/dist/
```

## Step 3: Deploy

```bash
# Deploy to production
# (Add your deployment commands here)

echo "✅ Deployment complete!"
```

## Progress Tracking

Log deployment progress at each step.
```

Use with `/deploy`.

---

## Troubleshooting

### Workflow Issues

**Problem: Workflow stuck in a stage**

<Steps>
<Step title="Check Agent Status">
  ```typescript
  const { state } = useAgentStatus(taskId);
  console.log(state.data);  // Check agent status for each stage
  ```
</Step>

<Step title="Review Error Message">
  ```typescript
  const { state } = useWorkflowProgress(taskId);
  console.log(state.data.error_message);  // See why it failed
  ```
</Step>

<Step title="Retry Stage">
  ```typescript
  const { startStage } = useWorkflowProgress(taskId);
  await startStage(WorkflowStage.IMPLEMENT);  // Retry failed stage
  ```
</Step>
</Steps>

**Problem: Workflow not progressing**

- Check automation settings in workflow config
- Verify agent profiles are configured correctly
- Check MCP server connectivity
- Review error logs in Vibe Kanban console

### Type System Issues

**Problem: Type errors after Rust changes**

```bash
# Regenerate types
pnpm run generate-types

# Commit generated types
git add shared/types.ts
git commit -m "chore: regenerate types from Rust changes"
```

**Problem: Type generation fails**

```bash
# Check Rust compilation
cargo check

# Verify TS derive attributes
grep -r "#\[derive(TS)\]" crates/server/src/

# Run with debug output
cargo run --bin generate_types -- --debug
```

### Database Issues

**Problem: SQLx errors**

```bash
# Local SQLite
pnpm run prepare-db

# Remote PostgreSQL
pnpm run remote:prepare-db

# Verify SQLx metadata
ls -la .sqlx/
```

**Problem: Migration errors**

```bash
# Check migration status
cargo sqlx database info

# Run migrations manually
cargo sqlx database run --source-url migrations/
```

### MCP Server Issues

**Problem: MCP server not responding**

```bash
# Test NPX package
npx vibe-kanban@latest --mcp

# Check configuration
cat crates/executors/default_mcp.json

# Verify Vibe Kanban is running
curl http://localhost:BACKEND_PORT/health
```

**Problem: MCP tools not available**

- Restart MCP client (Claude Desktop, Raycast)
- Verify MCP server configuration
- Check network connectivity
- Review Vibe Kanban logs

### Quality Check Issues

**Problem: Tests failing**

```bash
# Rust tests
cargo test --workspace -- --nocapture

# Frontend tests (if configured)
cd frontend && npm test

# Run specific test
cargo test --package db -- test_name
```

**Problem: Lint errors**

```bash
# Run /fix command
/fix

# Or manually fix
cd frontend && npm run lint -- --fix
cargo clippy --workspace --fix
```

**Problem: Format issues**

```bash
# Auto-format all code
pnpm run format

# Verify formatting
cargo fmt -- --check
cd frontend && npm run format:check
```

---

## FAQ

### General Questions

**Q: What is Vibe-Kanban integration?**

A: The Vibe-Kanban integration provides a comprehensive workflow automation system for orchestrating AI coding agents through multi-stage development processes, combining skills, hooks, commands, workflows, and MCP servers.

**Q: Do I need to use all components?**

A: No. You can use individual components (skills, hooks, commands) independently. However, using them together provides the best experience.

**Q: Can I create custom skills?**

A: Yes. Create a new directory in `.claude/skills/your-skill/` and add a `SKILL.md` file with your instructions.

**Q: What's the difference between skills and commands?**

A: Skills are specialized agent behaviors (research, implement, cicd), while commands are executable workflows that combine multiple operations (fix, commit, update-app).

### Workflow Questions

**Q: How do I start a workflow?**

A: Create a task and invoke `/workflow-orchestrator`, or use the frontend hooks: `useWorkflowProgress(taskId)`.

**Q: Can I customize workflow stages?**

A: Yes. Define a custom `WorkflowConfig` and use `startWorkflow(config)` to start it.

**Q: What happens when a workflow fails?**

A: Depending on automation settings, it will retry (up to `max_retries`), auto-fix issues (if `auto_fix_on_failure: true`), or pause for manual intervention.

**Q: How do I monitor workflow progress?**

A: Use the `useWorkflowProgress(taskId)` hook, which provides real-time updates and automatic polling for active workflows.

### MCP Questions

**Q: What MCP servers are supported?**

A: Any MCP server. Vibe Kanban includes built-in support for context7, playwright, exa, grep, and the Vibe Kanban MCP server.

**Q: How do I connect Claude Desktop to Vibe Kanban?**

A: Add the Vibe Kanban MCP server to Claude Desktop's configuration (see MCP Server Configuration section).

**Q: Can I use MCP tools from within Vibe Kanban?**

A: Yes. Configure MCP servers in Settings → MCP Servers, and they'll be available to coding agents running within Vibe Kanban.

### Agent Profile Questions

**Q: What are agent profiles?**

A: Agent profiles define configuration variants for coding agents (e.g., DEFAULT, PLAN, HIGH_AUTONOMY), enabling consistent behavior across different task types.

**Q: How many variants can I create?**

A: As many as you need, but 3-5 per agent is a good range. Avoid creating too many variants.

**Q: Can I use profiles with MCP tools?**

A: Yes. Agent profiles work alongside MCP servers. Configure both in Settings.

**Q: What's the DEFAULT variant?**

A: DEFAULT is a reserved variant name that's always present for each agent. Use it for your standard configuration.

### Quality Questions

**Q: What quality checks are run?**

A: Type checking (TypeScript + Rust), linting (ESLint + Clippy), formatting (Prettier + rustfmt), and tests (cargo test).

**Q: How do I fix quality issues?**

A: Run `/fix` to automatically fix all issues, or manually fix and re-run checks.

**Q: Do I need to pass all checks before committing?**

A: Yes. Vibe Kanban enforces zero tolerance for quality issues. Use `/fix` before `/commit`.

**Q: What if tests fail?**

A: The workflow will pause if tests fail and automation is disabled. If automation is enabled, it will retry up to `max_retries` times.

### Integration Questions

**Q: Can I use Vibe-Kanban integration with other project management tools?**

A: Vibe Kanban is the project management tool. The integration automates development workflows within Vibe Kanban.

**Q: Does this work with remote deployment?**

A: Yes. Vibe Kanban supports local and remote deployment. The `/cicd` skill handles both.

**Q: Can I extend the integration?**

A: Yes. Create custom skills, hooks, commands, and workflows. The system is designed to be extensible.

---

## Best Practices Summary

### Development Workflow

1. **Use `/workflow-orchestrator` for complex features**
   - Automates the entire lifecycle
   - Ensures quality at each stage
   - Reduces manual intervention

2. **Run `/fix` immediately after implementation**
   - Catch issues early
   - Maintain code quality
   - Prevent technical debt

3. **Let hooks provide visibility without blocking**
   - Pre-task hooks inform without gating
   - Post-task hooks report without preventing completion
   - Use data to make informed decisions

4. **Use agent profiles for consistent configuration**
   - Define variants for different use cases
   - Maintain consistency across attempts
   - Share profiles with team

### Quality Assurance

1. **Never commit without running `/fix` first**
   - Zero tolerance policy
   - All checks must pass
   - Auto-fix when possible

2. **Use type generation after Rust changes**
   - Run `pnpm run generate-types`
   - Commit `shared/types.ts`
   - Never edit manually

3. **Prepare database before development**
   - Run `pnpm run prepare-db` (local)
   - Run `pnpm run remote:prepare-db` (remote)
   - Keep SQLx metadata current

4. **Run tests before committing**
   - `cargo test --workspace`
   - Test business logic changes
   - Maintain test coverage

### MCP Integration

1. **Configure Vibe Kanban MCP server in agent profiles**
   - Enables task management from external clients
   - Creates seamless workflows
   - Supports automation

2. **Use MCP tools for task management**
   - Create tasks from Claude Desktop
   - Start attempts from Raycast
   - Integrate with other tools

3. **Leverage additional MCP servers**
   - Context7 for documentation
   - Playwright for browser automation
   - Exa for web search
   - Grep for code search

### Workflow Configuration

1. **Define clear stage requirements**
   - Document success criteria
   - Set appropriate timeouts
   - Handle errors gracefully

2. **Set appropriate retry limits**
   - Use max_retries: 3 (default)
   - Balance persistence and efficiency
   - Manual intervention for critical failures

3. **Use auto-fix for non-critical issues**
   - Enable `auto_fix_on_failure`
   - Automatic quality maintenance
   - Faster workflows

4. **Monitor workflow progress**
   - Use `useWorkflowProgress` hook
   - Track agent status
   - Review history for insights

---

## Resources

### Documentation

- [CLAUDE.md](/CLAUDE.md) - Project instructions and Vibe-Kanban integration overview
- [Vibe Kanban MCP Server](/docs/integrations/vibe-kanban-mcp-server.mdx) - MCP server configuration
- [Agent Configurations](/docs/configuration-customisation/agent-configurations.mdx) - Agent profiles
- [MCP Server Configuration](/docs/integrations/mcp-server-configuration.mdx) - MCP server setup

### External Resources

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Gemini CLI Documentation](https://google-gemini.github.io/gemini-cli/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [shadcn/ui Components](https://ui.shadcn.com/)

### Support

- Vibe Kanban Documentation: https://www.vibekanban.com/docs
- GitHub Issues: https://github.com/your-org/vibe-kanban/issues
- Community: [Link to community forum]

---

**Last Updated:** 2025-01-15

**Version:** 1.0.0

**Contributors:** Vibe Kanban Team
