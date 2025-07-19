# Build Instructions for Image Support Feature

## Prerequisites
- Rust toolchain installed
- Node.js and pnpm installed
- SQLx CLI installed (`cargo install sqlx-cli`)

## Backend Build Steps

1. **Prepare the database** (generates SQLx compile-time checks):
   ```bash
   npm run prepare-db
   ```

2. **Build the backend**:
   ```bash
   cd backend
   cargo build
   ```

## Frontend Build Steps

1. **Generate TypeScript types from Rust** (if not already done):
   ```bash
   pnpm generate-types
   ```

2. **Build the frontend**:
   ```bash
   cd frontend
   npm run build
   ```

## Full Build

Run from the project root:
```bash
pnpm build
```

## Potential Build Issues and Fixes

### Backend Issues:
1. **Missing base64 import**: Already fixed by adding `use base64::Engine;` in `backend/src/routes/tasks.rs`
2. **SQLx compile errors**: Run `npm run prepare-db` to regenerate the `.sqlx` cache with the new migration

### Frontend Issues:
1. **Missing type imports**: Already fixed by adding `TaskAttachmentUpload` to imports in `frontend/src/lib/api.ts`
2. **React hook dependencies**: Already fixed by adding `navigate` to the dependency array in `handleCreateAndStartTask`

## Testing the Build

After successful build:
1. Run `pnpm dev` to start both frontend and backend
2. Create a new task with images attached
3. Verify that Claude Code receives the image file paths in the prompt

## Notes
- The `task_attachments` table migration needs to be applied to the database
- Images are stored as BLOB in SQLite, which may increase database size
- Temporary image files are created in the system temp directory when executing tasks