## Changelog

### [Unreleased]

- feat(mcp): Add support for returning attempt notes via MCP `get_task` when `include_attempts: true` is passed. The tool now fetches `/api/tasks/{id}/attempts-with-notes` and includes a condensed attempts array in the response.
- feat(api): Add `GET /api/tasks/{task_id}/attempts-with-notes` to return attempts with the latest executor session summary for each attempt.
- chore(mcp): Remove temporary debug logs added during investigation; retain conditional `include_attempts` behavior.

Notes:
- These changes help agents coordinate by exposing per-attempt notes (e.g., Gemini’s “GEMINI.md is missing”).
- No breaking changes to existing endpoints or tools; calling `get_task` without `include_attempts` returns the same task shape as before.


