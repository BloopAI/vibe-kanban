The filesystem storage for documents feature is complete. Here's a summary:

  Completed Changes

1. Created DocumentStorageService (crates/services/src/services/document_storage.rs)

- Handles reading, writing, and deleting document files on the filesystem
- Documents stored at dev_assets/documents/{team_id}/{document_id}.{ext}
- Supports markdown files with proper MIME types

2. Updated Document Model (crates/db/src/models/document.rs)

- Added #[serde(default)] to team_id in CreateDocument and CreateDocumentFolder so API clients don't need to provide it (it's already in the URL path)

3. Updated Document Routes (crates/server/src/routes/documents.rs)

- CREATE: Writes content to filesystem, stores file path metadata in DB
- READ: Loads content from filesystem based on file_path
- UPDATE: Updates file content on filesystem
- DELETE: Removes file from filesystem before deleting DB record
- Fixed Axum path extraction issues for routes with multiple path parameters

4. All API Operations Tested:

- ✓ List documents (content loaded from files)
- ✓ Get single document (content loaded from file)
- ✓ Create document (writes file, stores path in DB)
- ✓ Update document (updates file content)
- ✓ Delete document (deletes file and DB record)

5. Both backend and frontend checks pass

  The commit is on branch feature/96d1f9bc and ready to be merged to main.
