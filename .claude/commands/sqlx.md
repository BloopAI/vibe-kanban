Regenerate SQLx cache after schema changes.

Steps:
1. cd vibe-backend/crates/db
2. cargo sqlx prepare
3. git add .sqlx/
4. Report result

Do not explore the codebase.
