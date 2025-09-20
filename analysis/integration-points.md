# Integration Points & Dependency Chain Analysis

## Executive Summary

This analysis maps the integration touchpoints where automagik-forge extends the upstream vibe-kanban architecture, documenting dependency chains and identifying critical vs. optional customizations for merge optimization planning.

**Key Finding**: Fork implements 4 major integration layers with 7 critical dependency chains that must be preserved during upstream merges.

## Fork Extension Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 Automagik Forge Extensions                  │
├─────────────────────────────────────────────────────────────┤
│  🧞 Genie Layer    │  🔔 Omni Layer    │  🎨 Theme Layer    │
│  (.claude/*)       │  (omni/*)         │  (forge-*)         │
├─────────────────────────────────────────────────────────────┤
│              🔧 Configuration Extensions (v7)               │
├─────────────────────────────────────────────────────────────┤
│                   🗄️ Database Extensions                    │
│                  (branch_template fields)                   │
├─────────────────────────────────────────────────────────────┤
│                  📦 Build System Extensions                 │
│               (npm packaging, CI/CD, MCP)                   │
├─────────────────────────────────────────────────────────────┤
│                    🎯 Upstream Core System                  │
│              (vibe-kanban base functionality)               │
└─────────────────────────────────────────────────────────────┘
```

## Critical Integration Points

### 🔴 1. Configuration System Integration (HIGH PRIORITY)

**Integration Point**: `crates/services/src/services/config/versions/v7.rs`

**Dependency Chain**:
```
Config v7 → OmniConfig → Notification System → UI Integration
           ↓
         Task Model → Branch Templates → MCP Server
```

**Files Involved**:
- `crates/services/src/services/config/versions/v7.rs` (116 lines)
- `crates/services/src/services/omni/types.rs` (189 lines)
- `shared/types.ts` (TypeScript types)

**Integration Strategy**:
- Omni configuration embedded directly in v7 config
- Single source of truth for OmniConfig type
- Backward compatibility with v6 maintained

**Merge Risk**: **HIGH** - Config system changes require careful schema migration

---

### 🔴 2. Database Schema Extensions (HIGH PRIORITY)

**Integration Point**: Task model with branch template support

**Dependency Chain**:
```
DB Migration → Task Model → Task API → Frontend UI → User Features
    ↓
MCP Server → External Integrations
```

**Files Involved**:
- `crates/db/migrations/20250903172012_add_branch_template_to_tasks.sql`
- `crates/db/src/models/task.rs` (35 line changes)
- `crates/db/src/models/task_attempt.rs` (68 line changes)
- Multiple SQLx query metadata files

**Integration Strategy**:
- Added `branch_template` field to tasks table
- Extended task model with template functionality
- Preserved upstream task core functionality

**Merge Risk**: **CRITICAL** - Schema conflicts require coordination

---

### 🔴 3. API Route Extensions (HIGH PRIORITY)

**Integration Point**: REST API with Omni endpoints and task enhancements

**Dependency Chain**:
```
API Router → Route Modules → Service Layer → Frontend Client
     ↓
MCP Server → External Tool Integration
```

**Files Involved**:
- `crates/server/src/routes/mod.rs` (omni router integration)
- `crates/server/src/routes/omni.rs` (150 lines, NEW)
- `crates/server/src/routes/tasks.rs` (branch template support)
- `frontend/src/lib/api.ts` (client integration)

**Integration Strategy**:
- New `/api/omni/*` endpoint namespace
- Extended existing task endpoints
- Maintained API backward compatibility

**Merge Risk**: **HIGH** - API changes affect client-server contract

---

### 🟡 4. MCP Server Integration (MEDIUM PRIORITY)

**Integration Point**: Model Context Protocol server customization

**Dependency Chain**:
```
.mcp.json → MCP Server → Task Server → External Agents
    ↓
Forge CLI → NPX Package → User Workflow
```

**Files Involved**:
- `.mcp.json` (forge-specific MCP config)
- `crates/server/src/mcp/task_server.rs`
- `npx-cli/` directory (complete CLI package)

**Integration Strategy**:
- Automagik Forge as MCP server
- Custom tool integration
- NPX package distribution

**Merge Risk**: **MEDIUM** - MCP interface evolution in both codebases

---

### 🟡 5. Executor System Extensions (MEDIUM PRIORITY)

**Integration Point**: AI executor enhancements and configuration

**Dependency Chain**:
```
Executor Profiles → Codex/Gemini Executors → Container Deployment
                                            ↓
                                    Task Execution Engine
```

**Files Involved**:
- `crates/executors/src/executors/codex.rs` (22 line changes)
- `crates/executors/src/executors/gemini.rs`
- `crates/executors/default_mcp.json`
- `crates/local-deployment/src/container.rs` (77 line changes)

**Integration Strategy**:
- Enhanced executor implementations
- Custom MCP tool selection
- Container deployment improvements

**Merge Risk**: **MEDIUM** - Both sides evolving executor capabilities

---

### 🟢 6. Frontend Theme Integration (LOW PRIORITY)

**Integration Point**: UI theming and branding system

**Dependency Chain**:
```
Theme Provider → Component Styling → Asset Loading → User Experience
                      ↓
              Logo Component → Branding Assets
```

**Files Involved**:
- `frontend/src/components/theme-provider.tsx`
- `frontend/src/components/logo.tsx`
- `frontend/src/styles/index.css` (719 line changes)
- `frontend/public/forge-*` assets

**Integration Strategy**:
- Extended theme system for custom branding
- Asset replacement strategy
- CSS customization overlay

**Merge Risk**: **LOW** - Mostly additive theming changes

---

### 🟢 7. Build System Integration (LOW PRIORITY)

**Integration Point**: NPM packaging and CI/CD customization

**Dependency Chain**:
```
Package.json → Build Scripts → CI Workflows → Distribution
     ↓
NPX CLI → User Installation → Runtime Integration
```

**Files Involved**:
- `package.json` (automagik-forge branding)
- `.github/workflows/` (custom workflows)
- `Makefile` (142 lines, NEW)
- `local-build.sh` (modifications)

**Integration Strategy**:
- Preserved npm publishing capability
- Custom build automation
- Maintained CLI distribution

**Merge Risk**: **LOW** - Build system can be maintained separately

## Dependency Matrix

| Extension | Config v7 | DB Schema | API Routes | MCP | Executors | Themes | Build |
|-----------|-----------|-----------|------------|-----|-----------|--------|-------|
| **Omni System** | ✅ Core | ❌ None | ✅ Core | ⚠️ Optional | ❌ None | ✅ UI | ❌ None |
| **Branch Templates** | ⚠️ Optional | ✅ Core | ✅ Core | ✅ Integration | ❌ None | ✅ UI | ❌ None |
| **Genie System** | ❌ None | ❌ None | ❌ None | ✅ Core | ❌ None | ✅ Branding | ✅ CLI |
| **Theme Customization** | ✅ Storage | ❌ None | ❌ None | ❌ None | ❌ None | ✅ Core | ✅ Assets |

**Legend**: ✅ Core dependency | ⚠️ Optional integration | ❌ No dependency

## Critical vs Optional Customizations

### 🔴 CRITICAL (Must Preserve)
1. **Omni Notification System** - Core user-facing feature
2. **Branch Template Functionality** - Database schema dependency
3. **Config v7 System** - Configuration architecture
4. **Task Model Extensions** - API compatibility requirement

### 🟡 IMPORTANT (Should Preserve)
1. **MCP Server Customization** - External integration capability
2. **Executor Enhancements** - Performance improvements
3. **API Route Extensions** - Frontend functionality

### 🟢 OPTIONAL (Can Modify)
1. **Theme/Branding Assets** - Can be reapplied post-merge
2. **Build System Customization** - Independent of core functionality
3. **Documentation/README** - Can be regenerated

## Refactoring Opportunities

### 1. **Modularize Omni System**
```rust
// Current: Embedded in config v7
// Proposed: Feature-flagged module
#[cfg(feature = "omni")]
pub mod omni_integration;
```

### 2. **Extract Branch Templates**
```rust
// Current: Mixed in task model
// Proposed: Trait-based extension
trait BranchTemplateExt {
    fn with_template(&self, template: String) -> Self;
}
```

### 3. **Plugin Architecture for Extensions**
```rust
// Proposed: Plugin system for fork features
pub trait ForgeExtension {
    fn register_routes(&self) -> Router;
    fn extend_config(&self) -> ConfigExtension;
}
```

## Merge Optimization Strategies

### 1. **Layer-Based Merge Strategy**
1. **Foundation Layer**: Merge upstream core changes first
2. **Extension Layer**: Re-apply fork-specific features
3. **Integration Layer**: Reconnect dependency chains
4. **Validation Layer**: Test all integration points

### 2. **Dependency-First Approach**
1. **Critical Dependencies**: Config v7, Database schema
2. **Core Dependencies**: API routes, MCP integration
3. **UI Dependencies**: Frontend components, themes
4. **Build Dependencies**: CI/CD, packaging

### 3. **Feature Flag Strategy**
```rust
// Enable gradual feature rollout during merge
#[cfg(feature = "forge-extensions")]
mod automagik_extensions;

// Runtime configuration
if deployment.config.enable_fork_features {
    router = router.merge(omni::router());
}
```

## Risk Mitigation

### High-Risk Mitigation
- **Database Schema**: Coordinate migration scripts with upstream
- **API Compatibility**: Maintain versioned API endpoints
- **Type System**: Use feature-gated type extensions

### Medium-Risk Mitigation
- **MCP Integration**: Abstract MCP interface for compatibility
- **Executor System**: Plugin-based executor architecture
- **Configuration**: Backward-compatible config versioning

### Low-Risk Mitigation
- **Theme System**: CSS-only overlay approach
- **Build System**: Separate forge-specific build scripts
- **Documentation**: Automated regeneration tooling

## Monitoring & Validation

### Integration Health Checks
1. **Config Migration**: Verify v7 config backward compatibility
2. **Database Integrity**: Validate schema migration success
3. **API Contract**: Test all endpoint backward compatibility
4. **MCP Connectivity**: Verify external tool integration
5. **UI Functionality**: Test all fork-specific features

### Automated Testing Strategy
```bash
# Pre-merge validation
npm run test:integration:omni
npm run test:api:compatibility
npm run test:db:migration
npm run test:mcp:connectivity

# Post-merge validation
npm run test:fork:features
npm run test:upstream:regression
```

---
*Generated: 2025-09-19*
*Analysis Branch: analysis/merge-optimization-foundation-1481*