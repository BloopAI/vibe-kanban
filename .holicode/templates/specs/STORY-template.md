# STORY-[ID]: [Story Title]

<!-- NOTE: This is a LOCAL REFERENCE template. 
     Primary story management happens in the configured issue tracker.
     Use this template only when creating local technical specs. -->

**Issue:** [GIF-xxx or #xxx - Link to tracker story issue]  
**Parent Epic:** [GIF-yyy or #yyy - Link to tracker epic issue]  
**Status:** active  
**Priority:** [high/medium/low]  
**Created:** {{ISO_DATE}}  

## User Story
As a [user], I want [goal] so that [benefit].

## Acceptance Criteria
<!-- Use Given/When/Then format - mirrors tracker issue -->
### Scenario 1: [Name]
**GIVEN** [context]  
**WHEN** [action]  
**THEN** [outcome]  

### Scenario 2: [Name]  
**GIVEN** [context]  
**WHEN** [action]  
**THEN** [outcome]  

## Components
<!-- Components affected - these remain LOCAL -->
- `src/[component]/SPEC.md`

## Tasks
<!-- Tracker task issues linked here when created -->
- [Issue GIF-xxx or #xxx - Task 1]
- [Issue GIF-yyy or #yyy - Task 2]

---
*Primary story tracking happens in the configured issue tracker. This template is for local technical reference only.*
*Run `issue-sync` skill to sync tracker state to this local cache.*
