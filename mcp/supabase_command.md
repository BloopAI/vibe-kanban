# Supabase Postgres Command Reference

This document serves as a single point of reference for all commands and configurations used during the migration from SQLite to Supabase Postgres.

## 1. Connection Details
- **Database URL**: `$DATABASE_URL`
- **Port**: `5432` (Session Pooler - Recommended for IPv4 and Prepared Statements)
- **User**: `postgres` (with `.lryuadpfdiufovqeigti` project ref prefix)

## 2. Schema Management (Drizzle Kit)
Run these commands in the `vibe-backend/schema` directory.

### Push Schema (Sync Local to Database)
```bash
DATABASE_URL="$DATABASE_URL" npx drizzle-kit push:pg
```

### Generate Migrations (Create SQL Files)
```bash
DATABASE_URL="$DATABASE_URL" npx drizzle-kit generate:pg
```

### Introspect Database (Verify Current Remote Schema)
```bash
DATABASE_URL="$DATABASE_URL" npx drizzle-kit introspect:pg
```

## 3. Backend Verification (Rust)
Run these from the `vibe-backend` directory.

### Fast Compile Check (Validation)
```bash
DATABASE_URL="$DATABASE_URL" cargo check
```

### Clean and Build (Fresh Start)
```bash
DATABASE_URL="$DATABASE_URL" cargo clean -p db && DATABASE_URL="$DATABASE_URL" cargo check
```

## 4. Troubleshooting Tools

### List Tables (Quick Check)
```bash
node schema/check_tables.js
```
*(Or use the Python utility provided in `/mcp/supabase_db_util.py`)*

### Common Error: Ambiguous Columns
In Postgres `ON CONFLICT` clauses, if you see `ambiguous column "id"`, qualify the update with the table name:
```sql
DO UPDATE SET id = table_name.id
```

### Common Error: ORDER BY in SELECT DISTINCT
If you see `ORDER BY expressions must appear in select list`, refactor the query to use `GROUP BY`:
```sql
-- Before (Often works in SQLite, fails in Postgres)
SELECT DISTINCT project_id FROM tasks ORDER BY updated_at DESC;

-- After (Postgres Compatible)
SELECT project_id FROM tasks GROUP BY project_id ORDER BY MAX(updated_at) DESC;
```
