# Database Migration & Type Safety Rules

This document outlines critical learnings and rules for migrating from SQLite to Postgres and maintaining type safety in the Rust backend.

## 1. Postgres Strict Typing
Postgres is significantly stricter than SQLite. Naive string-based approaches will fail at compile time or runtime.

### Timestamps
- **Rule**: All `DateTime<Utc>` fields in Rust must map to `TIMESTAMPTZ` in Postgres.
- **Drizzle**: Use `timestamp("col", { withTimezone: true })`.
- **Reasoning**: Standard `timestamp` without timezone in Postgres does not satisfy the `sqlx` trait bounds for `DateTime<Utc>`.

### Integers and BigInt
- **Rule**: Use `bigint` for any field that maps to `i64` in Rust (e.g., file sizes, PR numbers, bitmasks).
- **Drizzle**: Use `bigint("col", { mode: "number" })` or `bigint("col", { mode: "bigint" })`.
- **Reasoning**: Postgres `integer` is a 32-bit signed integer (`i32`). Attempting to map it to `i64` will cause `sqlx` type mismatches.

### Booleans
- **Rule**: Use the native `boolean` type in Postgres.
- **Drizzle**: Use `boolean("col")`.
- **Reasoning**: SQLite often uses `0/1` integers for booleans, which are incompatible with Postgres's strict boolean type.

## 2. SQLx Macro Best Practices
To ensure `sqlx` macros validate correctly, follow these patterns:

### Explicit Casting
Always cast parameters that have ambiguous types or complex mappings:
```rust
sqlx::query!("DELETE FROM table WHERE id = $1::uuid", id)
```

### Type Hints in RETURNING
Use explicit type hints in query macros to assist the compiler:
```rust
sqlx::query_as!(
    Model,
    r#"SELECT id as "id!: Uuid", 
              created_at as "created_at!: DateTime<Utc>"
       FROM table"#
)
```

## 3. Enum Handling
- **Rule**: Implement `std::fmt::Display` for enums stored as `TEXT`.
- **Practice**: Use `status.to_string()` when passing enums as arguments to `sqlx::query!`.
- **Reasoning**: This provides a clean conversion from the domain model to the database layer without relying on implicit trait magic that might fail across different drivers.

## 4. Schema Evolution
- **Rule**: If fundamental type changes occur (e.g., changing a column from `integer` to `uuid`), a clean schema wipe may be necessary on the development/staging environment.
- **Command**: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
- **Reasoning**: Postgres auto-casting is limited. When types are fundamentally incompatible, manual migration or a fresh push is safer than "naive" increments.
