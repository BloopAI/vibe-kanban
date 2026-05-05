# Issue Tracker Bootstrap Checklist

Use this temporary checklist during project setup to validate issue type taxonomy.

Delete this file once all applicable checks are complete.

## Mode

- **issue_tracker**: [vibe_kanban | github | local]
- **Date**: {{ISO_DATE}}
- **Owner**: [name]

## Recommended Type Taxonomy (Non-Blocking)

Preferred type tags/labels:
- `epic`
- `story`
- `task`
- `technical-design`
- `spike`
- `bug`

## Validation

### External Trackers (`vibe_kanban`, `github`)
- [ ] Checked if preferred tags/labels exist
- [ ] Missing tags/labels created OR explicitly accepted as missing
- [ ] Fallback convention confirmed (title prefix and/or description metadata)

### Local Mode (`local`)
- [ ] Confirmed local ID convention (`EPIC-001`, `STORY-001`, `TASK-001`, `TD-001`, `SPIKE-001`)
- [ ] Confirmed local source files under `.holicode/specs/**`

## Git Hygiene (Optional)

If `.holicode` is tracked in git:
- [ ] Staged bootstrap-related updates
- [ ] Committed setup updates (optional, only if requested)
- [ ] Verified no uncommitted tracker-state changes before branch switch

## Outcome

- **Status**: [complete | partial | deferred]
- **Notes**: [short notes]

---

When completed, remove this file to reduce noise.
