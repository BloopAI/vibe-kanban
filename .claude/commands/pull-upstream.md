# pull-upstream

Pull latest upstream changes for the new upstream-as-library architecture.

## Usage
`/pull-upstream`

## Architecture Context
After migration (per upstream-library wish), structure is:
```
automagik-forge/
├── upstream/          # Git submodule (untouched)
├── forge-extensions/  # Our additions
├── forge-overrides/   # Our replacements
└── forge-app/        # Main app composing everything
```

## What it does
1. Updates upstream submodule in isolated forge task
2. Analyzes breaking changes to our compositions
3. Adapts forge-extensions/overrides as needed
4. One commit per sync

## Execution Steps

### Step 1: Create Forge Task
```bash
# Get current upstream version
UPSTREAM_OLD=$(cd upstream && git rev-parse --short HEAD)

# Create isolated task
forge create task \
  --project-id "automagik-forge" \
  --title "Upstream sync: ${UPSTREAM_OLD}..HEAD" \
  --description "Update upstream submodule"
```

### Step 2: Update Upstream Submodule
```bash
# In task worktree
cd upstream
git fetch origin main
UPSTREAM_NEW=$(git rev-parse --short origin/main)

# Capture changes
git diff HEAD...origin/main --stat > ../upstream-changes.txt
git diff HEAD...origin/main --name-only > ../upstream-files.txt

# Update submodule
git checkout origin/main
cd ..
```

### Step 3: Analyze Impact on Compositions
```bash
# Check if upstream changes affect our service compositions
echo "=== COMPOSITION IMPACT ===" > impact.txt

# Check each changed file against our extensions
for file in $(cat upstream-files.txt); do
  # Does forge-extensions compose/override this?
  if grep -r "upstream::${file%.*}" forge-extensions/ 2>/dev/null; then
    echo "IMPACTS: $file used in forge-extensions" >> impact.txt
  fi

  # Do we override this file?
  if [ -f "forge-overrides/${file}" ]; then
    echo "OVERRIDE: $file (need review)" >> impact.txt
  fi
done

# Check database schema impacts on auxiliary tables
if grep -q "migrations/" upstream-files.txt; then
  echo "SCHEMA: Upstream migrations detected" >> impact.txt
  echo "CHECK: Foreign key references in forge_task_extensions" >> impact.txt
  echo "CHECK: Foreign key references in forge_project_settings" >> impact.txt
fi

# Check frontend changes for /legacy route
if grep -q "frontend/" upstream-files.txt; then
  echo "FRONTEND: Upstream UI changes (affects /legacy route)" >> impact.txt
fi
```

### Step 4: Claude Analysis
```
@impact.txt
@upstream-changes.txt
@forge-extensions/
@forge-app/src/services/

Analyze upstream changes impact:
1. Which service compositions break?
2. Which API changes affect our extensions?
3. Any new features we can compose with?
4. Required adaptations in forge-app?
5. Database schema impacts on auxiliary tables?
6. Frontend updates for /legacy route?

Focus on:
- Breaking changes to upstream::TaskService
- API signature changes we wrap
- Schema changes affecting foreign keys
- New upstream features to expose
- Auxiliary table compatibility
```

### Step 5: Adapt Compositions
```bash
# Claude fixes any broken compositions

# Example 1: Service wrapper adaptation
# If upstream changed TaskService::create_task signature
# Update forge-extensions/src/services/task_service.rs:
impl ForgeTaskService {
  pub async fn create_task(&self, data: CreateTask) -> Result<Task> {
    // Adapt to new upstream signature
    let adapted_data = adapt_to_upstream(data);
    let task = self.upstream.create_task(adapted_data).await?;

    // Store extensions in auxiliary table
    sqlx::query!(
      "INSERT INTO forge_task_extensions (task_id, branch_template) VALUES (?, ?)",
      task.id, data.branch_template
    ).execute(&self.db).await?;

    Ok(task)
  }
}

# Example 2: Schema migration adaptation
# If upstream adds new required field to tasks table
# Update auxiliary table joins/views accordingly
```

### Step 6: Test Integration
```bash
# Test compositions still work
cd forge-app
cargo check
cargo test

# Test both frontends
pnpm run build
```

### Step 7: Stage Changes
```bash
# Stage all adaptations
git add upstream forge-extensions forge-app

# Summary for forge UI
echo "📦 Changes staged for forge task"
echo "Review in forge UI and commit when ready"
```

## Key Differences from Direct Fork
- **No direct conflicts** - upstream is isolated
- **Composition breaks** - our services wrapping upstream
- **API changes** - affect our extension interfaces
- **Override conflicts** - only if we override same file

## Output Format
```
📊 Upstream Sync Analysis

Submodule: abc1234 → def5678
Commits: +15 upstream

Impact:
- 3 service compositions need updates
- 1 override needs review
- 0 breaking changes to public API

Status: Adaptations complete, ready to test
```