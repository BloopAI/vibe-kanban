# Pre-Commit Hook

**Purpose**: Validate commit readiness and provide visibility before committing changes. This hook is **NON-BLOCKING** - it reports issues but doesn't prevent the commit.

---

## Step 1: Commit Content Preview

```bash
echo "=== Proposed Commit Content ==="

# Show what's being committed
git diff --staged --stat

echo ""
echo "Files to be committed:"
git diff --staged --name-status
```

---

## Step 2: Quality Gate Checks

### Type Check (Critical)

```bash
echo ""
echo "=== Type Check Results ==="

echo "Frontend (TypeScript):"
cd frontend && npm run check > /tmp/frontend-check.log 2>&1
if [ $? -eq 0 ]; then
  echo "✓ Frontend type check PASSED"
else
  echo "⚠️  Frontend type check FAILED"
  echo "  Run 'npm run check' to see errors"
  cat /tmp/frontend-check.log | head -20
fi

echo ""
echo "Backend (Rust):"
cd /home/codespace/VibeCan.brnd/Vibecan.brnd && cargo check --quiet 2> /tmp/backend-check.log
if [ $? -eq 0 ]; then
  echo "✓ Backend type check PASSED"
else
  echo "⚠️  Backend type check FAILED"
  echo "  Run 'cargo check' to see errors"
  cat /tmp/backend-check.log | head -20
fi
```

---

## Step 3: Linting Check (Critical)

```bash
echo ""
echo "=== Linting Results ==="

cd /home/codespace/VibeCan.brnd/Vibecan.brnd
npm run lint > /tmp/lint-results.log 2>&1
if [ $? -eq 0 ]; then
  echo "✓ Linting PASSED"
else
  echo "⚠️  Linting FAILED - review issues below:"
  cat /tmp/lint-results.log | head -40
  echo ""
  echo "Fix with:"
  echo "  Frontend: cd frontend && npm run lint:fix"
  echo "  Backend: cargo clippy --fix --allow-dirty --allow-staged"
fi
```

---

## Step 4: Code Formatting Check

```bash
echo ""
echo "=== Formatting Check ==="

echo "Rust formatting:"
cargo fmt -- --check > /tmp/rust-fmt.log 2>&1
if [ $? -eq 0 ]; then
  echo "✓ Rust code is properly formatted"
else
  echo "⚠️  Rust code needs formatting"
  echo "  Fix with: cargo fmt"
  cat /tmp/rust-fmt.log | head -10
fi

echo ""
echo "Frontend formatting:"
cd frontend && npm run format:check > /tmp/frontend-fmt.log 2>&1
if [ $? -eq 0 ]; then
  echo "✓ Frontend code is properly formatted"
else
  echo "⚠️  Frontend code needs formatting"
  echo "  Fix with: npm run format"
  cat /tmp/frontend-fmt.log | head -10
fi
```

---

## Step 5: Secrets and Sensitive Data Check

```bash
echo ""
echo "=== Security Check ==="

# Check for common secret patterns in staged files
echo "Scanning for potential secrets..."

found_secrets=0
git diff --staged --name-only | while read file; do
  if [ -f "$file" ]; then
    # Check for various secret patterns
    if grep -qiE "password.*=.*['\"].*['\""]" "$file" 2>/dev/null; then
      echo "⚠️  Possible hardcoded password in: $file"
      found_secrets=1
    fi
    if grep -qiE "(api_key|apikey|api-key).*=.*['\"].*['\""]" "$file" 2>/dev/null; then
      echo "⚠️  Possible API key in: $file"
      found_secrets=1
    fi
    if grep -qiE "(secret|private_key|token).*=.*['\"].*['\""]" "$file" 2>/dev/null; then
      echo "⚠️  Possible secret/token in: $file"
      found_secrets=1
    fi
    # Check for AWS/Azure/GCP keys
    if grep -qE "(AKIA[0-9A-Z]{16}|eyJhbGci)" "$file" 2>/dev/null; then
      echo "⚠️  Possible cloud provider key in: $file"
      found_secrets=1
    fi
  fi
done

if [ $found_secrets -eq 0 ]; then
  echo "✓ No obvious secrets detected"
else
  echo "⚠️  WARNING: Possible secrets found - review before committing!"
fi
```

---

## Step 6: Debug Code Detection

```bash
echo ""
echo "=== Debug Code Check ==="

found_debug=0

# Check for console.log in TypeScript/JavaScript
git diff --staged --name-only | grep -E "\.(ts|tsx|js|jsx)$" | while read file; do
  if [ -f "$file" ]; then
    if grep -n "console\.log\|console\.debug\|console\.error" "$file" > /dev/null 2>&1; then
      echo "⚠️  Debug console statements in $file:"
      grep -n "console\." "$file" | head -5
      found_debug=1
    fi
  fi
done

# Check for Rust debug macros
git diff --staged --name-only | grep -E "\.rs$" | while read file; do
  if [ -f "$file" ]; then
    if grep -n "dbg!\|println!\|eprintln!" "$file" > /dev/null 2>&1; then
      echo "⚠️  Debug prints in $file:"
      grep -n "dbg!\|println!" "$file" | head -5
      found_debug=1
    fi
  fi
done

if [ $found_debug -eq 0 ]; then
  echo "✓ No debug code found"
else
  echo "⚠️  WARNING: Debug code detected - remove before committing"
fi
```

---

## Step 7: Large Files Warning

```bash
echo ""
echo "=== Large Files Check ==="

# Check for large files being added
git diff --staged --name-only | while read file; do
  if [ -f "$file" ]; then
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
    size_mb=$((size / 1048576))
    if [ $size_mb -gt 3 ]; then
      echo "⚠️  Large file: $file (${size_mb}MB)"
      echo "   Consider if this should be in .gitignore or LFS"
    fi
  fi
done

echo "✓ Large file check complete"
```

---

## Step 8: Commit Message Guidelines

```bash
echo ""
echo "=== Commit Message Guidelines ==="

cat << 'EOF'
When writing your commit message:

✓ Good commit messages:
  - "feat: add OAuth2 authentication flow"
  - "fix: resolve race condition in task executor"
  - "docs: update API documentation for endpoints"
  - "refactor: extract validation logic to separate module"

✗ Avoid:
  - "update stuff"
  - "fix bug"
  - "changes"
  - "wip"

Format:
  <type>(<scope>): <subject>

  Types: feat, fix, docs, style, refactor, test, chore
  Scope: frontend, backend, db, deployment, etc.
  Subject: imperative mood, no period, 50 chars or less

  <body> (optional, wrap at 72 chars)

  <footer> (optional, for breaking changes, refs, etc.)
EOF
```

---

## Step 9: Testing Recommendations

```bash
echo ""
echo "=== Testing Recommendations ==="

# Analyze what changed to recommend tests
frontend_changed=$(git diff --staged --name-only | grep -c "^frontend/" || true)
backend_changed=$(git diff --staged --name-only | grep -c "^crates/" || true)
db_changed=$(git diff --staged --name-only | grep -c "crates/db/" || true)

if [ "$frontend_changed" -gt 0 ]; then
  echo "📝 Frontend changes detected:"
  echo "  - Review UI changes in browser"
  echo "  - Check for i18n issues: npm run lint:i18n"
  echo "  - Test user interactions if components changed"
fi

if [ "$backend_changed" -gt 0 ]; then
  echo "📝 Backend changes detected:"
  echo "  - Run tests: cargo test --workspace"
  echo "  - Verify database schema if db/ changed"
  echo "  - Check API endpoints if routes changed"
fi

if [ "$db_changed" -gt 0 ]; then
  echo "📝 Database changes detected:"
  echo "  - Verify migrations: pnpm run prepare-db:check"
  echo "  - Test data queries if models changed"
fi
```

---

## Step 10: Pre-Commit Checklist

```bash
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                  PRE-COMMIT CHECKLIST                         ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

checks=()
total=0
passed=0

# Type checks
cd frontend && npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  checks+=("✓ Frontend type check")
  ((passed++))
else
  checks+=("⚠️  Frontend type check FAILED")
fi
((total++))

cd /home/codespace/VibeCan.brnd/Vibecan.brnd && cargo check --quiet > /dev/null 2>&1
if [ $? -eq 0 ]; then
  checks+=("✓ Backend type check")
  ((passed++))
else
  checks+=("⚠️  Backend type check FAILED")
fi
((total++))

# Linting
cd /home/codespace/VibeCan.brnd/Vibecan.brnd && npm run lint > /dev/null 2>&1
if [ $? -eq 0 ]; then
  checks+=("✓ Linting")
  ((passed++))
else
  checks+=("⚠️  Linting FAILED")
fi
((total++))

# Formatting
cd /home/codespace/VibeCan.brnd/Vibecan.brnd && cargo fmt -- --check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  checks+=("✓ Rust formatting")
  ((passed++))
else
  checks+=("⚠️  Rust formatting FAILED")
fi
((total++))

cd frontend && npm run format:check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  checks+=("✓ Frontend formatting")
  ((passed++))
else
  checks+=("⚠️  Frontend formatting FAILED")
fi
((total++))

# Display results
for check in "${checks[@]}"; do
  echo "  $check"
done

echo ""
echo "Summary: $passed/$total checks passed"

if [ $passed -eq $total ]; then
  echo "✓ All checks passed - ready to commit!"
else
  echo "⚠️  Some checks failed - review above but commit will proceed"
fi
```

---

## Final Summary

```bash
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                  READY TO COMMIT                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

staged_count=$(git diff --staged --name-only | wc -l)
echo "Staged files: $staged_count"
echo ""
echo "To commit, run:"
echo "  git commit -m 'type(scope): description'"
echo ""
echo "To review changes first:"
echo "  git diff --staged"
echo ""
echo "To make adjustments:"
echo "  git add <files>      # Add more files"
echo "  git reset <files>    # Unstage files"
echo ""
echo "═══════════════════════════════════════════════════════════════"
```

---

## Notes for the Agent

- This hook is **NON-BLOCKING** - it reports issues but doesn't stop the commit
- All checks are informational - the agent can proceed with the commit regardless
- Provide clear warnings for critical issues (secrets, type errors, linting failures)
- Suggest fixes but don't enforce them
- The goal is visibility and quality awareness, not gating commits

---

## Quick Fixes Reference

If issues are found:

**Type errors:**
```bash
cd frontend && npm run check          # See frontend errors
cargo check                           # See backend errors
```

**Linting:**
```bash
cd frontend && npm run lint:fix       # Fix frontend linting
cargo clippy --fix --allow-dirty      # Fix backend linting
```

**Formatting:**
```bash
npm run format                        # Format frontend
cargo fmt                             # Format backend
```

**Debug code:**
```bash
# Manually remove console.log, dbg!, println! before committing
git diff --staged | grep -E "console\.|dbg!|println!"
```

**Proceed with commit** - this hook provides visibility only!
