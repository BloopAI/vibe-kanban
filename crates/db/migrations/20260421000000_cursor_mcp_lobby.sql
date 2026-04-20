-- Cursor MCP "lobby" / inbox table.
--
-- v4 model: a single global `vibe-kanban-mcp --mode cursor-bridge` process
-- can be configured ONCE in `~/.cursor/mcp.json`. Every Composer chat
-- creates a free-floating Cursor MCP conversation that lives here in the
-- lobby until the user explicitly creates a vibe-kanban workspace from it.
--
-- Rows are upserted by `bridge_session_id` (the friendly LLM-supplied id
-- like `ab12-cd34`). When the user adopts a lobby entry into a workspace,
-- `adopted_into_session_id` is set to the new vk session UUID and the
-- backend then routes future `wait_for_user_input` calls with the same
-- `bridge_session_id` directly to that vk session — bypassing the lobby.
--
-- Bridge connections themselves are not persisted: the `bridges` table
-- stays in-memory inside the service, and dies with the backend process.

CREATE TABLE cursor_mcp_lobby_sessions (
    bridge_session_id        TEXT       PRIMARY KEY,
    -- Free-form label captured from the bridge on first contact (e.g.
    -- `<hostname> · <cwd>`). Helps the picker disambiguate which Cursor
    -- window / machine produced the conversation.
    bridge_label             TEXT,
    -- Optional title hint passed by the LLM on the first wait call.
    title                    TEXT,
    -- First assistant message (truncated) shown in the picker as preview.
    first_message            TEXT,
    -- Last seen activity for "stale" indicators. Updated on every wait.
    -- (Stored as ISO-8601 TEXT; the column type hint is informational —
    -- sqlite's type system is dynamic.)
    last_activity_at         TIMESTAMPTZ NOT NULL DEFAULT (datetime('now')),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT (datetime('now')),
    -- When non-NULL, this lobby entry has been "adopted" into a vk
    -- session. Subsequent waits with the same bridge_session_id route
    -- there and never re-touch this row. Kept (not deleted) for
    -- auditing.
    --
    -- We intentionally do NOT add a FK to `sessions(id)` here — the
    -- workspace-delete path calls `CursorMcpService::forget_vk_session`
    -- which only clears the in-memory routing. The DB row keeps the
    -- stale id as an audit breadcrumb. Application-level validation in
    -- `adopt_lobby_session` (see `routes/cursor_mcp.rs`) ensures the
    -- `vk_session_id` existed at adoption time.
    adopted_into_session_id  BLOB
);

CREATE INDEX idx_cursor_mcp_lobby_unadopted
    ON cursor_mcp_lobby_sessions (last_activity_at DESC)
    WHERE adopted_into_session_id IS NULL;
