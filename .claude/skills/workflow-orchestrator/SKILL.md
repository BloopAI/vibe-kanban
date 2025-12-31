---
name: workflow-orchestrator
description: Orchestrate complete Research → Implement → CI/CD workflow
---

# Complete Workflow Orchestrator

You are the workflow orchestrator. Your goal is to coordinate all phases of development automatically for the Vibe Kanban project.

## Phase 1: Research

1. Invoke `/research` skill
2. Monitor research progress
3. Review research brief
4. **NO APPROVAL NEEDED** - Automatically proceed to Phase 2
5. Log research brief for visibility

### Research Activities:
- Search local codebase using Grep MCP
- Research external patterns using WebSearch
- Find best practices for Rust/TypeScript/React
- Identify Vibe Kanban specific patterns
- Generate implementation plan

### Error Handling:
- If research fails completely: Pause and report
- If partial research: Log warning, continue with available data
- Retry once on transient failures

### Progress Log:
```
🔍 Phase 1: Research
   - Grep MCP: Searching codebase...
   - WebSearch: Researching best practices...
   - Analyzing patterns...
```

## Phase 2: Implementation

1. Invoke `/implement` skill
2. Monitor implementation progress
3. Track files created/modified
4. Auto-invoke `/fix` when implementation done
5. Verify all tests pass

### Implementation Activities:
- Create/modify files following Vibe Kanban structure
- Write code following project conventions
- Add tests (Rust `#[cfg(test)]`, TypeScript `__tests__/`)
- Generate types if Rust changed (`pnpm run generate-types`)
- Auto-fix issues via `/fix`

### Vibe Kanban Specific Checks:
- File naming conventions (PascalCase.tsx, kebab-case.tsx, snake_case.rs)
- Proper type usage (from `shared/types.ts`)
- Correct crate organization (`crates/server/`, `crates/db/`, etc.)
- shadcn/ui component patterns
- SQLx database patterns

### Error Handling:
- If /fix finds issues: Let it auto-resolve
- If tests fail: Retry up to 3 times
- If type errors persist: Pause and report
- If implementation conflicts: Pause and report
- If types out of sync: Run `pnpm run generate-types`

### Progress Log:
```
⚙️  Phase 2: Implementation
   - Creating files...
   - Writing code...
   - Adding tests...
   - Invoking /fix...
```

## Phase 3: CI/CD

1. Invoke `/cicd` skill
2. Validate pipeline configuration
3. Run comprehensive tests
4. Verify NPX build
5. Check for security issues
6. Prepare for deployment

### CI/CD Activities:
- Run all quality checks (`npm run check`, `npm run lint`)
- Run Rust tests (`cargo test --workspace`)
- Validate type generation (`pnpm run generate-types:check`)
- Validate database prep (`pnpm run prepare-db:check`)
- Build NPX package (`pnpm run build:npx`)
- Check security (`npm audit`, `cargo audit`)
- Update documentation (CLAUDE.md, README.md)

### Error Handling:
- If tests fail: Run again, if still fails, pause
- If NPX build fails: Fix and retry
- If security issues: Update dependencies
- If types out of sync: Generate types
- If database not prepared: Run prepare-db

### Progress Log:
```
🧪 Phase 3: CI/CD
   - Running tests...
   - Validating builds...
   - Checking security...
   - Preparing deployment...
```

## Phase 4: Finalization

1. Invoke `/commit` skill
2. Generate smart commit message
3. Commit all changes
4. Push to repository
5. Create pull request if needed
6. Update documentation

### Finalization Activities:
- Final quality checks
- Generate commit message (verb-led, specific)
- Commit all changes including generated types
- Push to main/feature branch
- Optionally create PR
- Log completion summary

### Progress Log:
```
✨ Phase 4: Finalization
   - Running final checks...
   - Generating commit message...
   - Committing changes...
   - Pushing to repository...
```

## Automation Mode (FULLY AUTOMATED)

- No user approval required at any phase
- Auto-proceed from research to implementation
- Auto-fix issues without asking
- Auto-commit and push changes
- Only pause on critical failures

### Critical Failures (Pause):
- Implementation conflicts with existing code
- Fundamental design issues
- Security vulnerabilities that can't be auto-fixed
- Test failures after 3 retries
- MCP servers completely unavailable
- NPX build failures that can't be resolved

### Non-Critical (Continue):
- Partial research results
- Auto-fixable lint/type errors
- Test failures that can be fixed
- Dependency updates needed

## Progress Tracking

Log comprehensive progress at each phase:

```markdown
# Vibe Kanban Workflow Orchestrator

## Phase 1: Research 🔍
- Grep MCP: Found X patterns
- WebSearch: Researched Y topics
- Brief: Generated
- Status: ✅ Complete

## Phase 2: Implementation ⚙️
- Files created: X
- Files modified: Y
- Tests written: Z
- /fix run: 0 errors
- Status: ✅ Complete

## Phase 3: CI/CD 🧪
- Tests: All passing
- NPX build: Success
- Security: No issues
- Documentation: Updated
- Status: ✅ Complete

## Phase 4: Finalization ✨
- Commit message: [message]
- Branch: [branch]
- Push: Success
- Status: ✅ Complete

## Summary
- Total files changed: X
- Lines added: Y
- Lines removed: Z
- Tests added: N
- Duration: [time]
```

## Error Recovery

### Transient Failures (Retry)
- Network timeouts
- MCP server temporary unavailability
- Test flakiness

Retry up to 3 times with exponential backoff.

### Auto-Fixable Issues (Auto-Resolve)
- Type errors (use /fix)
- Lint warnings (use /fix)
- Format issues (use /fix)
- Dependency conflicts (update dependencies)
- Types out of sync (run generate-types)

### Critical Failures (Pause and Report)
- Implementation conflicts with existing code
- Fundamental design issues
- Security vulnerabilities that can't be auto-fixed
- Test failures after 3 retries
- MCP servers completely unavailable
- NPX build failures

When paused, provide:
- Clear error description
- Phase where error occurred
- Steps already taken
- Recommended resolution
- Option to continue or abort

## Caching

Cache research results to avoid re-search:
- Research brief saved for session
- Implementation patterns cached
- Test results cached

## Logging

Comprehensive logging throughout:
- Every phase start/end
- Every skill invocation
- All errors and resolutions
- Vibe Kanban specific operations (type generation, database prep, NPX build)
- Final summary

## Vibe Kanban Specific Considerations

**Type Generation:**
- Always check if Rust types changed
- Run `pnpm run generate-types` after Rust changes
- Include `shared/types.ts` in commit
- Never edit `shared/types.ts` manually

**Database:**
- Check SQLx offline mode is prepared
- Run `pnpm run prepare-db` if needed
- Include `.sqlx/` in commit if updated

**NPX Package:**
- Build NPX package for any CLI changes
- Test locally before committing
- Include `npx-cli/dist/` in commit

**Project Structure:**
- Follow Rust crate structure (`crates/`)
- Follow frontend structure (`frontend/src/`)
- Use correct file naming conventions
- Maintain barrel exports

**Quality Standards:**
- Zero type errors (TypeScript + Rust)
- Zero lint warnings (ESLint + Clippy)
- All tests passing
- Code formatted (rustfmt + Prettier)

## Final Summary

After completion, provide:

```markdown
# Vibe Kanban Workflow Complete ✅

## Research
- Grep MCP: X patterns found
- WebSearch: Y topics researched
- Brief: [summary]

## Implementation
- Files created: [list]
- Files modified: [list]
- Tests written: [count]
- Type errors: 0
- Lint warnings: 0
- Types generated: Yes/No

## CI/CD
- Rust tests: Passing
- TypeScript checks: Passing
- NPX build: Success
- Security: No issues
- Documentation: Updated

## Commit
- Message: [commit message]
- Branch: [branch name]
- Push: Success
- Files changed: X
- Lines added: Y
- Lines removed: Z

## Summary
- Total time: [duration]
- Skills invoked: 4 (research, implement, cicd, commit)
- Quality: All checks passed ✅
```

## Quick Reference: Vibe Kanban Commands

```bash
# Development
pnpm run dev                          # Start frontend + backend

# Quality Checks
npm run check                         # TypeScript + Rust type checking
npm run lint                          # ESLint + Clippy
cargo fmt -- --check                  # Rust formatting

# Type Generation
pnpm run generate-types               # Generate TypeScript from Rust
pnpm run generate-types:check         # Check if types are up to date

# Database
pnpm run prepare-db                   # Prepare SQLx (SQLite)
pnpm run prepare-db:check             # Check SQLx preparation
pnpm run remote:prepare-db            # Prepare SQLx (PostgreSQL)

# Build
pnpm run build:npx                    # Build NPX package
npm run test:npm                      # Test NPX package

# Testing
cargo test --workspace                # Run all Rust tests
```
