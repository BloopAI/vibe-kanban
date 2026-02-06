-- Create meeting tables for refinement meeting persistence

-- refinement_meetings table
CREATE TABLE refinement_meetings (
    id         BLOB PRIMARY KEY,
    project_id BLOB NOT NULL,
    title      TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_refinement_meetings_project_id ON refinement_meetings(project_id);
CREATE INDEX idx_refinement_meetings_status ON refinement_meetings(status);

-- meeting_messages table
CREATE TABLE meeting_messages (
    id         BLOB PRIMARY KEY,
    meeting_id BLOB NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (meeting_id) REFERENCES refinement_meetings(id) ON DELETE CASCADE
);

CREATE INDEX idx_meeting_messages_meeting_id ON meeting_messages(meeting_id);

-- meeting_outputs table
CREATE TABLE meeting_outputs (
    id              BLOB PRIMARY KEY,
    meeting_id      BLOB NOT NULL,
    output_json     TEXT NOT NULL,
    synced_to_kanban INTEGER NOT NULL DEFAULT 0,
    synced_at       TEXT,
    FOREIGN KEY (meeting_id) REFERENCES refinement_meetings(id) ON DELETE CASCADE
);

CREATE INDEX idx_meeting_outputs_meeting_id ON meeting_outputs(meeting_id);
CREATE INDEX idx_meeting_outputs_synced ON meeting_outputs(synced_to_kanban);
