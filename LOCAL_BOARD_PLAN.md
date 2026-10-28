# Local board implementation

Goal: projects and tasks work on this Mac without signing in. Existing cloud data and authentication remain intact.

Architecture: additive SQLite tables, local API under `/api/local-boards`, and a local-only React page. The existing origin and relay signature middleware also protects the new API. No cloud calls or agent execution are needed for board operations.

- [x] Add a failing HTTP acceptance test for unauthenticated CRUD, project isolation, validation, and persistence.
- [x] Add the SQLite migration and API. Use bound SQL parameters, UUID paths, status validation, title limits, and scoped task updates/deletes.
- [x] Add a local board page using the existing design system, with project creation/rename/delete, task creation/edit/delete, and status changes by dragging or keyboard-accessible selection.
- [x] Link the local board from the desktop sidebar without changing cloud sign-in behavior.
- [x] Run acceptance tests, frontend type checks/build, formatting, and review the diff.
- [x] Rebuild and sign the macOS app; verify creating a task and persistence after restart; package the ZIP.

Contract: GET/POST `/api/local-boards`; PUT/DELETE `/api/local-boards/{board_id}`; GET/POST `/api/local-boards/{board_id}/tasks`; PUT/DELETE `/api/local-boards/{board_id}/tasks/{task_id}`. Responses use the existing `ApiResponse` envelope. Board fields: id, name. Task fields: id, board_id, title, description, status. Status values: todo, inprogress, inreview, done, cancelled. Deleting a board removes only its local tasks. Empty/oversize names and titles are rejected; missing records return 404. Task text is rendered through React, never HTML.

Verification: HTTP acceptance test passed against the packaged app without cookies or tokens. Created a project and task through the native UI, moved the task using keyboard drag-and-drop, fully quit and restarted the app, then verified the same project, task, description and status through the API. The test card was removed; the project remains. Frontend TypeScript check, focused ESLint checks, formatting, production web build, release Tauri build, and archive signature verification passed. The build retains an existing unused_mut warning in remote_client.rs and existing Vite/Tailwind warnings. Auto-update and native notifications remain unavailable in the local unsigned distribution. No Codex binary or macOS security settings were changed.
