-- GitHub Project連携設定テーブル
CREATE TABLE github_project_links (
    id                  BLOB PRIMARY KEY,
    project_id          BLOB NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    github_project_id   TEXT NOT NULL,  -- Node ID (PVT_kwXXX)
    github_owner        TEXT NOT NULL,
    github_repo         TEXT,           -- NULL for organization-level projects
    sync_enabled        INTEGER NOT NULL DEFAULT 1,
    last_sync_at        TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(project_id, github_project_id)
);
CREATE INDEX idx_github_project_links_project_id ON github_project_links(project_id);
CREATE INDEX idx_github_project_links_github_project_id ON github_project_links(github_project_id);

-- Issue/Taskマッピングテーブル
CREATE TABLE github_issue_mappings (
    id                      BLOB PRIMARY KEY,
    task_id                 BLOB NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    github_project_link_id  BLOB NOT NULL REFERENCES github_project_links(id) ON DELETE CASCADE,
    github_issue_number     INTEGER NOT NULL,
    github_issue_id         TEXT NOT NULL,   -- Node ID
    github_issue_url        TEXT NOT NULL,
    sync_direction          TEXT NOT NULL DEFAULT 'bidirectional' CHECK(sync_direction IN ('bidirectional', 'github_to_vibe', 'vibe_to_github')),
    last_synced_at          TEXT,
    github_updated_at       TEXT,
    vibe_updated_at         TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(task_id, github_project_link_id),
    UNIQUE(github_project_link_id, github_issue_number)
);
CREATE INDEX idx_github_issue_mappings_task_id ON github_issue_mappings(task_id);
CREATE INDEX idx_github_issue_mappings_link_id ON github_issue_mappings(github_project_link_id);

-- カスタムプロパティテーブル（将来の拡張用）
CREATE TABLE task_properties (
    id              BLOB PRIMARY KEY,
    task_id         BLOB NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    property_name   TEXT NOT NULL,  -- 'milestone', 'priority', 'labels', etc.
    property_value  TEXT NOT NULL,  -- JSON形式
    source          TEXT NOT NULL DEFAULT 'vibe' CHECK(source IN ('vibe', 'github')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(task_id, property_name)
);
CREATE INDEX idx_task_properties_task_id ON task_properties(task_id);
