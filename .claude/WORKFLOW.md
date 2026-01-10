# iKanban TDD Workflow

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    TDD-DRIVEN WORKFLOW                          │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1      Phase 2       Phase 3 (TDD)     Phase 4          │
│  ────────     ────────      ────────────      ────────         │
│  Task Setup → Planning → 🔴 Red → 🟢 Green → E2E Test          │
│              Docs           🔵 Refactor                         │
│                                                                 │
│  Phase 5      Phase 6                                           │
│  ────────     ────────                                          │
│  Git Flow  → Task Done                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Task Setup

```bash
cd /Users/rupeshpanwar/Documents/Projects/iKanban/mcp
python3 ikanban.py create IKA "Task title" -s inprogress
```

Output: `Created IKA-XX: Task title`

## Phase 2: Planning Docs

**MANDATORY** - Create BEFORE any code:

1. Determine task type: `frontend` | `backend` | `integration`
2. Create flow diagram:
   ```
   /Users/rupeshpanwar/Documents/docs/docs-ikanban/<type>/IKA-XX-feature-flow.md
   ```
3. Create implementation plan:
   ```
   /Users/rupeshpanwar/Documents/docs/docs-ikanban/<type>/IKA-XX-feature-plan.md
   ```

**Example paths:**
- `frontend/IKA-75-keyboard-shortcuts-flow.md`
- `frontend/IKA-75-keyboard-shortcuts-plan.md`

## Phase 3: TDD Cycle

### 🔴 RED: Write Failing Tests First

**Backend (Rust):**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_feature_expected_behavior() {
        // Arrange
        let input = create_test_input();
        // Act
        let result = function_under_test(input).await;
        // Assert
        assert!(result.is_ok());
    }
}
```

**Frontend (TypeScript):**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('ComponentName', () => {
  it('should render expected content', () => {
    render(<ComponentName />);
    expect(screen.getByText('Expected')).toBeInTheDocument();
  });
});
```

**Run tests - MUST fail:**
```bash
cargo test --workspace -- --nocapture
cd vibe-frontend && pnpm test
```

### 🟢 GREEN: Implement Minimal Code

- Write ONLY enough code to pass tests
- Follow patterns from `PATTERNS.md`
- Run tests after each change

### 🔵 REFACTOR: Clean Up

- Improve structure, remove duplication
- Keep tests green
- Run full validation:
  ```bash
  cd vibe-frontend && pnpm lint && pnpm check
  cargo check --workspace
  ```

## Phase 4: E2E Testing

**API Testing:**
```bash
curl -s -X POST 'http://localhost:3001/api/endpoint' \
  -H 'Content-Type: application/json' \
  -d '{"field": "value"}' | jq .
```

**UI Testing:**
- [ ] Navigate to affected page
- [ ] Perform action
- [ ] Check browser console (F12)
- [ ] Verify data persists after refresh

## Phase 5: Git Workflow

```bash
# Create branch
git checkout -b feature/IKA-XX-feature-name

# Commit
git add .
git commit -m "feat: description (IKA-XX)"

# Push and merge
git push -u origin feature/IKA-XX-feature-name
git checkout main && git pull && git merge feature/IKA-XX-feature-name
git push origin main

# Cleanup
git branch -d feature/IKA-XX-feature-name
git push origin --delete feature/IKA-XX-feature-name
```

## Phase 6: Task Done

```bash
cd /Users/rupeshpanwar/Documents/Projects/iKanban/mcp

# Update with summary and mark done
python3 ikanban.py update IKA-XX -s done -d "Fixed: summary. Docs: type/IKA-XX-*"

# Add comment
python3 ikanban.py comment IKA-XX "Completed: fixed X, added Y"
```

## Rules

| Rule | Penalty if Skipped |
|------|-------------------|
| Create task first | Task INCOMPLETE |
| Create planning docs | Task INCOMPLETE |
| Write tests first (TDD) | REWORK required |
| E2E test before commit | Task INCOMPLETE |
| Mark task done | Task stays open |

## Commit Message Format

```
<type>: <description> (IKA-XX)

<optional body>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
