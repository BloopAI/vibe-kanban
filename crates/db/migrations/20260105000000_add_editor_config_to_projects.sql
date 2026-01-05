-- Add per-project editor configuration override
-- When set, this overrides the global editor settings for this specific project
-- Stored as JSON with format: {"editor_type": "VS_CODE", "custom_command": null}
ALTER TABLE projects ADD COLUMN editor_config TEXT DEFAULT NULL;
