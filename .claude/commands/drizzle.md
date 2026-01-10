---
allowed_tools:
  - "Bash(npm:*)"
  - "Bash(ls:*)"
  - "Bash(cat:*)"
  - "Bash(cargo:*)"
  - "Bash(git:*)"
  - "Read(*)"
  - "Edit(*)"
  - "Write(*)"
  - "Glob(*)"
  - "TodoWrite"
---

# Drizzle Database Schema Management

Manage database schema changes using Drizzle ORM.

**Action:** $ARGUMENTS

---

## Paths

| Item | Path |
|------|------|
| Schema File | `/Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/schema/schema.pg.ts` |
| Drizzle Config | `/Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/schema/drizzle.config.ts` |
| Migrations Dir | `/Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/drizzle/` |
| SQLx Cache | `/Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/crates/db/.sqlx/` |

---

## Available Actions

### 1. `generate` - Generate Migration

Generate a new migration from schema changes:

```bash
cd /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/schema
npm run generate
```

Then list new migration files:
```bash
ls -la /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/drizzle/
```

### 2. `introspect` - Pull Schema from Database

Pull current database schema into Drizzle:

```bash
cd /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/schema
npm run introspect
```

### 3. `show` - Show Current Schema

Read and display the current schema file:
```
Read: /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/schema/schema.pg.ts
```

### 4. `migrations` - List Migrations

List all migration files:
```bash
ls -la /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/drizzle/*.sql
```

### 5. `add <table_name>` - Add New Table

Help user add a new table to the schema with proper Drizzle syntax.

### 6. `sqlx` - Update SQLx Cache

After applying migrations, update the Rust SQLx cache:

```bash
cd /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/crates/db
cargo sqlx prepare
```

---

## Full Schema Change Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                 DATABASE SCHEMA CHANGE WORKFLOW                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Edit Schema    →  2. Generate     →  3. Review SQL         │
│     (schema.pg.ts)     Migration          (drizzle/*.sql)      │
│                                                                 │
│  4. Apply to DB   →  5. Update SQLx  →  6. Commit All          │
│     (Supabase)        Cache              Files                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Step-by-Step:

1. **Edit schema.pg.ts** with your changes
2. **Generate migration:** `npm run generate`
3. **Review** the generated SQL in `drizzle/` directory
4. **Apply migration** to Supabase (Dashboard SQL Editor)
5. **Update SQLx cache:** `cargo sqlx prepare`
6. **Commit** both Drizzle migrations AND SQLx cache files

---

## Drizzle Schema Patterns

### Create Table

```typescript
import { pgTable, uuid, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const myTable = pgTable("my_table", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  count: integer("count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});
```

### Add Foreign Key

```typescript
export const childTable = pgTable("child_table", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  parentId: uuid("parent_id").notNull().references(() => parentTable.id, { onDelete: "cascade" }),
  // ...
});
```

### Add Index

```typescript
export const myTable = pgTable("my_table", {
  // columns...
}, (table) => ({
  nameIdx: index("idx_my_table_name").on(table.name),
  compositeIdx: index("idx_my_table_composite").on(table.field1, table.field2),
}));
```

### Add Enum

```typescript
import { pgEnum } from "drizzle-orm/pg-core";

export const statusEnum = pgEnum("status", ['pending', 'active', 'completed']);

export const myTable = pgTable("my_table", {
  status: statusEnum("status").default('pending'),
  // ...
});
```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Migration not generated | Check `drizzle.config.ts` points to correct schema file |
| SQLx cache outdated | Run `cargo sqlx prepare` after applying migration |
| Type mismatch in Rust | Ensure SQLx types match: `DateTime<Utc>` -> `TIMESTAMPTZ`, `Uuid` -> `UUID` |
| Foreign key error | Ensure referenced table exists before creating FK |

---

## Quick Commands

```bash
# Generate migration
cd /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/schema && npm run generate

# List migrations
ls -la /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/drizzle/*.sql

# Update SQLx cache
cd /Users/rupeshpanwar/Documents/Projects/iKanban/vibe-backend/crates/db && cargo sqlx prepare

# Commit schema changes
git add vibe-backend/drizzle/ vibe-backend/crates/db/.sqlx/
```
