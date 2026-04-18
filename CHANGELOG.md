# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Activity API now accepts `swarm_project_id` parameter for swarm project queries
- New `ensure_swarm_project_access()` function for swarm project access control
- Database columns: `swarm_project_id` added to `shared_tasks`, `activity`, `project_activity_counters`
- New `fetch_since_by_swarm_project()` method to ActivityRepository for efficient swarm project queries
- API documentation for activity endpoint with migration guide
- Default `PLAN` variant for Codex agent profiles

### Deprecated
- Activity API `project_id` parameter deprecated in favor of `swarm_project_id`
- Will be removed in version 2.0 (Q3 2026)

### Changed
- Activity queries can now filter by swarm project instead of legacy project
- Access control uses `swarm_projects` table instead of `projects`
- Architecture documentation updated to reflect `swarm_projects` as canonical source of truth
- Codex executor now uses the v2 app-server thread/turn protocol instead of the legacy conversation API
