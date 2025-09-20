# Wish Preparation: Restructure with Upstream as Library
**Status:** READY_FOR_WISH
**Created:** 2025-01-20 14:45
**Last Updated:** 2025-01-20 14:58

<task_breakdown>
1. [Analysis] Understanding current architecture and pain points
2. [Discovery] Finding npm publishing patterns and build automations
3. [Planning] Identifying routing and migration strategies
</task_breakdown>

<context_gathering>
Goal: Understand current build/publish pipeline and routing architecture
Status: IN_PROGRESS

Searches planned:
- [x] Analyze npm publishing workflow and package.json
- [x] Examine current build scripts (Makefile, gh-build.sh)
- [x] Check routing configuration (nginx, server routes)
- [x] Review database migration patterns
- [ ] Identify MCP server integration points
- [ ] Map CI/CD pipelines that must be preserved

Found patterns:
- @package.json - NPM package publishes CLI from npx-cli/bin/cli.js (discovered 14:47)
- @local-build.sh - Builds frontend + Rust, packages into npx-cli/dist/ (discovered 14:48)
- @crates/server/src/routes/frontend.rs - Serves frontend from embedded assets (discovered 14:49)
- @crates/server/src/routes/mod.rs - Router serves frontend at /* and API at /api/* (discovered 14:50)
- @.github/workflows/pre-release.yml - Auto version bump + GitHub release workflow (discovered 14:51)
- @.github/workflows/publish.yml.disabled - NPM publish from release assets (discovered 14:47)
- @Makefile - Orchestrates publish pipeline with GitHub Actions (discovered 14:52)
- @crates/db/migrations/ - SQLx migrations in crates/db/migrations/ (discovered 14:53)

Early stop: Achieved - all critical patterns identified
</context_gathering>

## STATED REQUIREMENTS
(Extracted from user's request)
- REQ-1: Keep upstream vibe-kanban as untouched git submodule
- REQ-2: Maintain our own backend (copy of upstream + our modifications) in same repo
- REQ-3: Build new frontend from scratch while keeping upstream frontend accessible
- REQ-4: Both frontends must work with our modified backend
- REQ-5: Easy upstream consumption - just update submodule when needed
- REQ-6: Upstream frontend accessible at `/legacy` route for comparison
- REQ-7: New frontend at `/` or `/app` route
- REQ-8: Shared TypeScript types between both frontends
- REQ-9: Our backend includes: Omni notifications, branch templates, Genie/Claude agents
- REQ-10: Preserve npm publishing and MCP server capabilities
- REQ-11: Must not break existing npm package publishing automations

## EXPLORATION NEEDED
(Discovered during investigation)

### Critical Path Analysis
- **Publishing Automation**: NPM publishes CLI wrapper that downloads platform-specific binaries
- **Current Routing**: Rust server embeds frontend assets and serves at /* with API at /api/*
- **Database Migrations**: SQLx migrations in crates/db/migrations/ - need strategy for dual sources

### Architectural Insights Discovered
- **Frontend Serving**: Currently embedded in Rust binary via rust-embed (frontend/dist)
- **MCP Integration**: CLI serves as MCP server when run with --mcp flag
- **Build Pipeline**: local-build.sh creates platform-specific packages in npx-cli/dist/
- **Version Management**: Synchronized across package.json, Cargo.toml files, and frontend/package.json

## SUCCESS CRITERIA
(Initial criteria based on requirements)
✅ SC-1: Can update upstream with `cd upstream && git pull` without conflicts
✅ SC-2: Both frontends run simultaneously for A/B comparison
✅ SC-3: Our backend modifications don't conflict with upstream updates
✅ SC-4: New frontend can be built independently without touching upstream
✅ SC-5: Can split from upstream completely at any time if needed
✅ SC-6: NPM publishing continues to work without changes

## TECHNICAL DECISIONS NEEDED

### DEC-1: How to route between two frontends?
**Options:**
- **A) Rust router modification** - Extend current router to serve legacy from submodule
- **B) Nginx proxy** - External routing layer (complex for local dev)
- **C) Dual server processes** - Run two servers on different ports

**Recommendation**: Option A - Modify Rust router to:
- Serve new frontend at `/` from `frontend/dist`
- Serve upstream frontend at `/legacy` from `upstream/frontend/dist`
- Keep API at `/api/*` unchanged

### DEC-2: Backend Architecture - How to integrate with upstream?
**Decision**: COMPOSITION PATTERN (Confirmed 15:10)

**Architecture:**
```
├── upstream/                    # Git submodule (NEVER modify)
├── forge-extensions/           # Your ADDITIONS (new features)
├── forge-overrides/           # Your REPLACEMENTS (when conflicts)
├── forge-app/                 # Main app that assembles everything
```

**Implementation:**
```rust
// Compose upstream with your extensions
pub struct ForgeTaskService {
    upstream: upstream::TaskService,  // Use their service
    omni: OmniService,                // Add your services
}

impl ForgeTaskService {
    // Route to upstream when appropriate
    pub async fn get_task(&self, id: i64) -> Result<Task> {
        self.upstream.get_task(id).await
    }

    // Override when needed
    pub async fn create_task(&self, data: CreateTask) -> Result<Task> {
        let task = self.upstream.create_task(data).await?;
        self.add_forge_extensions(&task).await?;
        Ok(task)
    }

    // Add v2 methods for different behavior
    pub async fn create_task_v2(&self, data: EnhancedCreateTask) -> Result<Task> {
        // Completely different implementation
    }
}
```

**Benefits:**
- Zero conflicts on upstream merge
- Clear code boundaries
- Runtime choice of implementation
- Easy to understand and maintain

### DEC-3: How to handle database migrations from both upstream and our changes?
**Options:**
- **A) Separate migration directories** - Run upstream then forge migrations
- **B) Unified migrations** - Copy and renumber all migrations
- **C) Schema branching** - Separate schemas for upstream vs forge tables

**Decision**: AUXILIARY TABLES PATTERN (Enhanced Option A)
**User Directive**: "Rather have auxiliary tables than migrating their structure"

**Implementation**:
```sql
-- Upstream tables remain untouched (tasks, projects, etc.)
-- Forge extensions in auxiliary tables with foreign keys
CREATE TABLE forge_task_extensions (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    branch_template TEXT,
    omni_settings JSONB,
    genie_metadata JSONB
);

CREATE TABLE forge_project_settings (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    custom_executors JSONB,
    forge_config JSONB
);
```

**Benefits**:
- Zero conflicts with upstream schema changes
- Can maintain this pattern indefinitely
- Clean separation of concerns
- Easy to remove forge features if needed

### DEC-4: Port allocation strategy for running both frontends?
**Decision**: Not needed if using Rust router (DEC-1 Option A)
- Single server serves both frontends on same port
- Development: FRONTEND_PORT serves everything
- Production: Single binary with both embedded

### DEC-5: How to preserve npm publishing while restructuring?
**Analysis**: Current structure can remain unchanged:
- Keep `npx-cli/` in root
- Keep `package.json` in root
- Binaries built from `/backend` instead of `/crates`
- No changes needed to publish workflow

## NEVER DO
(Constraints from user)
❌ ND-1: Don't modify any files inside /upstream
❌ ND-2: Don't create complex proxy layers initially
❌ ND-3: Don't break existing CI/CD pipelines
❌ ND-4: Don't lose npm publishing capability
❌ ND-5: Don't make it hard to split from upstream later

## CONFIRMED DECISIONS
- DEC-1: Use Rust router modification to serve both frontends (confirmed 15:02)
- DEC-2: Use Composition Pattern for backend architecture (confirmed 15:10)
- DEC-3: Use auxiliary tables pattern for database extensions (confirmed 15:02)
- DEC-4: Single port strategy via Rust router (confirmed by DEC-1)
- DEC-5: Keep npm publishing unchanged (confirmed 14:58)

## INVESTIGATION LOG
- [14:45] Document created from user request
- [14:45] Starting context gathering for npm publishing and build patterns...
- [14:47] Found npm publishing structure - CLI wrapper approach
- [14:48] Discovered build pipeline - frontend embedded in Rust binary
- [14:49] Identified routing architecture - single Rust server serves everything
- [14:52] Analyzed CI/CD workflows - GitHub Actions for releases
- [14:53] Database migrations use SQLx pattern
- [14:56] MCP server integration via CLI flag confirmed
- [14:58] Technical decision recommendations prepared
- [15:02] User confirmed Rust router and auxiliary tables pattern