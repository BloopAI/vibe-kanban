# Work Specification: [Project Name]

**Status:** [draft | active | completed]  
**Created:** {{ISO_DATE}}  
**Last Updated:** {{ISO_DATE}}  
**Total Context Size:** <2KB (optimized for AI context loading)

## Issue Tracker
**This file is a LOCAL CACHE of issue tracker state.**
- The configured issue tracker is the single source of truth for task management
- Run `issue-sync` skill to refresh this cache from the configured tracker in `.holicode/state/techContext.md`
- All task creation, updates, and tracking happens in the tracker
- If `issue_tracker: local`, this file plus `.holicode/specs/**` become the local source of truth and sync is typically a consistency/noop pass
- Local specs in `.holicode/specs/` are for technical details only

## Project Overview
[Brief one-line description of the project and its primary goal]

## Features (Epics)
<!-- Issue tracker epics linked here by issue-sync skill -->
<!-- Example (VK): - GIF-1: Improve onboarding conversion (In progress) [Type: epic] -->
<!-- Example (GitHub): - #123: Improve onboarding conversion (In progress) [Type: epic] -->

## Active Stories
<!-- Issue tracker stories linked here by issue-sync skill -->
<!-- Example: - GIF-5: User can complete signup flow (To do) [Type: story, Parent: GIF-1] -->

## Current Tasks
<!-- Issue tracker tasks linked here by issue-sync skill -->
<!-- Example: - GIF-10: Implement email verification API (To do) [Type: task, Story: GIF-5] -->

## Completed
<!-- Completed issues linked here by issue-sync skill -->

## Technical Design Documents
<!-- TD tracker summaries and local TD paths linked here by issue-sync skill -->
<!-- Example: - GIF-12: TD-001 System Architecture (Done) [Local: .holicode/specs/technical-design/TD-001.md] -->

## Implementation Status
### Completed Components
<!-- Example: - API/Auth: Signup + verification complete -->

### In Progress Components
<!-- Example: - API/Payments: webhook hardening in progress -->

### Planned Components
<!-- Example: - Web/Checkout: gift card purchase flow -->

## Hierarchy Map
```
├── Epic (Business Value)
│   ├── Story (User Requirements)
│   │   └── Task (Implementation Work)
│   │       └── Component SPECs (Live Implementation Specs)
└── TD Summary Issue (Technical Design)
    └── Local TD File (Detailed Design)
```

## Context Optimization Notes
- **Tracker First**: All tasks are primarily managed in the configured issue tracker
- **Local Cache**: This file is a reference cache updated by tracker sync workflows
- **Component SPECs**: Technical contracts remain co-located with code in `src/**/SPEC.md`
- **ID References**: Use native tracker IDs (e.g. `GIF-15` or `#123`)

## Validation Status
- [ ] All chunks validate against .holicode/specs/SCHEMA.md
- [ ] Hierarchical links resolve correctly
- [ ] No orphaned specifications
- [ ] Component SPECs exist for all referenced components

---
*This manifest is a LOCAL CACHE maintained by HoliCode workflows.*
*The configured issue tracker is the PRIMARY source of truth.*
