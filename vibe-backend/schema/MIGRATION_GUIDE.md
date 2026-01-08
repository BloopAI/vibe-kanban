# Migration Guide: SQLite to PostgreSQL

This guide outlines the steps to migrate the Vibe Kanban backend from a local SQLite database to a production-ready PostgreSQL instance using Drizzle ORM for schema management.

## 1. Prerequisites
-   A running PostgreSQL instance (local or remote, e.g., Railway, Supabase, Neon).
-   `DATABASE_URL` environment variable set: `postgres://user:password@host:port/dbname`

## 2. Schema Management
We use Drizzle ORM to manage the schema definition. The PostgreSQL schema is defined in `vibe-backend/schema/schema.pg.ts`.

### Setup
1.  Navigate to the schema folder:
    ```bash
    cd vibe-backend/schema
    npm install
    ```

2.  Update `drizzle.config.pg.ts` (create if missing) to point to your Postgres URL or use `schema.pg.ts` as the schema source.

### Generate & Push Schema
1.  Generate the SQL migration file:
    ```bash
    npx drizzle-kit generate:pg --schema=./schema.pg.ts
    ```
    This will create a SQL file in `drizzle/migrations`.

2.  Push the schema to your Postgres database:
    ```bash
    npx drizzle-kit push:pg --schema=./schema.pg.ts
    # Ensure DATABASE_URL is set in .env or passed explicitly
    ```

## 3. Data Migration (Optional)
If you need to preserve existing data from `db.sqlite`, you must script a transfer.
1.  Use `better-sqlite3` to read from the local file.
2.  Use `postgres` (or Drizzle) to insert into the new DB.
3.  Note: You must handle `blob` -> `uuid` string conversion if your SQLite UUIDs were stored as raw bytes.

## 4. Application Update (Critical)
The Rust backend currently uses `sqlx` with the `sqlite` feature. You must update the code to support Postgres.

### `Cargo.toml` Changes
Modify `vibe-backend/crates/db/Cargo.toml`, `vibe-backend/crates/server/Cargo.toml`, and `vibe-backend/crates/utils/Cargo.toml`:
-   Remove `sqlite` feature.
-   Add `postgres` feature to `sqlx`.

### Code Changes
-   Replace `SqlitePool` with `PgPool`.
-   Replace `Sqlite` with `Postgres` in type definitions.
-   Update any SQLite-specific SQL syntax (e.g., `INTEGER PRIMARY KEY AUTOINCREMENT` -> `SERIAL`, `Datetime('now')` -> `NOW()`).
-   Update `get_database_path()` to read `DATABASE_URL` and return a connection string string instead of a PathBuf.

## 5. Deployment
-   Set `DATABASE_URL` in your deployment environment variables.
-   Deploy the updated backend image.
