---
description: "Workflow for updating the Supabase database schema using Drizzle ORM and synchronizing with the Rust backend"
---

# Database Schema Update Workflow

Use this workflow whenever you need to add a new table, add a column, or change a constraint in the database.

## 1. Update TypeScript Schema
Act as a TypeScript Developer.
- [ ] Modify `vibe-backend/schema/schema.pg.ts` to include your changes.
- [ ] Ensure all types (uuid, text, timestamp, etc.) are correct for Postgres.
- [ ] Add necessary indexes or `uniqueIndex` if the column will be used in `ON CONFLICT` clauses.

## 2. Sync with Supabase (Push) // turbo
Directly apply changes to the Supabase Postgres instance.
- [ ] Run the push command:
  ```bash
  cd vibe-backend/schema
  DATABASE_URL="$(grep DATABASE_URL ../.env | cut -d '=' -f2- | tr -d '\"')" npx drizzle-kit push:pg
  ```

## 3. Update Rust Models
Act as a Rust Engineer.
- [ ] Open the corresponding model in `vibe-backend/crates/db/src/models/`.
- [ ] Add/update the struct fields to match your Drizzle schema.
- [ ] Update the `sqlx::query!` or `sqlx::query_as!` macros to include the new columns.
- [ ] **Crucial**: If using `INSERT ... ON CONFLICT`, ensure the columns in `SET` are qualified (e.g., `id = table_name.id`).

## 4. Verification // turbo
Verify that the code and database are in sync.
- [ ] Run a compile check. `sqlx` will validate your queries against the live Supabase schema:
  ```bash
  cd vibe-backend
  DATABASE_URL="$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '\"')" cargo check
  ```

## 5. Deployment Trigger
- [ ] Commit your changes to `main` (or merge your feature branch).
- [ ] The GitHub Actions pipeline will build the new backend image and deploy it to Railway.
- [ ] **Reminder**: Ensure the `DATABASE_URL` in Railway Settings matches your Supabase URL.
