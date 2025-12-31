# Pre-Task Hook

**Purpose**: Validate environment and provide visibility before task execution. This hook is **NON-BLOCKING** - it logs information and continues regardless of results.

---

## Step 1: Git Status Check

Check the current git state to understand what we're working with:

```bash
git status --short
```

**What to look for**:
- `M` - Modified files (staged)
- ` M` - Modified files (unstaged)
- `??` - Untracked files
- `D` - Deleted files

---

## Step 2: Current Branch and Recent Activity

```bash
echo "=== Current Branch ==="
git branch --show-current

echo ""
echo "=== Recent Commits (last 3) ==="
git log --oneline -3
```

---

## Step 3: Environment Validation

### Frontend Dependencies Check

```bash
cd frontend
echo "=== Frontend Dependencies ==="
if [ ! -d "node_modules" ]; then
  echo "⚠️  Frontend node_modules not found - run 'npm install' if needed"
else
  echo "✓ Frontend dependencies installed"
fi
```

### Backend Rust Check

```bash
echo ""
echo "=== Rust Toolchain ==="
if command -v cargo &> /dev/null; then
  cargo --version
  echo "✓ Cargo is available"
else
  echo "⚠️  Cargo not found - Rust toolchain may not be installed"
fi
```

---

## Step 4: Quick Type Check (Informational Only)

Run type checking to surface issues early (non-blocking):

```bash
echo ""
echo "=== Running Type Checks (informational) ==="

# Frontend type check
echo "Frontend (TypeScript):"
cd frontend && npm run check 2>&1 | head -20 || echo "⚠️  Frontend type check found issues"

# Backend type check
echo ""
echo "Backend (Rust):"
cd /home/codespace/VibeCan.brnd/Vibecan.brnd && cargo check --quiet 2>&1 2>&1 | head -20 || echo "⚠️  Backend type check found issues"
```

---

## Step 5: Check for Common Issues

### Large Files Warning

```bash
echo ""
echo "=== Large Files Check ==="
find . -type f -size +5M -not -path "*/node_modules/*" -not -path "*/target/*" -not -path "*/.git/*" -exec ls -lh {} \; 2>/dev/null | awk '{print $9, $5}' || echo "No large files found"
```

### Debug Code Detection

```bash
echo ""
echo "=== Debug Code Check ==="
echo "Searching for console.log, debugger, and TODO comments..."

# Frontend
echo "Frontend debug statements:"
grep -r "console\.log\|debugger\|TODO\|FIXME" frontend/src --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | xargs -I {} echo "  Found {} instances"

# Backend
echo "Backend debug statements:"
grep -r "println!\|dbg!\|TODO\|FIXME" crates --include="*.rs" 2>/dev/null | wc -l | xargs -I {} echo "  Found {} instances"
```

### Secrets Detection (Basic)

```bash
echo ""
echo "=== Secrets Detection (Basic) ==="
echo "Checking for potential secrets in recently modified files..."

# Check for common secret patterns
git diff --name-only HEAD~5..HEAD | while read file; do
  if [ -f "$file" ]; then
    if grep -qiE "(password|secret|api_key|token|private_key).*=.*['\"]" "$file" 2>/dev/null; then
      echo "⚠️  Possible secret in: $file"
    fi
  fi
done
echo "✓ Secrets check complete"
```

---

## Step 6: Test Status Summary

```bash
echo ""
echo "=== Test Status ==="

# Check if Rust tests have been run recently
if [ -f "Cargo.lock" ]; then
  echo "Backend tests: Run 'cargo test --workspace' to verify"
fi

# Check frontend test setup
if [ -f "frontend/package.json" ]; then
  echo "Frontend tests: Ensure test setup is configured"
fi
```

---

## Summary

After running these checks, you should have:

- ✓ Current git status and branch information
- ✓ Environment validation (dependencies, toolchain)
- ✓ Type check results (informational)
- ✓ Awareness of any large files, debug code, or potential secrets
- ✓ Test status reminder

**Continue with task execution** - this hook provides visibility only and should not block work.

---

## Notes for the Agent

- These checks are **informational only** - do not wait for results or block execution
- If type checks fail, note the issues but proceed with the task
- Warn about potential issues (secrets, debug code) but don't stop
- The goal is visibility and awareness, not gating
