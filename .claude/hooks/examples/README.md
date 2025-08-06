# automagik-forge Hook System Examples

These are **working pre-hook examples** based on Claude Code's hook system. They provide real automation for your automagik-forge development workflow.

## 🚀 Quick Setup

### Option 1: TDD Guard (Recommended)
Automatically validates Test-Driven Development workflow:

```bash
# Copy the settings to enable TDD validation
cp .claude/hooks/examples/settings.json.template .claude/settings.json
cp .claude/hooks/examples/tdd-hook.sh.template .claude/hooks/tdd-hook.sh
cp .claude/hooks/examples/tdd-validator.py.template .claude/hooks/tdd-validator.py

# Make scripts executable
chmod +x .claude/hooks/tdd-hook.sh
```

### Option 2: Quality Checks Only
Run quality tools before commits:

```bash
# Copy and customize for your project
cp .claude/hooks/examples/pre-commit-quality.sh.template .claude/hooks/pre-commit-quality.sh
chmod +x .claude/hooks/pre-commit-quality.sh

# Add to settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command", 
            "command": "./.claude/hooks/pre-commit-quality.sh"
          }
        ]
      }
    ]
  }
}
```

## 📁 Available Hook Templates

### 🧪 `tdd-hook.sh` + `tdd-validator.py`
- **Purpose**: Enforces Test-Driven Development workflow
- **Features**: 
  - Multi-language test detection (Python, Node.js, Rust, Go, Java)
  - Validates tests pass before allowing implementation changes
  - Works with uv, npm, pnpm, yarn, cargo, go test, maven, gradle
- **When it runs**: Before Write/Edit/MultiEdit operations
- **Best for**: Projects following TDD methodology

### 🔍 `pre-commit-quality.sh` 
- **Purpose**: Automatic code quality enforcement
- **Features**:
  - Auto-detects tech stack (Python/Node.js/Rust/Go/Java)
  - Runs appropriate formatters and linters
  - Python: ruff format, ruff check, mypy
  - Node.js: eslint, prettier
  - Rust: rustfmt, clippy
  - Go: gofmt, go vet, golint
  - Java: checkstyle, gradle check
- **When it runs**: Before Write/Edit/MultiEdit operations  
- **Best for**: Maintaining consistent code quality

### ⚙️ `settings.json`
- **Purpose**: Pre-hook configuration for Claude Code
- **Features**: 
  - Triggers hooks before Write/Edit/MultiEdit tools
  - Customizable hook matching patterns
  - Command-based hook execution
- **Best for**: Enabling the hook system

## 🎯 Hook System Benefits

### For automagik-forge Development:
- **Automatic Quality**: No more manual linting/formatting
- **TDD Compliance**: Enforces test-first development
- **Multi-Language**: Works with Python, Node.js, Rust, Go, Java
- **Zero Config**: Auto-detects your tech stack
- **Fast**: Runs only relevant tools for your project

### Integration with automagik-forge-Genie Agents:
- **genie-dev-coder**: Respects TDD Guard hooks during implementation
- **genie-dev-fixer**: Validates fixes don't break existing tests
- **genie-testing-fixer**: Works alongside hook validation
- **genie-quality-*****: Hooks complement manual quality checks

## 🔧 Customization

### Language-Specific Tweaks:
Edit the hook scripts to add automagik-forge-specific rules:

```bash
# In pre-commit-quality.sh - add custom Python rules
if [ -f "pyproject.toml" ]; then
    # Add your custom automagik-forge quality checks
    echo "🎯 Running automagik-forge custom validation..."
    # Add specific commands here
fi
```

### TDD Customization:
Edit `tdd-validator.py` to customize TDD rules for automagik-forge:

```python
def validate_tdd_cycle(tool, file_path, content):
    # Add automagik-forge-specific TDD rules
    if "automagik-forge_core" in file_path:
        # Stricter validation for core modules
        pass
```

## 📊 Multi-Language Support

| Language | Format | Lint | Test | Notes |
|----------|--------|------|------|-------|
| Python | ruff format | ruff check | pytest | Uses uv when available |
| JavaScript/TypeScript | prettier | eslint | npm test | Supports jest, vitest |  
| Rust | rustfmt | clippy | cargo test | Built-in tooling |
| Go | gofmt | go vet, golint | go test | Built-in tooling |
| Java | - | checkstyle | maven/gradle | Requires configuration |

## 🚨 Important Notes

- **Executable Permissions**: Make sure to `chmod +x` your hook scripts
- **Dependencies**: Hooks will skip tools that aren't installed (graceful degradation)
- **Performance**: Hooks run automatically - keep them fast
- **Testing**: Test your hooks with simple file changes first
- **Customization**: Copy templates and modify for automagik-forge-specific needs

## 🌟 Best Practices

1. **Start Simple**: Begin with just one hook (TDD or Quality)
2. **Test First**: Validate hooks work with small changes
3. **Customize Gradually**: Add automagik-forge-specific rules over time
4. **Monitor Performance**: Keep hooks fast (< 5 seconds)
5. **Document Changes**: Note customizations for team members

---

**These are real, working hooks based on production Claude Code usage!** 🎯

Enable them to get immediate development workflow automation for automagik-forge.