# Lessons Learned - Critical Incidents

This document captures critical lessons from past incidents to prevent future mistakes.

---

## Incident: VIB-70 SQLx Migration Disaster (2026-01-04)

### What Happened

While working on VIB-70 (project member allocation), multiple critical mistakes were made that caused hours of debugging and data loss:

1. **Modified an existing migration file** instead of creating a new one
2. **Fixed the wrong database** - spent hours fixing `~/Library/Application Support/` when dev mode uses `dev_assets/db.sqlite`
3. **Deleted database multiple times** causing data loss
4. **Renamed migration file** which made things worse (VersionMissing vs VersionMismatch errors)

### Root Causes

#### 1. Modifying Existing Migration Files

**NEVER modify an existing migration file.** SQLx embeds migration checksums at compile time. If you modify a migration:
- The checksum in the compiled binary won't match the file on disk
- You get `VersionMismatch` errors
- The only "fix" is deleting the database or complex manual repairs

**Correct approach:** Always create a NEW migration file to alter tables:
```sql
-- 20260105000000_fix_project_members.sql (NEW FILE)
ALTER TABLE project_members ADD COLUMN new_field TEXT;
-- or recreate table with new schema
```

#### 2. Not Understanding Dev vs Release Database Paths

In this project, the database location depends on build mode:

| Build Mode | Database Location |
|------------|-------------------|
| **Debug** (`cargo build`) | `dev_assets/db.sqlite` |
| **Release** (`cargo build --release`) | `~/Library/Application Support/ai.bloop.vibe-kanban/db.sqlite` |

This is defined in `crates/utils/src/assets.rs`:
```rust
pub fn asset_dir() -> std::path::PathBuf {
    if cfg!(debug_assertions) {
        // Debug mode - uses dev_assets/
        std::path::PathBuf::from(PROJECT_ROOT).join("../../dev_assets")
    } else {
        // Release mode - uses Application Support
        ProjectDirs::from("ai", "bloop", "vibe-kanban")...
    }
}
```

**Always verify which database you're working with!**

#### 3. Database Shared Across Git Branches

The `dev_assets/db.sqlite` file is NOT in `.gitignore` and persists across branch switches. This causes problems:

- Branch A creates migration 123 → runs → recorded in db
- Switch to Branch B (doesn't have migration 123)
- Backend fails: `VersionMissing(123)`

**Solutions:**
- Use separate databases per feature branch, OR
- Before switching branches, note what migrations were added and be prepared to clean them

### How to Fix Migration Issues

#### Error: `VersionMismatch(XXXXXX)`
The migration file content changed after it was applied.

```bash
# Option 1: Remove migration record (keeps other data)
sqlite3 dev_assets/db.sqlite "DELETE FROM _sqlx_migrations WHERE version = XXXXXX;"
sqlite3 dev_assets/db.sqlite "DROP TABLE IF EXISTS <table_created_by_migration>;"

# Option 2: Start fresh (loses all data)
rm dev_assets/db.sqlite
```

#### Error: `VersionMissing(XXXXXX)`
The database has a migration recorded that doesn't exist in the codebase.

```bash
# Remove the orphaned migration record
sqlite3 dev_assets/db.sqlite "DELETE FROM _sqlx_migrations WHERE version = XXXXXX;"
sqlite3 dev_assets/db.sqlite "DROP TABLE IF EXISTS <table_created_by_migration>;"
```

#### After Fixing Database
```bash
# Rebuild to ensure clean state
cargo clean -p db -p server
pnpm run prepare-db
cargo build --bin server
make restart
```

### Prevention Checklist

Before working on database migrations:

- [ ] **NEVER modify existing migration files**
- [ ] **Always create NEW migration files for schema changes**
- [ ] **Know your database location**: `dev_assets/db.sqlite` in debug mode
- [ ] **Before switching branches**: Check `_sqlx_migrations` table for branch-specific migrations
- [ ] **Test migrations on a copy first** if unsure

### STRICT POLICY - Database Protection

**The following actions are FORBIDDEN without explicit user approval:**

| Action | Consequence |
|--------|-------------|
| `rm db.sqlite` | Session termination |
| `DROP TABLE` | Session termination |
| `DELETE FROM _sqlx_migrations` | Session termination |
| `DELETE FROM <table>` without WHERE | Session termination |

**Correct behavior when encountering database errors:**
1. **STOP** - Do not attempt to fix by deleting
2. **REPORT** - Show exact error to user
3. **ASK** - Request permission for any modification
4. **WAIT** - Let user decide

**This policy exists because:**
- VIB-70 incident: Database was deleted 3+ times causing hours of debugging
- User lost data and had to restore from backups
- Application was down for extended period due to repeated failed "fixes"

### Commands Reference

```bash
# Check which migrations are in the database
sqlite3 dev_assets/db.sqlite "SELECT version, description FROM _sqlx_migrations ORDER BY version DESC LIMIT 10;"

# Check which migration files exist
ls crates/db/migrations/ | tail -10

# Remove a specific migration record
sqlite3 dev_assets/db.sqlite "DELETE FROM _sqlx_migrations WHERE version = XXXXXX;"

# Full database reset (CAUTION: loses all data)
rm dev_assets/db.sqlite && make restart
```

---

## Template for Future Incidents

### Incident: [Title] (Date)

**What Happened:**
- Brief description

**Root Causes:**
- List of causes

**How It Was Fixed:**
- Steps taken

**Prevention:**
- What to do differently next time
