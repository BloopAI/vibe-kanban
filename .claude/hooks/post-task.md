# Post-Task Hook

**Purpose**: Provide visibility into task impact and validate quality after completion. This hook is **NON-BLOCKING** - it reports findings but doesn't prevent completion.

---

## Step 1: Git Diff Summary

Show what changed during the task:

```bash
echo "=== Files Changed ==="
git diff --stat

echo ""
echo "=== Detailed Changes ==="
git diff --name-status
```

**What changed**:
- Count of files modified
- Lines added/removed
- Type of changes (modify, add, delete, rename)

---

## Step 2: Quality Check Results

### Run Full Type Check

```bash
echo ""
echo "=== Type Check Results ==="

echo "Frontend (TypeScript):"
cd frontend && npm run check
if [ $? -eq 0 ]; then
  echo "✓ Frontend type check passed"
else
  echo "⚠️  Frontend type check failed - review errors above"
fi

echo ""
echo "Backend (Rust):"
cd /home/codespace/VibeCan.brnd/Vibecan.brnd && cargo check --quiet 2>&1
if [ $? -eq 0 ]; then
  echo "✓ Backend type check passed"
else
  echo "⚠️  Backend type check failed - review errors above"
fi
```

---

## Step 3: Linting Check

```bash
echo ""
echo "=== Linting Results ==="

# Run combined lint command
cd /home/codespace/VibeCan.brnd/Vibecan.brnd
npm run lint 2>&1 | head -50

if [ $? -eq 0 ]; then
  echo "✓ Linting passed"
else
  echo "⚠️  Linting found issues - review warnings above"
fi
```

---

## Step 4: Code Formatting Check

```bash
echo ""
echo "=== Code Formatting Check ==="

echo "Checking Rust formatting:"
cargo fmt -- --check
if [ $? -eq 0 ]; then
  echo "✓ Rust code is formatted"
else
  echo "⚠️  Rust code needs formatting - run 'cargo fmt'"
fi

echo ""
echo "Checking frontend formatting:"
cd frontend && npm run format:check
if [ $? -eq 0 ]; then
  echo "✓ Frontend code is formatted"
else
  echo "⚠️  Frontend code needs formatting - run 'npm run format'"
fi
```

---

## Step 5: Impact Analysis

### Files Modified Breakdown

```bash
echo ""
echo "=== Impact Analysis ==="

# Count by file type
echo "Changes by type:"
git diff --name-only | sed 's/.*\.//' | sort | uniq -c | sort -rn

echo ""
echo "Frontend changes:"
git diff --name-only | grep -E "^frontend/" | wc -l | xargs -I {} echo "  {} files"

echo "Backend changes:"
git diff --name-only | grep -E "^crates/" | wc -l | xargs -I {} echo "  {} files"

echo "Shared types changes:"
git diff --name-only | grep -E "^shared/" | wc -l | xargs -I {} echo "  {} files"
```

### New Files Added

```bash
echo ""
echo "=== New Files ==="
git status --short | grep "^??" | while read status file; do
  echo "  + $file"
done
```

---

## Step 6: Verify No Debug Code Left

```bash
echo ""
echo "=== Debug Code Audit ==="

# Check for console.log in new/modified files
echo "Checking for console.log in changes:"
git diff --name-only | grep -E "\.(ts|tsx|js|jsx)$" | while read file; do
  if grep -q "console\.log" "$file" 2>/dev/null; then
    echo "  ⚠️  console.log found in $file"
  fi
done

# Check for Rust debug prints
echo ""
echo "Checking for debug! in Rust changes:"
git diff --name-only | grep -E "\.rs$" | while read file; do
  if grep -q "dbg!\|println!" "$file" 2>/dev/null; then
    echo "  ⚠️  Debug print found in $file"
  fi
done

echo "✓ Debug code audit complete"
```

---

## Step 7: Test Recommendations

```bash
echo ""
echo "=== Testing Recommendations ==="

# Determine what to test
frontend_changed=$(git diff --name-only | grep -c "^frontend/" || true)
backend_changed=$(git diff --name-only | grep -c "^crates/" || true)

if [ "$frontend_changed" -gt 0 ]; then
  echo "📝 Frontend was modified:"
  echo "  - Review component changes manually"
  echo "  - Test affected UI flows"
  echo "  - Check for i18n issues with: npm run lint:i18n"
fi

if [ "$backend_changed" -gt 0 ]; then
  echo "📝 Backend was modified:"
  echo "  - Run: cargo test --workspace"
  echo "  - Check database migrations if DB code changed"
  echo "  - Verify API endpoints if routes changed"
fi

# Check if shared types changed
if git diff --name-only | grep -q "^shared/"; then
  echo "📝 Shared types changed:"
  echo "  - Ensure 'pnpm run generate-types' was run"
  echo "  - Both frontend and backend may need rebuilds"
fi
```

---

## Step 8: Commit Readiness

```bash
echo ""
echo "=== Commit Readiness Summary ==="

# Count unstaged changes
unstaged=$(git diff --name-only | wc -l)
staged=$(git diff --staged --name-only | wc -l)

echo "Staged files: $staged"
echo "Unstaged files: $unstaged"

echo ""
echo "Next steps:"
if [ "$staged" -gt 0 ]; then
  echo "  ✓ Changes are staged - ready to commit"
  echo "  - Consider running: git commit -m 'feat: description'"
else
  echo "  ⚠️  No staged changes - stage files with: git add <files>"
fi

if [ "$unstaged" -gt 0 ]; then
  echo "  ℹ️  You have unstaged changes - review with: git diff"
fi
```

---

## Summary Report

After running these checks, provide a concise summary:

```bash
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    TASK IMPACT SUMMARY                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

# Get file counts
total_files=$(git diff --name-only | wc -l)
frontend_files=$(git diff --name-only | grep "^frontend/" | wc -l)
backend_files=$(git diff --name-only | grep "^crates/" | wc -l)

echo "📊 Files modified: $total_files"
echo "   - Frontend: $frontend_files"
echo "   - Backend: $backend_files"

# Type check status
echo ""
echo "🔍 Quality Checks:"
echo "   - Type checks: Run above (review for errors)"
echo "   - Linting: Run above (review for warnings)"
echo "   - Formatting: Run above (review for issues)"

# Recommendations
echo ""
echo "💡 Recommendations:"
if [ "$total_files" -gt 10 ]; then
  echo "   ⚠️  Large changes detected - consider splitting into smaller commits"
fi
echo "   ✓ Review all changes with: git diff"
echo "   ✓ Run tests if business logic changed"
echo "   ✓ Stage files and commit when ready"
```

---

## Notes for the Agent

- This hook is **informational only** - do not block task completion
- Report all findings clearly with appropriate warnings
- Highlight issues that need attention (type errors, linting, formatting)
- Provide actionable next steps
- The task is complete regardless of check results - this hook provides visibility

---

## What to Do If Issues Found

If quality checks fail:

1. **Type errors**: Review the error output and fix critical issues
2. **Linting warnings**: Address important warnings, note trivial ones
3. **Formatting**: Run `npm run format` to fix
4. **Debug code**: Remove or comment out before committing
5. **Tests**: Run relevant tests to verify functionality

**Remember**: These are recommendations, not requirements. The task is complete - this hook helps ensure quality.
