# HoliCode Specification Schema Reference

## WORK_SPEC.md (Manifest)
**Purpose:** Project-wide index and discovery entry point  
**Size Limit:** <2KB  
**Required Sections:**
- `# Work Specification: [Name]`
- `## Features` (bullet list with links)
- `## Active Stories` (bullet list with links)  
- `## Current Tasks` (bullet list with links)
- `## Completed` (optional but recommended)
- `## Implementation Status` (component references)

**Issue Reference Pattern:** `ISSUE-ID: Title (status) [Type: ...]`
Examples: `GIF-15: Create tracker integration (In progress)` or `#123: Add auth checks (Done)`

## Feature Chunks
**Filename Pattern:** `features/FEATURE-{id}.md`  
**Size Limit:** <1KB  
**Required Fields:**
- `**Status:**` [draft|active|complete]
- `**Created:**` ISO date
- `**Business Owner:**` Team/person
- `## Business Value` (paragraph)
- `## Success Metrics` (bulleted list with measurements)
- `## Scope & Constraints` (In/Out of scope)
- `## Related Stories` (links to story chunks)

## Story Chunks
**Filename Pattern:** `stories/STORY-{id}.md`  
**Size Limit:** <1KB  
**Required Structure:**
```
::: story STORY-{id}
**Feature:** [link]
**Status:** [draft|ready|active|complete]
**Priority:** [low|medium|high|critical]
**Created:** ISO date

## User Story
As a [role], I want [goal] so that [benefit].

## Acceptance Criteria
- **AC1:** [testable criterion]
- **AC2:** [testable criterion]

## Tasks
- [TASK-id](link) - Description

## Components Involved
- ComponentName → [SPEC.md](link)
:::
```

## Task Chunks
**Filename Pattern:** `tasks/TASK-{id}.md`  
**Size Limit:** <1KB  
**Required Table Fields:**
| Field | Required Values |
|-------|----------------|
| **Story** | Link to parent story |
| **Status** | [ready|active|blocked|complete] |
| **Size** | [XS|S|M|L] (XS:<1h, S:2-4h, M:4-8h, L:>8h) |
| **Components** | Component names (space-separated) |

**Required Sections:**
- `## Deliverables` (checkbox list)
- `## Technical Requirements` (bullet list)
- `## Acceptance Validation` (checkbox list)

## Component SPECs
**Filename Pattern:** `src/{component}/SPEC.md`  
**No Size Limit** (co-located with implementation)  
**Required Sections:**
- `## API Contract` (interface definitions)
- `## Data Model` (data structures)
- `## Edge Cases & Error Handling`
- `## Dependencies`
- `## Testing Strategy`
- `## Linked Specifications (Feature/Story/Task)` (backlinks)
- `## Change Log`

**Advisory:** Workflows should create/update SPEC.md per this structure and maintain change logs.
