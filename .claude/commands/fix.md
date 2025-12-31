---
name: fix
description: Run typechecking and linting, then spawn parallel agents to fix all issues
---

# Project Code Quality Check

This command runs all linting and typechecking tools for this hybrid Rust + TypeScript/React project, collects errors, groups them by domain, and spawns parallel agents to fix them.

## Step 1: Run Linting and Typechecking

Run all quality checks for the project:

```bash
# Frontend type checking (TypeScript)
cd frontend && npm run check

# Frontend linting (ESLint)
cd frontend && npm run lint

# Frontend formatting check (Prettier)
cd frontend && npm run format:check

# Backend linting (Rust Clippy)
cargo clippy --workspace --all-targets --all-features -- -D warnings

# Backend formatting check (Rust rustfmt)
cargo fmt -- --check
```

## Step 2: Collect and Parse Errors

Parse the output from the linting and typechecking commands. Group errors by domain:

- **Frontend Type Errors**: TypeScript compiler errors from `tsc --noEmit`
- **Frontend Lint Errors**: ESLint errors including unused imports, type safety, and code quality issues
- **Frontend Format Errors**: Prettier formatting violations
- **Backend Lint Errors**: Rust Clippy warnings and errors
- **Backend Format Errors**: Rust formatting violations

Create a detailed list of all files with issues and the specific problems in each file.

## Step 3: Spawn Parallel Agents

For each domain that has issues, spawn an agent in parallel using the Task tool. **IMPORTANT**: Use a SINGLE response with MULTIPLE Task tool calls to run agents in parallel.

### Agents to spawn:

1. **Frontend Type Fixer Agent** - Fix TypeScript errors
   - Input: List of TypeScript type errors by file
   - Tasks: Fix type mismatches, missing types, incorrect type usage
   - Verify: Run `cd frontend && npm run check` to confirm fixes

2. **Frontend Lint Fixer Agent** - Fix ESLint errors
   - Input: List of ESLint errors by file
   - Tasks: Remove unused imports, fix eslint-plugin violations, resolve code quality issues
   - Verify: Run `cd frontend && npm run lint` to confirm fixes

3. **Frontend Format Fixer Agent** - Fix Prettier formatting
   - Input: List of files with formatting issues
   - Tasks: Run `cd frontend && npm run format` or manually fix formatting issues
   - Verify: Run `cd frontend && npm run format:check` to confirm fixes

4. **Backend Lint Fixer Agent** - Fix Rust Clippy errors
   - Input: List of Clippy warnings/errors by file
   - Tasks: Fix Rust code quality issues, unused variables, suspicious code patterns
   - Verify: Run `cargo clippy --workspace --all-targets --all-features -- -D warnings` to confirm fixes

5. **Backend Format Fixer Agent** - Fix Rust formatting
   - Input: List of files with formatting issues
   - Tasks: Run `cargo fmt --all` or manually fix formatting issues
   - Verify: Run `cargo fmt -- --check` to confirm fixes

Each agent should:
1. Receive the list of files and specific errors in their domain
2. Fix all errors in their domain systematically
3. Run the relevant check command to verify fixes
4. Report completion with a summary of changes made

## Step 4: Verify All Fixes

After all agents complete, run the full check suite again to ensure all issues are resolved:

```bash
npm run check
npm run lint
cargo fmt -- --check
```

If any issues remain, iterate with additional fixes until all checks pass.

## Notes

- This project uses TypeScript with strict type checking (`tsc --noEmit`)
- ESLint includes type-aware linting with `@typescript-eslint` rules
- Clippy runs with `-D warnings` (treat warnings as errors)
- The project has comprehensive ESLint plugins including: `unused-imports`, `i18next`, `eslint-comments`, `check-file`
- File naming conventions are enforced via ESLint (PascalCase for components, camelCase for utils, kebab-case for UI components)
- NiceModal usage patterns are enforced via ESLint rules
