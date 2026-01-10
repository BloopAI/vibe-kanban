# iKanban TDD Workflow

## Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         TDD-DRIVEN WORKFLOW (8 PHASES)                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase 1         Phase 2          Phase 3           Phase 4                  │
│  ────────        ────────         ────────          ────────                 │
│  Task Setup  →   Planning    →    Feature      →    Implementation           │
│                  Docs             Branch                                     │
│                  (ASCII flow +                                               │
│                   plan.md)                                                   │
│                                                                              │
│  Phase 5         Phase 6          Phase 7           Phase 8                  │
│  ────────        ────────         ────────          ────────                 │
│  Write Tests →   Run Tests   →    Git Merge    →    Task Done                │
│  (vibe-testing)  (Playwright)     & Push            (if tests pass)          │
│                                   + Attach Docs                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Task Setup

Create a task in iKanban before starting any work.

```bash
cd /Users/rupeshpanwar/Documents/Projects/iKanban/mcp
python3 ikanban.py create IKA "Task title" -s inprogress
```

**Output:** `Created IKA-XX: Task title`

**Save this task number - you'll need it for all subsequent phases!**

---

## Phase 2: Planning Docs

**MANDATORY** - Create BEFORE any code:

### Step 1: Determine Task Type
- `frontend` - UI components, pages, hooks
- `backend` - API endpoints, database, models
- `integration` - Full features touching both

### Step 2: Create ASCII Flow Diagram

**Path:** `/Users/rupeshpanwar/Documents/docs/docs-ikanban/<type>/IKA-XX-<feature>-flow.md`

**Must include:**
- ASCII diagram showing data/user flow
- Components/modules involved
- Sequence of operations
- Error handling paths

**Example:**
```markdown
# IKA-XX: Feature Name - Flow Diagram

## User Flow
┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │────▶│ Frontend│────▶│ Backend │
│ Action  │     │Component│     │   API   │
└─────────┘     └─────────┘     └─────────┘
                     │               │
                     ▼               ▼
               ┌─────────┐     ┌─────────┐
               │  State  │     │Database │
               └─────────┘     └─────────┘
```

### Step 3: Create Implementation Plan

**Path:** `/Users/rupeshpanwar/Documents/docs/docs-ikanban/<type>/IKA-XX-<feature>-plan.md`

**Must include:**
- Files to modify/create
- Step-by-step implementation
- Test scenarios
- Acceptance criteria

---

## Phase 3: Feature Branch

**NEVER commit directly to main!**

```bash
git checkout -b feature/IKA-XX-<feature-name>
```

**Naming convention:** `feature/IKA-XX-short-description`

---

## Phase 4: Implementation

Follow TDD cycle from `PATTERNS.md`:

### 4.1 Database Schema Changes (if needed)

**IMPORTANT:** All database schema changes MUST be done via Drizzle ORM.

**Schema location:** `/Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/schema/schema.pg.ts`

**Migrations output:** `/Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/drizzle/`

#### Steps for Schema Changes:

1. **Edit the schema file:**
   ```bash
   # Edit the Drizzle schema
   /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/schema/schema.pg.ts
   ```

2. **Generate migration:**
   ```bash
   cd /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/schema
   npm run generate
   ```

3. **Review generated SQL:**
   ```bash
   # Check the new migration file in drizzle/ directory
   ls -la /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/drizzle/
   ```

4. **Apply migration to database:**
   - Apply the generated SQL to your Supabase database
   - Use Supabase Dashboard SQL Editor or CLI

5. **Update SQLx cache (for Rust backend):**
   ```bash
   cd /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/crates/db
   cargo sqlx prepare
   ```

6. **Commit both Drizzle migration AND SQLx cache files**

#### Drizzle Schema Example:

```typescript
// schema.pg.ts
export const newTable = pgTable("new_table", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});
```

### 4.2 Backend (Rust)
```bash
cd vibe-backend
# Implement feature
cargo check --workspace
cargo clippy --workspace
```

### 4.3 Frontend (React/TypeScript)
```bash
cd vibe-frontend
# Implement feature
pnpm lint
pnpm check
```

### 4.4 SQLx Cache (after any database changes)
```bash
cd vibe-backend/crates/db && cargo sqlx prepare
```

---

## Phase 5: Write Tests

**Test location:** `/Users/rupeshpanwar/Documents/Projects/iKanban/vibe-testing/`

### Create Test File

```bash
# Create test file for the feature
touch /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-testing/tests/IKA-XX-<feature>.spec.ts
```

### Playwright Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('IKA-XX: Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Navigate to the page
    await page.goto('http://localhost:3000');
  });

  test('should perform expected action', async ({ page }) => {
    // Arrange
    // ...

    // Act
    await page.click('button[data-testid="action-button"]');

    // Assert
    await expect(page.locator('.result')).toBeVisible();
  });

  test('should handle error case', async ({ page }) => {
    // Test error handling
  });
});
```

### Test Categories

| Test Type | Description |
|-----------|-------------|
| Happy path | Normal user flow succeeds |
| Error handling | Errors are displayed properly |
| Edge cases | Boundary conditions |
| Persistence | Data survives refresh |

---

## Phase 6: Run Tests

### Run Playwright Tests

```bash
cd /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-testing

# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/IKA-XX-<feature>.spec.ts

# Run with UI mode (for debugging)
npx playwright test --ui

# Run headed (see browser)
npx playwright test --headed
```

### Expected Output

```
Running X tests using Y workers

  ✓ IKA-XX: Feature Name > should perform expected action (Xms)
  ✓ IKA-XX: Feature Name > should handle error case (Xms)

  X passed (Y.Zs)
```

### If Tests Fail

1. Fix the issue in the implementation
2. Re-run tests
3. **Do NOT proceed to Phase 7 until all tests pass!**

---

## Phase 7: Git Merge & Push + Attach Docs

### 7.1 Commit Changes

```bash
git add .
git commit -m "$(cat <<'EOF'
feat: <description> (IKA-XX)

- Implemented <feature>
- Added Playwright tests
- Docs: <type>/IKA-XX-<feature>-flow.md, IKA-XX-<feature>-plan.md

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### 7.2 Push Feature Branch

```bash
git push -u origin feature/IKA-XX-<feature-name>
```

### 7.3 Merge to Main

```bash
git checkout main
git pull origin main
git merge feature/IKA-XX-<feature-name>
git push origin main
```

### 7.4 Cleanup Feature Branch

```bash
git branch -d feature/IKA-XX-<feature-name>
git push origin --delete feature/IKA-XX-<feature-name>
```

### 7.5 Attach Planning Documents to Task

Add a comment with links to the planning documents:

```bash
cd /Users/rupeshpanwar/Documents/Projects/iKanban/mcp
python3 ikanban.py comment IKA-XX "Planning docs: <type>/IKA-XX-<feature>-flow.md, <type>/IKA-XX-<feature>-plan.md"
```

---

## Phase 8: Task Done

**Only mark done if all tests passed!**

```bash
cd /Users/rupeshpanwar/Documents/Projects/iKanban/mcp

# Update status and add summary
python3 ikanban.py update IKA-XX -s done -d "Completed: <summary>. Tests: passed. Docs: <type>/IKA-XX-*"

# Add final comment
python3 ikanban.py comment IKA-XX "Completed: <what was done>. All Playwright tests passing."
```

---

## Enforcement Checklist

**Verify BEFORE moving to next phase:**

| Phase | Checkpoint | Status |
|-------|------------|--------|
| 1 | Task created with IKA-XX number | [ ] |
| 2 | `IKA-XX-<feature>-flow.md` created with ASCII diagram | [ ] |
| 2 | `IKA-XX-<feature>-plan.md` created | [ ] |
| 3 | Feature branch created (not on main) | [ ] |
| 4 | Implementation complete, linters pass | [ ] |
| 5 | Test file created in `vibe-testing/tests/` | [ ] |
| 6 | All Playwright tests passing | [ ] |
| 7 | Merged to main and pushed | [ ] |
| 7 | Planning docs attached to task | [ ] |
| 8 | Task marked done | [ ] |

**If any checkbox is empty, STOP and complete that step first!**

---

## Rules

| Rule | Penalty if Skipped |
|------|-------------------|
| Create task first | Task INCOMPLETE |
| Create planning docs (flow + plan) | Task INCOMPLETE |
| Use feature branch | REWORK required |
| Write Playwright tests | Task INCOMPLETE |
| Tests must pass | Cannot merge |
| Attach docs to task | Task INCOMPLETE |
| Mark task done | Task stays open |

---

## Commit Message Format

```
<type>: <description> (IKA-XX)

- <bullet point 1>
- <bullet point 2>
- Docs: <type>/IKA-XX-*

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

---

## Quick Reference Commands

```bash
# Task Management
python3 mcp/ikanban.py create IKA "title" -s inprogress
python3 mcp/ikanban.py update IKA-XX -s done
python3 mcp/ikanban.py comment IKA-XX "message"
python3 mcp/ikanban.py task IKA-XX

# Git
git checkout -b feature/IKA-XX-name
git push -u origin feature/IKA-XX-name
git checkout main && git merge feature/IKA-XX-name

# Database Schema (Drizzle)
cd vibe-backend/schema && npm run generate   # Generate migration
cd vibe-backend/crates/db && cargo sqlx prepare  # Update SQLx cache

# Testing
cd vibe-testing && npx playwright test
npx playwright test tests/IKA-XX-feature.spec.ts --headed

# Validation
cd vibe-frontend && pnpm lint
cd vibe-backend && cargo check --workspace
```
