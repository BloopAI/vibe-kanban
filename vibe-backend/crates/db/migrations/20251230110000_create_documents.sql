-- Create document_folders table for hierarchical folder structure
CREATE TABLE document_folders (
    id          BLOB PRIMARY KEY,
    team_id     BLOB NOT NULL,
    parent_id   BLOB,  -- NULL means root folder
    name        TEXT NOT NULL,
    icon        TEXT,
    color       TEXT,
    position    INTEGER NOT NULL DEFAULT 0,  -- For ordering within parent
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES document_folders(id) ON DELETE CASCADE
);

-- Create documents table for storing documents
CREATE TABLE documents (
    id              BLOB PRIMARY KEY,
    team_id         BLOB NOT NULL,
    folder_id       BLOB,  -- NULL means document is at root level
    title           TEXT NOT NULL,
    content         TEXT,  -- Markdown content (for .md files) or NULL for uploaded files
    file_path       TEXT,  -- Path to uploaded file (for non-markdown files)
    file_type       TEXT NOT NULL DEFAULT 'markdown',  -- 'markdown', 'pdf', 'txt', 'csv', 'xlsx'
    file_size       INTEGER,  -- Size in bytes (for uploaded files)
    mime_type       TEXT,  -- MIME type for uploaded files
    icon            TEXT,
    is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    position        INTEGER NOT NULL DEFAULT 0,  -- For ordering within folder
    created_by      TEXT,  -- User identifier
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE SET NULL
);

-- Create indexes for faster lookups
CREATE INDEX idx_document_folders_team_id ON document_folders(team_id);
CREATE INDEX idx_document_folders_parent_id ON document_folders(parent_id);
CREATE INDEX idx_documents_team_id ON documents(team_id);
CREATE INDEX idx_documents_folder_id ON documents(folder_id);
CREATE INDEX idx_documents_file_type ON documents(file_type);
CREATE INDEX idx_documents_is_pinned ON documents(is_pinned);
CREATE INDEX idx_documents_is_archived ON documents(is_archived);
