-- Discovery Module: Upstream planning and feedback loop
-- Adds discovery items (scenarios, specs, stories) and feedback entries

-- Discovery items represent pre-task work: scenarios, specs, user stories, spikes
CREATE TABLE discovery_items (
    id                  BLOB PRIMARY KEY,
    project_id          BLOB NOT NULL,
    title               TEXT NOT NULL,
    item_type           TEXT NOT NULL DEFAULT 'scenario'
                           CHECK (item_type IN ('scenario', 'spec', 'story', 'spike')),
    status              TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'refining', 'ready', 'promoted', 'archived')),
    content             TEXT NOT NULL DEFAULT '',
    acceptance_criteria TEXT,
    effort_estimate     TEXT,  -- JSON: { "value": 3, "unit": "hours", "confidence": "medium" }
    priority            INTEGER,
    promoted_task_id    BLOB,  -- FK to task when promoted
    parent_id           BLOB,  -- Hierarchical discovery items
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (promoted_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_id) REFERENCES discovery_items(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX idx_discovery_items_project_id ON discovery_items(project_id);
CREATE INDEX idx_discovery_items_status ON discovery_items(status);
CREATE INDEX idx_discovery_items_promoted_task_id ON discovery_items(promoted_task_id);

-- Feedback entries: learnings from execution and deployment
CREATE TABLE feedback_entries (
    id                  BLOB PRIMARY KEY,
    task_id             BLOB,  -- Optional: feedback about a specific task
    discovery_item_id   BLOB,  -- Optional: feedback about a discovery item
    feedback_type       TEXT NOT NULL DEFAULT 'execution'
                           CHECK (feedback_type IN ('execution', 'deploy', 'user', 'system')),
    content             TEXT NOT NULL,  -- JSON structured content
    summary             TEXT,  -- Human-readable summary/learning
    source_execution_id BLOB,  -- Optional: link to execution_process that generated this
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (discovery_item_id) REFERENCES discovery_items(id) ON DELETE CASCADE,
    FOREIGN KEY (source_execution_id) REFERENCES execution_processes(id) ON DELETE SET NULL,
    -- At least one of task_id or discovery_item_id should be set
    CHECK (task_id IS NOT NULL OR discovery_item_id IS NOT NULL)
);

CREATE INDEX idx_feedback_entries_task_id ON feedback_entries(task_id);
CREATE INDEX idx_feedback_entries_discovery_item_id ON feedback_entries(discovery_item_id);
CREATE INDEX idx_feedback_entries_created_at ON feedback_entries(created_at);

-- Link table for related work (tasks or discovery items that are related)
CREATE TABLE discovery_relations (
    id              BLOB PRIMARY KEY,
    source_type     TEXT NOT NULL CHECK (source_type IN ('task', 'discovery_item')),
    source_id       BLOB NOT NULL,
    target_type     TEXT NOT NULL CHECK (target_type IN ('task', 'discovery_item')),
    target_id       BLOB NOT NULL,
    relation_type   TEXT NOT NULL DEFAULT 'related'
                       CHECK (relation_type IN ('related', 'blocks', 'blocked_by', 'duplicates', 'parent', 'child')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    -- Prevent duplicate relations
    UNIQUE(source_type, source_id, target_type, target_id, relation_type)
);

CREATE INDEX idx_discovery_relations_source ON discovery_relations(source_type, source_id);
CREATE INDEX idx_discovery_relations_target ON discovery_relations(target_type, target_id);

-- Add discovery_item_id to tasks for backlink when promoted
ALTER TABLE tasks ADD COLUMN discovery_item_id BLOB REFERENCES discovery_items(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_discovery_item_id ON tasks(discovery_item_id);
