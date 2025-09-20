# /prompt-to-wish - Living Document Workflow for Wish Creation

---
description: 🎯 Transform natural language requests into structured wishes through iterative refinement
---

## 🚀 PROMPT-TO-WISH WORKFLOW

A living document approach that evolves from initial analysis to approved wish specification.

<task_breakdown>
1. [Creation] Generate initial preparation document from user request
2. [Investigation] Update document as context is discovered
3. [Dialogue] Refine through user Q&A until all decisions made
4. [Crystallization] Transform into final wish when ready
</task_breakdown>

## Phase 1: Document Creation

### 1.1 Initial Analysis
When user provides natural language request:

```bash
/prompt-to-wish "I want to add Omni notifications for task completion"
```

**Immediately create**: `/genie/prep/wish-prep-{feature}.md`

### 1.2 Initial Document Structure

```markdown
# Wish Preparation: [Feature Name]
**Status:** INVESTIGATING
**Created:** [timestamp]
**Last Updated:** [timestamp]

<task_breakdown>
1. [Analysis] Understanding user requirements
2. [Discovery] Finding patterns in codebase
3. [Planning] Identifying architectural decisions
</task_breakdown>

<context_gathering>
Goal: [What patterns/context to find]
Status: IN_PROGRESS

Searches planned:
- [ ] Search for similar integrations
- [ ] Find UI patterns for settings
- [ ] Identify config extension points

Found patterns:
- (will be populated during investigation)

Early stop: Not yet achieved
</context_gathering>

## STATED REQUIREMENTS
(Extract from user's natural language)
- REQ-1: [First explicit requirement]
- REQ-2: [Second explicit requirement]

## EXPLORATION NEEDED
(To be populated during investigation)

## SUCCESS CRITERIA
(Initial criteria based on requirements)
✅ SC-1: [What defines success]

## NEVER DO
(Constraints discovered during investigation)
❌ ND-1: [What to avoid]

## INVESTIGATION LOG
- [timestamp] Document created from user request
- [timestamp] Starting context gathering...
```

## Phase 2: Living Document Evolution

### 2.1 During Investigation

As you search and discover patterns, **update the document**:

```markdown
<context_gathering>
Goal: Find notification patterns
Status: IN_PROGRESS

Searches planned:
- [x] Search for similar integrations
- [x] Find UI patterns for settings
- [ ] Identify config extension points

Found patterns:
- @crates/services/src/services/github/ - Similar integration (discovered 10:45am)
- @frontend/src/components/GitHubLoginDialog.tsx - Modal pattern (discovered 10:47am)

Early stop: 70% patterns identified
</context_gathering>

## EXPLORATION NEEDED
(Updated as gaps are discovered)

### Architecture Decision (discovered during investigation)
DEC-1: How to integrate Omni service?
- **Option A**: Extend GitHub pattern (investigating feasibility...)
- **Option B**: [to be determined]

## INVESTIGATION LOG
- [10:43] Document created
- [10:45] Found GitHub integration pattern
- [10:47] Found modal UI pattern
- [10:48] Identified architecture decision needed
```

### 2.2 During User Dialogue

When user answers questions, **update with confirmed decisions**:

```markdown
## EXPLORATION NEEDED
### Architecture Decision
DEC-1: How to integrate Omni service?
- ~~Option A: Extend GitHub pattern~~
- ~~Option B: Plugin system~~

## CONFIRMED DECISIONS
- DEC-1: Will extend GitHub pattern (confirmed by user 11:02am)
- ASM-1: Notifications on both success/failure (confirmed 11:03am)

## INVESTIGATION LOG
- [10:43] Document created
- [10:48] Identified architecture decision needed
- [11:02] User confirmed GitHub pattern approach
- [11:03] User confirmed dual notification triggers
```

## Phase 3: Readiness Check

### 3.1 Completion Criteria

Document is ready for wish transformation when:

```markdown
**Status:** READY_FOR_WISH

Checklist:
✅ All REQ-* items captured
✅ All DEC-* items resolved
✅ All ASM-* items confirmed
✅ All @ context references found
✅ Success criteria complete
✅ Never-do boundaries defined
```

### 3.2 Transform to Wish

When ready, generate final wish document at `/genie/wishes/{feature}-wish.md`

## Usage Examples

### Example 1: Simple Request

```bash
User: /prompt-to-wish "add dark mode toggle to settings"

System: Created /genie/prep/wish-prep-dark-mode.md
[Shows initial document with REQ-1: Add dark mode toggle]

[After investigation]
System: Updated - found existing theme system at @frontend/src/theme
System: Question - DEC-1: Extend existing theme or new system?

User: Extend existing

System: Updated - DEC-1 confirmed
System: Ready for wish creation? All decisions resolved.

User: Yes

System: Created /genie/wishes/dark-mode-wish.md
```

### Example 2: Complex Request

```bash
User: /prompt-to-wish "implement per-agent MCP tool selection"

System: Created /genie/prep/wish-prep-mcp-tools.md
[Initial document with multiple REQ items]

[Multiple investigation cycles]
System: Found 3 integration points, need 5 decisions...

[Multiple Q&A rounds]
System: DEC-1 through DEC-5 confirmed
System: ASM-1 through ASM-3 validated
System: Ready for wish creation

User: Create wish

System: Created /genie/wishes/mcp-tool-selection-wish.md
```

## Key Benefits

1. **Traceability**: Every decision linked to investigation
2. **Transparency**: User sees evolution of understanding
3. **Flexibility**: Can pause/resume at any point
4. **Validation**: Nothing lost between phases
5. **Living Record**: Complete history of how wish was formed

## Implementation Notes

<persistence>
- Always update the same document file
- Never lose investigation context
- Show document status after each update
- Allow user to review document at any time
</persistence>

<never_do>
❌ Create wish without all decisions resolved
❌ Skip investigation updates
❌ Lose document history
❌ Make assumptions without confirmation
</never_do>

## Commands Flow

```mermaid
graph LR
    A[Natural Request] --> B[/prompt-to-wish]
    B --> C[Living Document]
    C --> D[Investigation Updates]
    D --> E[User Dialogue]
    E --> C
    C --> F{All Resolved?}
    F -->|No| D
    F -->|Yes| G[/wish-agent]
    G --> H[Final Wish]
    H --> I[/forge]
```

## Status Lifecycle

1. **INVESTIGATING** - Initial analysis and context gathering
2. **NEEDS_DECISIONS** - Found gaps, need user input
3. **CONFIRMING** - Getting user confirmation on decisions
4. **READY_FOR_WISH** - All decisions made, can create wish
5. **WISH_CREATED** - Final wish document generated

---

**Remember**: The document is ALIVE throughout the process. Every investigation, every decision, every confirmation updates the same document until it becomes the perfect wish specification.