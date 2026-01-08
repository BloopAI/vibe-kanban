# SQLx Query Caching - Required for CI Builds

## Overview

This project uses **SQLx compile-time query verification**. SQLx validates SQL queries against the actual database schema at compile time, generating type-safe Rust code. For CI builds (which don't have database access), we use **offline mode** with cached query metadata.

## Architecture

The project has two database crates with different schemas:

| Crate | Location | Schema | Purpose |
|-------|----------|--------|---------|
| `db` | `crates/db/.sqlx/` | Supabase (local) | Main application database |
| `remote` | `crates/remote/.sqlx/` | Cloud multi-tenant | Shared/cloud deployment |

## When to Regenerate Cache

**REQUIRED when you:**
- Add a new `sqlx::query!()` or `sqlx::query_as!()` macro
- Modify an existing SQL query
- Change the database schema (add/remove columns, tables)
- Update `schema.pg.ts` and push to Supabase

**NOT required when:**
- Changing non-database Rust code
- Updating frontend code
- Changing configuration files

## How to Regenerate

### Step 1: Ensure Schema is Up to Date
```bash
cd vibe-backend/schema
npx drizzle-kit push:pg
```

### Step 2: Regenerate SQLx Cache for db Crate
```bash
cd vibe-backend/crates/db
cargo sqlx prepare
```

### Step 3: Commit the Updated Cache Files
```bash
git add crates/db/.sqlx/
git commit -m "chore: update sqlx query cache"
```

## CI Configuration

The CI workflow (`deploy-backend.yml`) uses `SQLX_OFFLINE=true`:

```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  SQLX_OFFLINE: true
```

This tells SQLx to use cached `.sqlx` files instead of connecting to the database.

## Troubleshooting

### Error: "relation does not exist"
- The schema doesn't match what SQLx expects
- **Fix:** Push schema changes to Supabase, then regenerate cache

### Error: "type annotations needed"
- SQLx can't infer types from cached query metadata
- **Fix:** Regenerate cache with `cargo sqlx prepare`

### Error: "no driver found for URL scheme 'postgresql'"
- sqlx-cli doesn't have Postgres feature
- **Fix:** `cargo install sqlx-cli --features postgres --no-default-features`

## Important Notes

1. **Always commit `.sqlx/` files** - they are required for CI builds
2. **Never add `.sqlx/` to `.gitignore`**
3. **Test locally before pushing** - run `cargo check` to verify queries work
4. **The `remote` crate has its own .sqlx/** - don't modify; it uses a different cloud schema
