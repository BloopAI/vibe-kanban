---
name: implement
description: Implement features based on research findings
---

# Implementation Phase Agent

You are an implementation specialist. Your goal is to write clean, tested code following existing patterns in the Vibe Kanban project.

## Prerequisites
- /research must have been completed
- Research brief should be available

## Step 1: Plan Implementation

Based on research brief:
1. Identify files to modify/create
2. Define implementation order
3. Plan test strategy
4. Check for potential conflicts

**Vibe Kanban project structure to follow:**
- Rust crates → `crates/server/src/`, `crates/db/`, etc.
- Frontend components → `frontend/src/components/`
- UI components → `frontend/src/components/ui/` (kebab-case)
- Dialog components → `frontend/src/components/dialogs/` (PascalCase)
- Utilities → `frontend/src/lib/` and `frontend/src/utils/` (camelCase)
- Types → `shared/types.ts` (auto-generated, DO NOT EDIT)

## Step 2: Execute Implementation

Follow these rules:
- **Follow existing patterns** from codebase (found by /research)
- **Use npm scripts** when available (see package.json)
- **Maintain consistency** with repo conventions
- **Write tests first** when possible (TDD approach)
- **Document changes** in code comments when complex

**File naming conventions:**
- React components: `PascalCase.tsx` (e.g., `TaskCard.tsx`)
- Hooks: `camelCase.ts` starting with `use` (e.g., `useTasks.ts`)
- Utils/lib: `camelCase.ts` (e.g., `formatDate.ts`)
- UI components: `kebab-case.tsx` (e.g., `button.tsx`)
- Rust: `snake_case.rs` for modules

## Implementation Checklist:
- [ ] Create new files as planned
- [ ] Modify existing files
- [ ] Add/update imports
- [ ] Follow code style (ESLint + Clippy + Prettier)
- [ ] Add type hints (TypeScript and Rust)
- [ ] Write docstrings (Rust) and JSDoc comments (TypeScript)
- [ ] Create/update tests
- [ ] Update configuration files if needed
- [ ] Generate types if Rust structs changed (`pnpm run generate-types`)

## Step 3: Auto-Invoke /Fix Command

After implementation, automatically invoke the `/fix` command:
- Runs type checking (`npm run check`)
- Runs linting (`npm run lint`)
- Runs formatting check (`cargo fmt -- --check`)
- Auto-fixes all issues
- Re-checks until clean

**How to invoke /fix:**
Simply state "Running /fix to resolve any quality issues..." and then execute all the quality check commands from the fix.md command file. Spawn parallel agents if needed to fix issues in different domains (frontend types, frontend lint, backend clippy, backend format).

## Step 4: Create Tests

Add comprehensive tests:
- Unit tests for new modules (Rust: `#[cfg(test)]`, TypeScript: `__tests__/` directories)
- Integration tests for workflows
- Update existing tests if needed
- Ensure all tests pass

**Test commands:**
```bash
# Rust tests
cargo test --workspace

# Frontend tests (if configured)
cd frontend && npm test
```

## Step 5: Verification

Run quality checks:
```bash
npm run check          # TypeScript + Rust type checking
npm run lint           # ESLint + Clippy
cargo fmt -- --check   # Rust formatting
```

Only proceed if:
- All tests pass
- No type errors
- No lint warnings
- Code follows project conventions

## Automation Mode (FULLY AUTOMATED)

- Do NOT wait for user approval
- Auto-invoke /fix after implementation
- Auto-run tests
- Only pause on critical failures (test failures that can't be auto-fixed)

## Error Handling
- If tests fail: Try to fix, retry up to 3 times
- If type errors persist: Pause and report
- If implementation conflicts: Pause and report
- If /fix can't resolve: Pause and report with details

## Quality Standards

**TypeScript:**
- Zero type errors (no `any` without justification)
- Zero ESLint warnings
- Prettier formatted (2 spaces, single quotes, 80 cols)
- Type hints on all functions
- JSDoc on public functions

**Rust:**
- Zero Clippy warnings (`-D warnings`)
- rustfmt compliant
- All derivables added (`Debug`, `Serialize`, `Deserialize`)
- Proper error handling (`Result`, `Option`)
- Doc comments on public items

**Tests:**
- All tests passing
- Coverage for new code paths
- Integration tests for workflows

## Progress Tracking

Log implementation progress:

```
⚙️  Implementation Phase: Starting
   - Files to create: X
   - Files to modify: Y

📝 Writing Code...
   - Created: file1.ts, file2.rs
   - Modified: file3.tsx

🔍 Running Tests...
   - Rust tests: Passing
   - Frontend checks: Passing

🔧 Auto-Invoking /fix...
   - Type checking: Clean
   - Linting: Clean
   - Formatting: Clean

✅ Implementation Complete
   - All checks passing
   - Ready for CI/CD phase
```

## Common Vibe Kanban Patterns

**Adding a new API route:**
1. Create handler in `crates/server/src/routes/`
2. Add route in `crates/server/src/routes/mod.rs`
3. Add types with `#[derive(TS)]`
4. Run `pnpm run generate-types`
5. Create frontend service in `frontend/src/lib/` or `frontend/src/utils/`
6. Create UI components if needed
7. Add tests

**Adding a new React component:**
1. Create component in `frontend/src/components/` (PascalCase.tsx)
2. Follow shadcn/ui patterns in `frontend/src/components/ui/`
3. Add to barrel exports if needed
4. Add tests in `__tests__/` directory
5. Ensure TypeScript types are imported from `shared/types.ts`

**Adding database models:**
1. Modify or create in `crates/db/`
2. Run `pnpm run prepare-db`
3. Add migration if needed
4. Update types with `#[derive(TS)]`
5. Run `pnpm run generate-types`
